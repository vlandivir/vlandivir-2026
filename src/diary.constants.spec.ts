import {
  getDiaryChatId,
  getDiaryChatIdNumber,
  getTelegramChannelIds,
} from './diary.constants';

describe('diary.constants', () => {
  const originalOwner = process.env.TELEGRAM_OWNER_CHAT_ID;
  const originalChannels = process.env.TELEGRAM_CHANNEL_IDS;

  afterEach(() => {
    process.env.TELEGRAM_OWNER_CHAT_ID = originalOwner;
    process.env.TELEGRAM_CHANNEL_IDS = originalChannels;
  });

  it('reads the owner chat id from env', () => {
    process.env.TELEGRAM_OWNER_CHAT_ID = '4242';
    expect(getDiaryChatIdNumber()).toBe(4242);
    expect(getDiaryChatId()).toBe(4242n);
  });

  it('parses channel ids', () => {
    process.env.TELEGRAM_CHANNEL_IDS = ' -1001, -1002 ';
    expect(getTelegramChannelIds()).toEqual([-1001, -1002]);
  });

  it('returns no channels when unset', () => {
    delete process.env.TELEGRAM_CHANNEL_IDS;
    expect(getTelegramChannelIds()).toEqual([]);
  });

  it('rejects a missing owner chat id', () => {
    delete process.env.TELEGRAM_OWNER_CHAT_ID;
    expect(() => getDiaryChatIdNumber()).toThrow('TELEGRAM_OWNER_CHAT_ID');
  });
});
