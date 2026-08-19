// Local inbox copies that are no longer in the Gmail INBOX (archived or
// deleted there) should disappear from the dashboard. Presence is matched by
// X-GM-MSGID when we have it, and by UID only while UIDVALIDITY is stable.

export type LocalInboxMessage = {
  id: number;
  uid: bigint;
  gmMsgId: string;
};

export type InboxPresence = {
  emailIds: Set<string>;
  uids: Set<string>;
  uidValidityOk: boolean;
  // False when IMAP search failed — do not treat an unknown inbox as empty.
  searched: boolean;
};

export function messagesGoneFromInbox<T extends LocalInboxMessage>(
  local: T[],
  inbox: InboxPresence,
): T[] {
  if (!inbox.searched) return [];
  return local.filter((message) => {
    if (inbox.emailIds.has(message.gmMsgId)) return false;
    if (inbox.uidValidityOk && inbox.uids.has(String(message.uid))) {
      return false;
    }
    return true;
  });
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
