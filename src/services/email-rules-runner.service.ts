import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailClassifierService } from './email-classifier.service';
import {
  EmailExecutorService,
  EmailRuleEffects,
} from './email-executor.service';

export type RuleProcessResult = {
  messageId: number;
  status: 'classified' | 'error';
  matchedRuleId: number | null;
  confidence: number;
  applied: boolean;
  reasoning: string;
  error?: string;
};

export type ProcessPendingSummary = {
  processed: number;
  applied: number;
  errors: number;
};

// High bar: false archives are worse than leaving mail in the inbox.
const DEFAULT_CONFIDENCE = 0.9;
const PENDING_BATCH = 50;

// Runs the LLM classifier against enabled rules and applies effects when the
// match is confident enough. Ingest leaves messages as status=new; this
// service turns them into classified (or error) and is the only place that
// auto-applies rule effects.
@Injectable()
export class EmailRulesRunnerService {
  private readonly logger = new Logger(EmailRulesRunnerService.name);
  private readonly confidenceThreshold: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly classifier: EmailClassifierService,
    private readonly executor: EmailExecutorService,
  ) {
    const raw = Number(
      this.configService.get<string>('EMAIL_RULE_CONFIDENCE') ||
        DEFAULT_CONFIDENCE,
    );
    this.confidenceThreshold =
      Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_CONFIDENCE;
  }

  async processPending(limit = PENDING_BATCH): Promise<ProcessPendingSummary> {
    const pending = await this.prisma.emailMessage.findMany({
      where: { status: 'new' },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), PENDING_BATCH),
      select: { id: true },
    });

    let applied = 0;
    let errors = 0;
    for (const row of pending) {
      const result = await this.processMessage(row.id);
      if (result.status === 'error') errors += 1;
      else if (result.applied) applied += 1;
    }

    if (pending.length > 0) {
      this.logger.log(
        `Rules runner: ${pending.length} processed, ${applied} applied, ${errors} errors`,
      );
    }

    return { processed: pending.length, applied, errors };
  }

  async processMessage(messageId: number): Promise<RuleProcessResult> {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        account: true,
        fromName: true,
        fromAddress: true,
        subject: true,
        bodyText: true,
        labels: true,
        status: true,
      },
    });
    if (!message) {
      return {
        messageId,
        status: 'error',
        matchedRuleId: null,
        confidence: 0,
        applied: false,
        reasoning: '',
        error: 'Message not found',
      };
    }

    try {
      const rules = await this.prisma.emailRule.findMany({
        where: { enabled: true },
        orderBy: [{ priority: 'desc' }, { id: 'asc' }],
      });
      const applicable = rules.filter(
        (rule) =>
          rule.accounts.length === 0 || rule.accounts.includes(message.account),
      );

      const evaluation = await this.classifier.evaluate(
        {
          fromName: message.fromName,
          fromAddress: message.fromAddress,
          subject: message.subject,
          bodyText: message.bodyText,
          labels: message.labels,
        },
        applicable.map((rule) => ({
          id: rule.id,
          condition: rule.condition,
          priority: rule.priority,
        })),
      );

      const matched = evaluation.matchedRuleId
        ? applicable.find((rule) => rule.id === evaluation.matchedRuleId)
        : null;
      const confident =
        Boolean(matched) && evaluation.confidence >= this.confidenceThreshold;
      let applied = false;

      if (confident && matched) {
        await this.executor.applyEffects(
          messageId,
          matched.effects as EmailRuleEffects,
          matched.id,
        );
        await this.prisma.emailRule.update({
          where: { id: matched.id },
          data: { matchCount: { increment: 1 }, lastMatchedAt: new Date() },
        });
        applied = true;
      }

      await this.prisma.emailMessage.update({
        where: { id: messageId },
        data: { status: 'classified' },
      });

      return {
        messageId,
        status: 'classified',
        matchedRuleId: matched?.id ?? null,
        confidence: evaluation.confidence,
        applied,
        reasoning: evaluation.reasoning,
      };
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Rules runner failed for message ${messageId}: ${messageText}`,
      );
      await this.prisma.emailMessage
        .update({
          where: { id: messageId },
          data: { status: 'error' },
        })
        .catch(() => undefined);
      return {
        messageId,
        status: 'error',
        matchedRuleId: null,
        confidence: 0,
        applied: false,
        reasoning: '',
        error: messageText,
      };
    }
  }
}
