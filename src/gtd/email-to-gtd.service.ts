import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GtdIdentityProvider } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailRuleEffects } from '../services/email-executor.service';
import { GtdAuthService } from './gtd-auth.service';
import { GtdService } from './gtd.service';
import { GTD_EMAIL_TITLE_MAX } from './gtd-text';

const TIMEOUT_MS = 30_000;
const BODY_LIMIT = 12_000;

type FormulatedTask = { content: string; context: string };

@Injectable()
export class EmailToGtdService {
  private readonly logger = new Logger(EmailToGtdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gtd: GtdService,
    private readonly gtdAuth: GtdAuthService,
  ) {}

  async createFromGoogleEmail(messageId: number, email: string) {
    const auth = await this.gtdAuth.findIdentity(
      GtdIdentityProvider.GOOGLE,
      email.trim().toLowerCase(),
    );
    if (!auth) {
      throw new BadRequestException(
        'GTD workspace not found — открой /gtd один раз',
      );
    }
    return this.createFromMessage(messageId, auth.workspaceId, 'manual');
  }

  async maybeCreateFromEffects(
    messageId: number,
    effects: EmailRuleEffects,
    ruleId?: number,
  ) {
    if (!effects.createGtdTask) return null;
    const workspaceId = await this.resolveOwnerWorkspaceId();
    if (!workspaceId) {
      this.logger.warn(
        `Skip createGtdTask for message ${messageId}: no owner GTD workspace`,
      );
      return null;
    }
    try {
      return await this.createFromMessage(
        messageId,
        workspaceId,
        'rule',
        ruleId,
      );
    } catch (error) {
      this.logger.warn(
        `createGtdTask failed for message ${messageId}: ${String(error)}`,
      );
      return null;
    }
  }

  async createFromMessage(
    messageId: number,
    workspaceId: string,
    source: 'manual' | 'rule' = 'manual',
    ruleId?: number,
  ) {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');

    if (message.gtdTaskId) {
      const existing = await this.prisma.gtdTask.findFirst({
        where: { id: message.gtdTaskId, workspaceId },
        include: { project: true, attachments: true },
      });
      if (existing) {
        return {
          created: false,
          task: this.gtd.serializeTask(existing),
        };
      }
    }

    const formulated = await this.formulate(message);
    const task = await this.gtd.createTask(
      workspaceId,
      formulated.content,
      undefined,
      undefined,
      { name: this.contextName(message), text: formulated.context },
    );

    await this.prisma.emailMessage.update({
      where: { id: messageId },
      data: { gtdTaskId: task.id },
    });
    await this.prisma.emailActionLog.create({
      data: {
        messageId,
        action: 'create_gtd_task',
        param: task.id,
        source,
        ruleId,
        prevState: { gtdTaskId: null },
        result: 'ok',
      },
    });

    return { created: true, task };
  }

  parseFormulation(raw: string): FormulatedTask {
    let parsed: { content?: unknown; context?: unknown };
    try {
      parsed = JSON.parse(raw) as { content?: unknown; context?: unknown };
    } catch {
      throw new BadRequestException('LLM returned non-JSON task');
    }
    const content =
      typeof parsed.content === 'string' ? parsed.content.trim() : '';
    const context =
      typeof parsed.context === 'string' ? parsed.context.trim() : '';
    if (!content) throw new BadRequestException('LLM returned empty content');
    return {
      content: content.slice(0, GTD_EMAIL_TITLE_MAX),
      context: context || content,
    };
  }

  private async resolveOwnerWorkspaceId(): Promise<string | null> {
    const emails = (this.config.get<string>('ALLOWED_GOOGLE_EMAILS') || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    for (const email of emails) {
      const identity = await this.gtdAuth.findIdentity(
        GtdIdentityProvider.GOOGLE,
        email,
      );
      if (identity) return identity.workspaceId;
    }
    const chatId = (this.config.get<string>('TELEGRAM_OWNER_CHAT_ID') || '').trim();
    if (/^\d+$/.test(chatId)) {
      const identity = await this.gtdAuth.findIdentity(
        GtdIdentityProvider.TELEGRAM,
        chatId,
      );
      if (identity) return identity.workspaceId;
    }
    return null;
  }

  private async formulate(message: {
    fromName: string | null;
    fromAddress: string | null;
    subject: string | null;
    date: Date | null;
    bodyText: string | null;
  }): Promise<FormulatedTask> {
    const fallback = this.fallbackFormulation(message);
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) return fallback;

    const model =
      this.config.get<string>('EMAIL_LLM_MODEL') || 'gpt-5-mini';
    const body = (message.bodyText || '').slice(0, BODY_LIMIT);
    const prompt = [
      'Сформулируй одну GTD-задачу по письму.',
      `content — короткое действие на русском, до ${GTD_EMAIL_TITLE_MAX} символов, без темы письма целиком.`,
      'context — markdown: отправитель, тема, дата и суть письма (можно цитаты). Не выдумывай фактов.',
      'Ответь строго JSON: {"content":"...","context":"..."}.',
      '',
      `Отправитель: ${message.fromName || ''} <${message.fromAddress || ''}>`,
      `Тема: ${message.subject || ''}`,
      `Дата: ${message.date?.toISOString() || ''}`,
      `Текст: ${body || '—'}`,
    ].join('\n');

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_completion_tokens: 800,
            reasoning_effort: 'minimal',
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`Email→GTD LLM error: ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('empty LLM content');
      return this.parseFormulation(content);
    } catch (error) {
      this.logger.warn(`Email→GTD LLM failed, using fallback: ${String(error)}`);
      return fallback;
    }
  }

  private fallbackFormulation(message: {
    fromName: string | null;
    fromAddress: string | null;
    subject: string | null;
    date: Date | null;
    bodyText: string | null;
  }): FormulatedTask {
    const subject = (message.subject || '').trim() || 'Письмо без темы';
    const from = `${message.fromName || ''} <${message.fromAddress || ''}>`.trim();
    return {
      content: subject.slice(0, GTD_EMAIL_TITLE_MAX),
      context: [
        `От: ${from}`,
        `Тема: ${subject}`,
        message.date ? `Дата: ${message.date.toISOString()}` : null,
        '',
        (message.bodyText || '').trim() || '—',
      ]
        .filter((line) => line !== null)
        .join('\n'),
    };
  }

  private contextName(message: { subject: string | null }): string {
    const subject = (message.subject || 'письмо').trim() || 'письмо';
    return `${subject.slice(0, 80)}.md`;
  }
}
