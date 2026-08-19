import { messagesGoneFromInbox, chunkItems } from './email-gone';

describe('messagesGoneFromInbox', () => {
  const local = [
    { id: 1, uid: 10n, gmMsgId: 'aaa' },
    { id: 2, uid: 20n, gmMsgId: 'bbb' },
    { id: 3, uid: 30n, gmMsgId: 'ccc' },
  ];

  it('keeps messages whose Gmail id is still in INBOX', () => {
    expect(
      messagesGoneFromInbox(local, {
        emailIds: new Set(['aaa', 'ccc']),
        uids: new Set(),
        uidValidityOk: true,
        searched: true,
      }).map((row) => row.id),
    ).toEqual([2]);
  });

  it('falls back to UID while UIDVALIDITY is stable', () => {
    expect(
      messagesGoneFromInbox(local, {
        emailIds: new Set(),
        uids: new Set(['10', '20']),
        uidValidityOk: true,
        searched: true,
      }).map((row) => row.id),
    ).toEqual([3]);
  });

  it('keeps a message if either Gmail id or UID is still present', () => {
    expect(
      messagesGoneFromInbox(local, {
        emailIds: new Set(['aaa']),
        uids: new Set(['20']),
        uidValidityOk: true,
        searched: true,
      }).map((row) => row.id),
    ).toEqual([3]);
  });

  it('ignores stale UIDs after UIDVALIDITY changes', () => {
    expect(
      messagesGoneFromInbox(local, {
        emailIds: new Set(['aaa']),
        uids: new Set(['10', '20', '30']),
        uidValidityOk: false,
        searched: true,
      }).map((row) => row.id),
    ).toEqual([2, 3]);
  });

  it('treats an empty INBOX as everything gone', () => {
    expect(
      messagesGoneFromInbox(local, {
        emailIds: new Set(),
        uids: new Set(),
        uidValidityOk: true,
        searched: true,
      }).map((row) => row.id),
    ).toEqual([1, 2, 3]);
  });

  it('hides nothing when the inbox search failed', () => {
    expect(
      messagesGoneFromInbox(local, {
        emailIds: new Set(),
        uids: new Set(),
        uidValidityOk: true,
        searched: false,
      }),
    ).toEqual([]);
  });
});

describe('chunkItems', () => {
  it('splits into groups of the given size', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
