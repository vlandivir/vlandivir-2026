import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow, FetchMessageObject, MailboxObject } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import {
  EMAIL_MAILBOX,
  EmailAccountConfig,
  parseEmailAccounts,
  withMailbox,
} from './email-accounts';
import {
  EmailRulesRunnerService,
  ProcessPendingSummary,
} from './email-rules-runner.service';
import {
  InboxPresence,
  LocalInboxMessage,
  chunkItems,
  messagesGoneFromInbox,
} from './email-gone';

export type { EmailAccountConfig } from './email-accounts';

export type AccountSyncResult = {
  account: string;
  ingested: number;
  skipped: number;
  hidden: number;
  error?: string;
};

const EMAIL_ID_SEARCH_CHUNK = 20;

export type SyncAllResult = {
  results: AccountSyncResult[];
  rules: ProcessPendingSummary;
};

const MAILBOX = EMAIL_MAILBOX;

@Injectable()
export class EmailIngestService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(EmailIngestService.name);
  private readonly accounts: EmailAccountConfig[];
  private readonly pollMinutes: number;
  // How many latest messages to ingest on the very first sync of an account
  // (a fresh cursor); afterwards only new UIDs are fetched.
  private readonly initialFetchCount: number;
  private pollTimer?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly rulesRunner: EmailRulesRunnerService,
  ) {
    this.accounts = parseEmailAccounts(
      this.configService.get<string>('EMAIL_ACCOUNTS'),
      (message) => this.logger.error(message),
    );
    this.pollMinutes = Number(
      this.configService.get<string>('EMAIL_POLL_MINUTES') || 10,
    );
    this.initialFetchCount = Number(
      this.configService.get<string>('EMAIL_INITIAL_FETCH') || 20,
    );
  }

  onApplicationBootstrap() {
    if (this.accounts.length === 0) {
      this.logger.log('EMAIL_ACCOUNTS not configured, email ingest disabled');
      return;
    }
    this.logger.log(
      `Email ingest enabled: ${this.accounts
        .map((account) => account.name)
        .join(', ')} (every ${this.pollMinutes} min)`,
    );
    // Let the app finish booting before the first IMAP round.
    this.startupTimer = setTimeout(() => void this.syncAll(), 15_000);
    this.pollTimer = setInterval(
      () => void this.syncAll(),
      this.pollMinutes * 60_000,
    );
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  // Sync every configured account once; used by the poller and by scripts.
  // After IMAP ingest, classify any status=new messages and apply matching
  // rules (including leftovers from earlier syncs / failed LLM rounds).
  async syncAll(): Promise<SyncAllResult> {
    if (this.running) {
      this.logger.warn('Email sync already running, skipping this round');
      return { results: [], rules: { processed: 0, applied: 0, errors: 0 } };
    }
    this.running = true;
    try {
      const results: AccountSyncResult[] = [];
      for (const account of this.accounts) {
        try {
          results.push(await this.syncAccount(account));
        } catch (error) {
          this.logger.error(
            `Email sync failed for ${account.name}: ${String(error)}`,
          );
          results.push({
            account: account.name,
            ingested: 0,
            skipped: 0,
            hidden: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const rules = await this.rulesRunner.processPending();
      return { results, rules };
    } finally {
      this.running = false;
    }
  }

  private async syncAccount(
    config: EmailAccountConfig,
  ): Promise<AccountSyncResult> {
    return withMailbox(config, MAILBOX, (client) =>
      this.syncMailbox(config, client),
    );
  }

  private async syncMailbox(
    config: EmailAccountConfig,
    client: ImapFlow,
  ): Promise<AccountSyncResult> {
    const mailbox = client.mailbox as MailboxObject;
    const uidValidity = mailbox.uidValidity ?? BigInt(0);

    let state = await this.prisma.emailSyncState.findUnique({
      where: {
        account_mailbox: { account: config.name, mailbox: MAILBOX },
      },
    });

    let isFreshCursor = false;
    if (!state) {
      isFreshCursor = true;
      state = await this.prisma.emailSyncState.create({
        data: {
          account: config.name,
          mailbox: MAILBOX,
          uidValidity,
          lastUid: 0,
        },
      });
    } else if (state.uidValidity !== uidValidity) {
      // Server re-numbered the mailbox; old UIDs are meaningless.
      this.logger.warn(
        `UIDVALIDITY changed for ${config.name} (${state.uidValidity} -> ${uidValidity}), resetting cursor`,
      );
      isFreshCursor = true;
      state = await this.prisma.emailSyncState.update({
        where: { id: state.id },
        data: { uidValidity, lastUid: 0 },
      });
    }

    // Fresh cursor: take only the N most recent messages (by sequence
    // number) instead of the whole mailbox history. Otherwise: UIDs above
    // the stored cursor.
    let ingested = 0;
    let skipped = 0;
    const canFetch = !isFreshCursor || mailbox.exists;
    if (canFetch) {
      let range: string;
      let byUid: boolean;
      if (isFreshCursor) {
        const firstSeq = Math.max(
          1,
          mailbox.exists - this.initialFetchCount + 1,
        );
        range = `${firstSeq}:*`;
        byUid = false;
      } else {
        range = `${BigInt(state.lastUid) + BigInt(1)}:*`;
        byUid = true;
      }

      let maxUid = BigInt(state.lastUid);

      const messages: FetchMessageObject[] = await client.fetchAll(
        range,
        {
          uid: true,
          flags: true,
          envelope: true,
          internalDate: true,
          size: true,
          source: true,
          threadId: true,
          labels: true,
        },
        byUid ? { uid: true } : undefined,
      );

      for (const message of messages) {
        const uid = BigInt(message.uid);
        // IMAP quirk: "N:*" always matches at least the highest-UID message,
        // so a round with no new mail returns the last seen message again.
        if (!isFreshCursor && uid <= BigInt(state.lastUid)) {
          continue;
        }

        const stored = await this.storeMessage(config.name, message);
        if (stored) ingested += 1;
        else skipped += 1;

        if (uid > maxUid) {
          maxUid = uid;
          await this.prisma.emailSyncState.update({
            where: { id: state.id },
            data: { lastUid: maxUid },
          });
        }
      }
    }

    let hidden = 0;
    try {
      hidden = await this.hideMessagesGoneFromMailbox(
        config.name,
        client,
        !isFreshCursor,
      );
    } catch (error) {
      this.logger.warn(
        `Hide-gone check failed for ${config.name}: ${String(error)}`,
      );
    }

    if (ingested > 0 || skipped > 0 || hidden > 0) {
      this.logger.log(
        `Email sync ${config.name}: ${ingested} new, ${skipped} already known, ${hidden} hidden (gone from Gmail)`,
      );
    }
    return { account: config.name, ingested, skipped, hidden };
  }

  // Visible inbox copies (not hidden, not archived here) that Gmail already
  // archived or deleted should drop out of the dashboard. Logged as source=sync.
  private async hideMessagesGoneFromMailbox(
    account: string,
    client: ImapFlow,
    uidValidityOk: boolean,
  ): Promise<number> {
    const pending = await this.prisma.emailMessage.findMany({
      where: { account, hidden: false, archived: false },
      select: { id: true, uid: true, gmMsgId: true },
    });
    if (pending.length === 0) return 0;

    const inbox = await this.readInboxPresence(client, pending, uidValidityOk);
    const gone = messagesGoneFromInbox(pending, inbox);
    if (gone.length === 0) return 0;

    await this.prisma.$transaction([
      this.prisma.emailMessage.updateMany({
        where: { id: { in: gone.map((message) => message.id) } },
        data: { hidden: true },
      }),
      this.prisma.emailActionLog.createMany({
        data: gone.map((message) => ({
          messageId: message.id,
          action: 'hide',
          param: 'gmail',
          source: 'sync',
          prevState: { hidden: false },
          result: 'ok',
        })),
      }),
    ]);

    return gone.length;
  }

  private async readInboxPresence(
    client: ImapFlow,
    pending: LocalInboxMessage[],
    uidValidityOk: boolean,
  ): Promise<InboxPresence> {
    const mailbox = client.mailbox as MailboxObject | null;
    const empty: InboxPresence = {
      emailIds: new Set(),
      uids: new Set(),
      uidValidityOk,
      searched: true,
    };
    if (!mailbox?.exists) return empty;

    const emailIds = await this.searchInboxByEmailId(client, pending);
    const uids = uidValidityOk
      ? await this.searchInboxByUid(client, pending)
      : null;

    if (emailIds === null && uids === null) {
      return { ...empty, searched: false };
    }

    return {
      emailIds: emailIds ?? new Set(),
      uids: uids ?? new Set(),
      uidValidityOk,
      searched: true,
    };
  }

  private async searchInboxByUid(
    client: ImapFlow,
    pending: LocalInboxMessage[],
  ): Promise<Set<string> | null> {
    try {
      const found = await client.search(
        { uid: pending.map((message) => String(message.uid)).join(',') },
        { uid: true },
      );
      if (found === false) {
        this.logger.warn('INBOX UID search failed, skip UID presence');
        return null;
      }
      return new Set(found.map((uid) => String(uid)));
    } catch (error) {
      this.logger.warn(`INBOX UID search failed: ${String(error)}`);
      return null;
    }
  }

  private async searchInboxByEmailId(
    client: ImapFlow,
    pending: LocalInboxMessage[],
  ): Promise<Set<string> | null> {
    const present = new Set<string>();
    let fetchedAny = false;
    try {
      for (const chunk of chunkItems(pending, EMAIL_ID_SEARCH_CHUNK)) {
        const query =
          chunk.length === 1
            ? { emailId: chunk[0].gmMsgId }
            : { or: chunk.map((message) => ({ emailId: message.gmMsgId })) };
        const rows = await client.fetchAll(query, { uid: true });
        if (rows.length > 0) fetchedAny = true;
        for (const row of rows) {
          if (row.emailId) present.add(row.emailId);
        }
      }
      if (fetchedAny && present.size === 0) return null;
      return present;
    } catch (error) {
      this.logger.warn(
        `INBOX emailId search failed, falling back to UID: ${String(error)}`,
      );
      return null;
    }
  }

  // Returns true if the message was stored, false if it was already known.
  private async storeMessage(
    account: string,
    message: FetchMessageObject,
  ): Promise<boolean> {
    // X-GM-MSGID / X-GM-THRID on Gmail; fall back to RFC ids elsewhere.
    const gmMsgId =
      message.emailId ??
      message.envelope?.messageId ??
      `uid-${message.uid}-${new Date(message.internalDate ?? 0).getTime()}`;
    const gmThreadId = message.threadId ?? gmMsgId;

    const existing = await this.prisma.emailMessage.findUnique({
      where: { account_gmMsgId: { account, gmMsgId } },
      select: { id: true },
    });
    if (existing) return false;

    if (!message.source) {
      throw new Error(`No source for message uid=${message.uid} (${account})`);
    }

    const parsed = await simpleParser(message.source);
    const bodyText = this.extractBodyText(parsed);
    const bodyHtml = this.extractBodyHtml(parsed);
    const snippet = bodyText
      ? bodyText.replace(/\s+/g, ' ').trim().slice(0, 300)
      : null;
    const date = message.envelope?.date ?? message.internalDate ?? null;
    const subject = message.envelope?.subject ?? parsed.subject ?? null;

    const rawKey = await this.storageService.uploadPrivateFileWithKey(
      message.source,
      'message/rfc822',
      `emails/${account}/${this.safeKeySegment(gmMsgId)}.eml`,
    );

    const thread = await this.prisma.emailThread.upsert({
      where: { account_gmThreadId: { account, gmThreadId } },
      create: {
        account,
        gmThreadId,
        subject,
        lastMessageAt: date,
      },
      update: {
        ...(date ? { lastMessageAt: date } : {}),
      },
    });

    const attachments = (parsed.attachments || [])
      .filter((attachment) => attachment.content)
      .map((attachment) => ({
        filename: attachment.filename ?? null,
        mimeType: attachment.contentType ?? null,
        sizeBytes: attachment.size ?? attachment.content.length,
        sha256: createHash('sha256').update(attachment.content).digest('hex'),
        inline:
          attachment.contentDisposition === 'inline' || Boolean(attachment.cid),
      }));

    await this.prisma.emailMessage.create({
      data: {
        account,
        gmMsgId,
        threadId: thread.id,
        uid: BigInt(message.uid),
        mailbox: MAILBOX,
        messageId: message.envelope?.messageId ?? parsed.messageId ?? null,
        fromAddress: message.envelope?.from?.[0]?.address ?? null,
        fromName: message.envelope?.from?.[0]?.name ?? null,
        toAddresses: this.addresses(message.envelope?.to),
        ccAddresses: this.addresses(message.envelope?.cc),
        subject,
        date,
        snippet,
        bodyText,
        bodyHtml,
        labels: message.labels ? Array.from(message.labels) : [],
        seen: message.flags?.has('\\Seen') ?? false,
        hasAttachments: attachments.length > 0,
        sizeBytes: message.size ?? null,
        rawKey,
        status: 'new',
        attachments: { create: attachments },
      },
    });

    return true;
  }

  private extractBodyText(parsed: ParsedMail): string | null {
    if (parsed.text && parsed.text.trim()) return parsed.text.trim();
    if (parsed.html) return this.stripHtml(parsed.html);
    return null;
  }

  private extractBodyHtml(parsed: ParsedMail): string | null {
    if (typeof parsed.html === 'string' && parsed.html.trim()) {
      return parsed.html.trim();
    }
    return null;
  }

  // For messages ingested before bodyHtml existed: pull the HTML part out of
  // the stored .eml and backfill the column so the next open is instant.
  async ensureBodyHtml(messageId: number): Promise<string | null> {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id: messageId },
      select: { id: true, bodyHtml: true, rawKey: true },
    });
    if (!message) return null;
    if (message.bodyHtml) return message.bodyHtml;
    if (!message.rawKey) return null;

    try {
      const raw = await this.storageService.downloadByKey(message.rawKey);
      const parsed = await simpleParser(raw);
      const bodyHtml = this.extractBodyHtml(parsed);
      if (!bodyHtml) return null;
      await this.prisma.emailMessage.update({
        where: { id: message.id },
        data: { bodyHtml },
      });
      return bodyHtml;
    } catch (error) {
      this.logger.warn(
        `Failed to backfill bodyHtml for message ${messageId}: ${String(error)}`,
      );
      return null;
    }
  }

  // Crude HTML → text for html-only emails; good enough for snippets and
  // classification. Proper cleaning happens later in the pipeline.
  private stripHtml(html: string): string {
    return html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
  }

  private addresses(list?: { address?: string }[] | null): string[] {
    if (!list) return [];
    return list
      .map((entry) => entry.address)
      .filter((address): address is string => Boolean(address));
  }

  private safeKeySegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  }
}
