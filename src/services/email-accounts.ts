import { ImapFlow } from 'imapflow';
import { z } from 'zod';

// EMAIL_ACCOUNTS env var: JSON array of IMAP accounts, e.g.
// [{"name":"personal","user":"me@gmail.com","password":"abcd efgh ijkl mnop"}]
// `name` is the stable short id stored in the DB `account` columns.
export const emailAccountSchema = z.object({
  name: z.string().regex(/^[a-z0-9._-]+$/i),
  user: z.string().min(3),
  password: z.string().min(1),
  host: z.string().default('imap.gmail.com'),
  port: z.number().int().default(993),
});

export type EmailAccountConfig = z.infer<typeof emailAccountSchema>;

export const EMAIL_MAILBOX = 'INBOX';

// Deep-link into Gmail web for a message/thread. gmId must be the decimal
// X-GM-MSGID or X-GM-THRID; Gmail's hash uses the lowercase hex form.
export function gmailOpenUrl(
  userEmail: string,
  gmId: string | null | undefined,
): string | null {
  if (!userEmail || !gmId || !/^\d+$/.test(gmId)) return null;
  const hex = BigInt(gmId).toString(16);
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(userEmail)}#all/${hex}`;
}

// Parses EMAIL_ACCOUNTS; returns [] and reports via onError on invalid input.
export function parseEmailAccounts(
  raw: string | undefined,
  onError?: (message: string) => void,
): EmailAccountConfig[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const accounts = z.array(emailAccountSchema).parse(parsed);
    // Google shows app passwords with spaces; strip them.
    return accounts.map((account) => ({
      ...account,
      password: account.password.replace(/\s+/g, ''),
    }));
  } catch (error) {
    onError?.(`Invalid EMAIL_ACCOUNTS config: ${String(error)}`);
    return [];
  }
}

// Connects, locks the mailbox, runs fn, then always releases + logs out.
export async function withMailbox<T>(
  config: EmailAccountConfig,
  mailbox: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
