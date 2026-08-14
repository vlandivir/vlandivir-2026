import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleSessionGuard } from './auth/google-session.guard';
import { PrismaService } from './prisma/prisma.service';
import { EmailIngestService } from './services/email-ingest.service';
import {
  EmailAction,
  EmailExecutorService,
  EmailRuleEffects,
} from './services/email-executor.service';
import { EmailClassifierService } from './services/email-classifier.service';
import { EmailRulesRunnerService } from './services/email-rules-runner.service';
import { gmailOpenUrl, parseEmailAccounts } from './services/email-accounts';

type RuleBody = {
  condition?: string;
  effects?: EmailRuleEffects;
  accounts?: string[];
  enabled?: boolean;
  priority?: number;
};

const LIST_LIMIT = 500;

const ALLOWED_ACTIONS: EmailAction[] = [
  'mark_read',
  'mark_unread',
  'archive',
  'unarchive',
  'hide',
  'unhide',
  'mark_important',
  'unmark_important',
  'label',
  'unlabel',
];

// Read-only dashboard API for the email pipeline (page: /email). Session
// only — unlike map/reels there is no machine-key use case here yet.
@UseGuards(GoogleSessionGuard)
@Controller('email-api')
export class EmailApiController {
  private readonly accountEmails: Map<string, string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailIngestService: EmailIngestService,
    private readonly emailExecutorService: EmailExecutorService,
    private readonly emailClassifierService: EmailClassifierService,
    private readonly emailRulesRunnerService: EmailRulesRunnerService,
    configService: ConfigService,
  ) {
    this.accountEmails = new Map(
      parseEmailAccounts(configService.get<string>('EMAIL_ACCOUNTS')).map(
        (account) => [account.name, account.user],
      ),
    );
  }

  // Per-account counters + cursor state for the stats cards
  @Get('stats')
  async stats() {
    const [states, counts, unseen, lastMessages] = await Promise.all([
      this.prisma.emailSyncState.findMany({ orderBy: { account: 'asc' } }),
      this.prisma.emailMessage.groupBy({
        by: ['account', 'status'],
        _count: { _all: true },
      }),
      this.prisma.emailMessage.groupBy({
        by: ['account'],
        where: { seen: false },
        _count: { _all: true },
      }),
      this.prisma.emailMessage.groupBy({
        by: ['account'],
        _max: { date: true },
      }),
    ]);

    const accounts = states.map((state) => {
      const statuses: Record<string, number> = {};
      let total = 0;
      for (const row of counts) {
        if (row.account !== state.account) continue;
        statuses[row.status] = row._count._all;
        total += row._count._all;
      }
      return {
        account: state.account,
        mailbox: state.mailbox,
        lastUid: String(state.lastUid),
        syncedAt: state.updatedAt,
        total,
        statuses,
        unseen:
          unseen.find((row) => row.account === state.account)?._count._all ?? 0,
        lastMessageAt:
          lastMessages.find((row) => row.account === state.account)?._max
            .date ?? null,
      };
    });

    return { accounts };
  }

  // Latest messages; filtering happens client-side on this window
  @Get('messages')
  async messages(@Query('limit') limit: string | undefined) {
    const take = Math.min(Number(limit) || LIST_LIMIT, LIST_LIMIT);
    const messages = await this.prisma.emailMessage.findMany({
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        account: true,
        threadId: true,
        fromAddress: true,
        fromName: true,
        subject: true,
        date: true,
        snippet: true,
        labels: true,
        seen: true,
        archived: true,
        hidden: true,
        important: true,
        hasAttachments: true,
        status: true,
      },
    });
    return { messages };
  }

  // Distinct Gmail labels seen across messages, for the label picker
  @Get('labels')
  async labels() {
    const rows = await this.prisma.$queryRaw<{ label: string }[]>`
      SELECT DISTINCT unnest(labels) AS label FROM "EmailMessage" ORDER BY label
    `;
    return { labels: rows.map((row) => row.label) };
  }

  // Apply a reversible action to a message (manual, from the dashboard)
  @Post('messages/:id/action')
  async action(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { action?: string; param?: string },
  ) {
    const action = body.action as EmailAction;
    if (!ALLOWED_ACTIONS.includes(action)) {
      throw new BadRequestException(`Unknown action: ${body.action}`);
    }
    const updated = await this.emailExecutorService.apply(
      id,
      action,
      body.param,
    );
    return {
      id: updated.id,
      seen: updated.seen,
      archived: updated.archived,
      hidden: updated.hidden,
      important: updated.important,
      labels: updated.labels,
    };
  }

  @Get('messages/:id')
  async message(@Param('id', ParseIntPipe) id: number) {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id },
      select: {
        id: true,
        account: true,
        gmMsgId: true,
        threadId: true,
        mailbox: true,
        messageId: true,
        fromAddress: true,
        fromName: true,
        toAddresses: true,
        ccAddresses: true,
        subject: true,
        date: true,
        bodyText: true,
        bodyHtml: true,
        labels: true,
        seen: true,
        archived: true,
        hidden: true,
        important: true,
        hasAttachments: true,
        sizeBytes: true,
        status: true,
        rawKey: true,
        attachments: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            inline: true,
          },
        },
        thread: {
          select: {
            id: true,
            gmThreadId: true,
            subject: true,
            messages: {
              orderBy: { date: 'asc' },
              select: {
                id: true,
                fromAddress: true,
                subject: true,
                date: true,
                seen: true,
              },
            },
          },
        },
      },
    });
    if (!message) throw new NotFoundException('Message not found');

    // Older rows only stored the text/plain part; recover HTML from the .eml.
    let bodyHtml = message.bodyHtml;
    if (!bodyHtml && message.rawKey) {
      bodyHtml = await this.emailIngestService.ensureBodyHtml(message.id);
    }

    const accountEmail = this.accountEmails.get(message.account);
    // Prefer the conversation id — Gmail's #all/<hex> opens the thread.
    const gmailUrl = accountEmail
      ? gmailOpenUrl(accountEmail, message.thread.gmThreadId || message.gmMsgId)
      : null;
    // Strip gmMsgId from the API response (used only for gmailUrl above).
    const { gmMsgId, rawKey, ...rest } = message;
    void gmMsgId;
    void rawKey;
    return { ...rest, bodyHtml, gmailUrl };
  }

  // --- Rules catalog ---

  @Get('rules')
  async rules() {
    const rules = await this.prisma.emailRule.findMany({
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    });
    return { rules };
  }

  @Post('rules')
  async createRule(@Body() body: RuleBody) {
    const condition = body.condition?.trim();
    if (!condition) {
      throw new BadRequestException('condition is required');
    }
    const rule = await this.prisma.emailRule.create({
      data: {
        condition,
        effects: this.normalizeEffects(body.effects),
        accounts: Array.isArray(body.accounts) ? body.accounts : [],
        enabled: body.enabled ?? true,
        priority: Number.isInteger(body.priority) ? body.priority! : 0,
      },
    });
    return rule;
  }

  @Post('rules/:id')
  async updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RuleBody,
  ) {
    const existing = await this.prisma.emailRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rule not found');

    const data: Record<string, unknown> = {};
    if (body.condition !== undefined) data.condition = body.condition.trim();
    if (body.effects !== undefined) {
      data.effects = this.normalizeEffects(body.effects);
    }
    if (body.accounts !== undefined) {
      data.accounts = Array.isArray(body.accounts) ? body.accounts : [];
    }
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.priority !== undefined) data.priority = body.priority;

    return this.prisma.emailRule.update({ where: { id }, data });
  }

  @Delete('rules/:id')
  async deleteRule(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.emailRule.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Rule not found');
    });
    return { deleted: true };
  }

  // Force-apply a rule's effects (bypasses the classifier). Auto-apply on
  // sync goes through EmailRulesRunnerService instead.
  @Post('messages/:id/apply-rule')
  async applyRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { ruleId?: number },
  ) {
    if (!Number.isInteger(body.ruleId)) {
      throw new BadRequestException('ruleId is required');
    }
    const rule = await this.prisma.emailRule.findUnique({
      where: { id: body.ruleId },
    });
    if (!rule) throw new NotFoundException('Rule not found');

    const updated = await this.emailExecutorService.applyEffects(
      id,
      rule.effects as EmailRuleEffects,
      rule.id,
    );
    await this.prisma.emailRule.update({
      where: { id: rule.id },
      data: { matchCount: { increment: 1 }, lastMatchedAt: new Date() },
    });
    await this.prisma.emailMessage.update({
      where: { id },
      data: { status: 'classified' },
    });
    return {
      id: updated?.id,
      seen: updated?.seen,
      archived: updated?.archived,
      hidden: updated?.hidden,
      important: updated?.important,
      labels: updated?.labels,
      status: 'classified',
    };
  }

  // Classify + auto-apply for one message (same path as the post-sync runner).
  @Post('messages/:id/process-rules')
  async processRules(@Param('id', ParseIntPipe) id: number) {
    const existing = await this.prisma.emailMessage.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Message not found');
    const result = await this.emailRulesRunnerService.processMessage(id);
    const [message, matchedRule] = await Promise.all([
      this.prisma.emailMessage.findUnique({
        where: { id },
        select: {
          id: true,
          seen: true,
          archived: true,
          hidden: true,
          important: true,
          labels: true,
          status: true,
        },
      }),
      result.matchedRuleId
        ? this.prisma.emailRule.findUnique({
            where: { id: result.matchedRuleId },
            select: { condition: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      ...result,
      matchedRuleCondition: matchedRule?.condition ?? null,
      message,
    };
  }

  // Dry-run: which enabled rule (if any) would match this message. Evaluates
  // the LLM classifier without applying any effects.
  @Post('messages/:id/test-rules')
  async testRules(@Param('id', ParseIntPipe) id: number) {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id },
      select: {
        fromName: true,
        fromAddress: true,
        subject: true,
        bodyText: true,
        labels: true,
      },
    });
    if (!message) throw new NotFoundException('Message not found');

    const rules = await this.prisma.emailRule.findMany({
      where: { enabled: true },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
      select: { id: true, condition: true, priority: true },
    });

    const result = await this.emailClassifierService.evaluate(message, rules);
    const matched = result.matchedRuleId
      ? rules.find((rule) => rule.id === result.matchedRuleId)
      : null;

    return {
      matchedRuleId: result.matchedRuleId,
      matchedRuleCondition: matched?.condition ?? null,
      confidence: result.confidence,
      reasoning: result.reasoning,
      rulesTested: rules.length,
    };
  }

  // Recent action journal (manual + rule), newest first, with the subject
  // and the triggering rule's condition when source=rule.
  @Get('log')
  async log(@Query('limit') limit: string | undefined) {
    const take = Math.min(Number(limit) || 100, 200);
    const entries = await this.prisma.emailActionLog.findMany({
      take,
      orderBy: { id: 'desc' },
      include: {
        message: { select: { id: true, subject: true, account: true } },
      },
    });
    const ruleIds = [
      ...new Set(
        entries
          .map((entry) => entry.ruleId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ];
    const rules =
      ruleIds.length > 0
        ? await this.prisma.emailRule.findMany({
            where: { id: { in: ruleIds } },
            select: { id: true, condition: true },
          })
        : [];
    const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
    return {
      entries: entries.map((entry) => ({
        ...entry,
        rule: entry.ruleId ? (ruleById.get(entry.ruleId) ?? null) : null,
      })),
    };
  }

  private normalizeEffects(effects?: EmailRuleEffects): EmailRuleEffects {
    if (!effects || typeof effects !== 'object') return {};
    const normalized: EmailRuleEffects = {};
    if (effects.markRead) normalized.markRead = true;
    if (effects.archive) normalized.archive = true;
    if (effects.hide) normalized.hide = true;
    if (typeof effects.label === 'string' && effects.label.trim()) {
      normalized.label = effects.label.trim();
    }
    return normalized;
  }

  // Manual sync round for all configured accounts; the poller keeps running
  // on its own schedule regardless. Also classifies status=new messages.
  @Post('sync')
  async sync() {
    return this.emailIngestService.syncAll();
  }
}
