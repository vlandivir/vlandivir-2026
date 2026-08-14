// Personal Telegram chat that owns /diary, notes-api, notifications-api,
// subs alerts, and the own-reel → diary bridge. Channel posts from
// TELEGRAM_CHANNEL_IDS are dual-saved into this chat.
//
// Required: TELEGRAM_OWNER_CHAT_ID (integer).
// Optional: TELEGRAM_CHANNEL_IDS (comma-separated channel ids).

const OWNER_CHAT_ID_ENV = 'TELEGRAM_OWNER_CHAT_ID';
const CHANNEL_IDS_ENV = 'TELEGRAM_CHANNEL_IDS';

function requiredIntEnv(name: string): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    throw new Error(`${name} is not configured`);
  }
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} is not a safe integer`);
  }
  return value;
}

export function getDiaryChatIdNumber(): number {
  return requiredIntEnv(OWNER_CHAT_ID_ENV);
}

export function getDiaryChatId(): bigint {
  return BigInt(getDiaryChatIdNumber());
}

export function getTelegramChannelIds(): number[] {
  const raw = process.env[CHANNEL_IDS_ENV]?.trim();
  if (!raw) {
    return [];
  }
  return raw.split(',').map((part) => {
    const value = part.trim();
    if (!/^-?\d+$/.test(value)) {
      throw new Error(
        `${CHANNEL_IDS_ENV} must be a comma-separated list of integers`,
      );
    }
    const n = Number(value);
    if (!Number.isSafeInteger(n)) {
      throw new Error(
        `${CHANNEL_IDS_ENV} contains a value that is not a safe integer`,
      );
    }
    return n;
  });
}
