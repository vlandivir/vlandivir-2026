import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { PrismaService } from '../prisma/prisma.service';
import {
  EMAIL_MAILBOX,
  EmailAccountConfig,
  parseEmailAccounts,
  withMailbox,
} from './email-accounts';

// Reversible actions on a message. mark_read/archive/label touch the mailbox
// over IMAP; hide/important are dashboard-local. Every action is logged with
// the prior state so it can be undone. No destructive actions by design.
export type EmailAction =
  | 'mark_read'
  | 'mark_unread'
  | 'archive'
  | 'unarchive'
  | 'hide'
  | 'unhide'
  | 'mark_important'
  | 'unmark_important'
  | 'label'
  | 'unlabel';

const GMAIL_INBOX = '\\Inbox';

const UNDOABLE_ACTIONS: EmailAction[] = [
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

// Structured effects a rule can carry. Chosen explicitly by the owner, not
// inferred — the executor only ever runs this whitelisted set.
export type EmailRuleEffects = {
  markRead?: boolean;
  archive?: boolean;
  hide?: boolean;
  label?: string;
  createGtdTask?: boolean;
};

@Injectable()
export class EmailExecutorService {
  private readonly logger = new Logger(EmailExecutorService.name);
  private readonly accounts: Map<string, EmailAccountConfig>;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accounts = new Map(
      parseEmailAccounts(
        this.configService.get<string>('EMAIL_ACCOUNTS'),
        (message) => this.logger.error(message),
      ).map((account) => [account.name, account]),
    );
  }

  async apply(
    messageId: number,
    action: EmailAction,
    param?: string,
    source: 'manual' | 'rule' = 'manual',
    ruleId?: number,
  ) {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');

    if ((action === 'label' || action === 'unlabel') && !param?.trim()) {
      throw new NotFoundException('Label name is required');
    }
    const label = param?.trim();

    // State to restore on undo, captured before the change
    const prevState: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};

    try {
      switch (action) {
        case 'mark_read':
        case 'mark_unread': {
          const seen = action === 'mark_read';
          prevState.seen = message.seen;
          await this.imap(message.account, (client) =>
            seen
              ? client.messageFlagsAdd(String(message.uid), ['\\Seen'], {
                  uid: true,
                })
              : client.messageFlagsRemove(String(message.uid), ['\\Seen'], {
                  uid: true,
                }),
          );
          data.seen = seen;
          break;
        }
        case 'archive':
        case 'unarchive': {
          const archived = action === 'archive';
          prevState.archived = message.archived;
          prevState.labels = message.labels;
          // Archiving in Gmail = removing the \Inbox label. Archiving also
          // marks the message read (an archived message shouldn't stay unread).
          const alsoMarkRead = archived && !message.seen;
          if (alsoMarkRead) prevState.seen = message.seen;
          await this.imap(message.account, async (client) => {
            const uid = String(message.uid);
            if (archived) {
              await client.messageFlagsRemove(uid, [GMAIL_INBOX], {
                uid: true,
                useLabels: true,
              });
              if (alsoMarkRead) {
                await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
              }
            } else {
              await client.messageFlagsAdd(uid, [GMAIL_INBOX], {
                uid: true,
                useLabels: true,
              });
            }
          });
          data.archived = archived;
          data.labels = archived
            ? message.labels.filter((l) => l !== GMAIL_INBOX)
            : [...new Set([...message.labels, GMAIL_INBOX])];
          if (alsoMarkRead) data.seen = true;
          break;
        }
        case 'label':
        case 'unlabel': {
          const add = action === 'label';
          prevState.labels = message.labels;
          await this.imap(message.account, (client) =>
            add
              ? client.messageFlagsAdd(String(message.uid), [label!], {
                  uid: true,
                  useLabels: true,
                })
              : client.messageFlagsRemove(String(message.uid), [label!], {
                  uid: true,
                  useLabels: true,
                }),
          );
          data.labels = add
            ? [...new Set([...message.labels, label!])]
            : message.labels.filter((l) => l !== label);
          break;
        }
        case 'hide':
        case 'unhide': {
          // Dashboard-local; no IMAP write
          prevState.hidden = message.hidden;
          data.hidden = action === 'hide';
          break;
        }
        case 'mark_important':
        case 'unmark_important': {
          // Dashboard-local section; no IMAP write
          prevState.important = message.important;
          data.important = action === 'mark_important';
          break;
        }
      }

      const updated = await this.prisma.emailMessage.update({
        where: { id: messageId },
        data,
      });

      await this.prisma.emailActionLog.create({
        data: {
          messageId,
          action,
          param: label ?? null,
          source,
          ruleId: ruleId ?? null,
          prevState: prevState as object,
          result: 'ok',
        },
      });

      return updated;
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      await this.prisma.emailActionLog.create({
        data: {
          messageId,
          action,
          param: label ?? null,
          source,
          ruleId: ruleId ?? null,
          prevState: prevState as object,
          result: 'error',
          error: messageText,
        },
      });
      this.logger.warn(
        `Action ${action} on message ${messageId} failed: ${messageText}`,
      );
      throw error;
    }
  }

  async getLastUndoableAction() {
    const entry = await this.prisma.emailActionLog.findFirst({
      where: { source: 'manual', result: 'ok' },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        action: true,
        param: true,
        prevState: true,
        message: {
          select: {
            id: true,
            account: true,
            uid: true,
            subject: true,
            seen: true,
            archived: true,
            hidden: true,
            important: true,
            labels: true,
          },
        },
      },
    });
    if (!entry || !UNDOABLE_ACTIONS.includes(entry.action as EmailAction)) {
      return null;
    }
    return entry;
  }

  async undoLastManualAction() {
    const target = await this.getLastUndoableAction();
    if (!target) throw new NotFoundException('No action to undo');

    const message = target.message;
    const data: Record<string, unknown> = {};
    const undoPrevState: Record<string, unknown> = {};

    try {
      const prevState = this.asState(target.prevState);
      switch (target.action as EmailAction) {
        case 'mark_read':
        case 'mark_unread': {
          const seen = this.booleanState(prevState, 'seen');
          undoPrevState.seen = message.seen;
          if (seen !== message.seen) {
            await this.setSeen(message.account, message.uid, seen);
          }
          data.seen = seen;
          break;
        }
        case 'archive':
        case 'unarchive': {
          const archived = this.booleanState(prevState, 'archived');
          undoPrevState.archived = message.archived;
          undoPrevState.labels = message.labels;
          const shouldBeInInbox = !archived;
          const isInInbox = message.labels.includes(GMAIL_INBOX);
          if (shouldBeInInbox !== isInInbox) {
            await this.setLabel(
              message.account,
              message.uid,
              GMAIL_INBOX,
              shouldBeInInbox,
            );
          }
          data.archived = archived;
          data.labels = shouldBeInInbox
            ? [...new Set([...message.labels, GMAIL_INBOX])]
            : message.labels.filter((label) => label !== GMAIL_INBOX);

          if (typeof prevState.seen === 'boolean') {
            undoPrevState.seen = message.seen;
            if (prevState.seen !== message.seen) {
              await this.setSeen(message.account, message.uid, prevState.seen);
            }
            data.seen = prevState.seen;
          }
          break;
        }
        case 'label':
        case 'unlabel': {
          const label = target.param?.trim();
          if (!label) throw new Error('Undo log has no label');
          const previousLabels = this.stringArrayState(prevState, 'labels');
          const shouldHaveLabel = previousLabels.includes(label);
          const hasLabel = message.labels.includes(label);
          undoPrevState.labels = message.labels;
          if (shouldHaveLabel !== hasLabel) {
            await this.setLabel(
              message.account,
              message.uid,
              label,
              shouldHaveLabel,
            );
          }
          data.labels = shouldHaveLabel
            ? [...new Set([...message.labels, label])]
            : message.labels.filter((item) => item !== label);
          break;
        }
        case 'hide':
        case 'unhide': {
          const hidden = this.booleanState(prevState, 'hidden');
          undoPrevState.hidden = message.hidden;
          data.hidden = hidden;
          break;
        }
        case 'mark_important':
        case 'unmark_important': {
          const important = this.booleanState(prevState, 'important');
          undoPrevState.important = message.important;
          data.important = important;
          break;
        }
      }

      const updated = await this.prisma.emailMessage.update({
        where: { id: message.id },
        data,
      });
      await this.prisma.emailActionLog.create({
        data: {
          messageId: message.id,
          action: 'undo',
          param: String(target.id),
          source: 'manual',
          prevState: undoPrevState as object,
          result: 'ok',
        },
      });
      return { target, message: updated };
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      await this.prisma.emailActionLog.create({
        data: {
          messageId: message.id,
          action: 'undo',
          param: String(target.id),
          source: 'manual',
          prevState: undoPrevState as object,
          result: 'error',
          error: messageText,
        },
      });
      this.logger.warn(
        `Undo action ${target.id} on message ${message.id} failed: ${messageText}`,
      );
      throw error;
    }
  }

  // Runs a rule's effects on a message as a sequence of whitelisted actions.
  // `archive` already marks read, so mark_read is only issued on its own.
  async applyEffects(
    messageId: number,
    effects: EmailRuleEffects,
    ruleId?: number,
  ) {
    if (effects.archive) {
      await this.apply(messageId, 'archive', undefined, 'rule', ruleId);
    } else if (effects.markRead) {
      await this.apply(messageId, 'mark_read', undefined, 'rule', ruleId);
    }
    if (effects.hide) {
      await this.apply(messageId, 'hide', undefined, 'rule', ruleId);
    }
    if (effects.label?.trim()) {
      await this.apply(messageId, 'label', effects.label, 'rule', ruleId);
    }
    return this.prisma.emailMessage.findUnique({ where: { id: messageId } });
  }

  private asState(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Undo log has no previous state');
    }
    return value as Record<string, unknown>;
  }

  private booleanState(state: Record<string, unknown>, key: string): boolean {
    if (typeof state[key] !== 'boolean') {
      throw new Error(`Undo log has no ${key} state`);
    }
    return state[key];
  }

  private stringArrayState(
    state: Record<string, unknown>,
    key: string,
  ): string[] {
    const value = state[key];
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string')
    ) {
      throw new Error(`Undo log has no ${key} state`);
    }
    return value as string[];
  }

  private setSeen(account: string, uid: bigint, seen: boolean) {
    return this.imap(account, (client) =>
      seen
        ? client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
        : client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true }),
    );
  }

  private setLabel(account: string, uid: bigint, label: string, add: boolean) {
    return this.imap(account, (client) =>
      add
        ? client.messageFlagsAdd(String(uid), [label], {
            uid: true,
            useLabels: true,
          })
        : client.messageFlagsRemove(String(uid), [label], {
            uid: true,
            useLabels: true,
          }),
    );
  }

  private async imap<T>(
    account: string,
    fn: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const config = this.accounts.get(account);
    if (!config) {
      throw new Error(`Account "${account}" is not configured`);
    }
    return withMailbox(config, EMAIL_MAILBOX, fn);
  }
}
