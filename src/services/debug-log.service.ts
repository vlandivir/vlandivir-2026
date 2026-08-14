import { Injectable } from '@nestjs/common';

type DebugLogLevel = 'info' | 'warn' | 'error';

export type DebugLogEntry = {
  timestamp: string;
  level: DebugLogLevel;
  source: string;
  message: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class DebugLogService {
  private readonly maxEntries = 1000;
  private readonly entries: DebugLogEntry[] = [];

  info(source: string, message: string, data?: Record<string, unknown>): void {
    this.push('info', source, message, data);
  }

  warn(source: string, message: string, data?: Record<string, unknown>): void {
    this.push('warn', source, message, data);
  }

  error(source: string, message: string, data?: Record<string, unknown>): void {
    this.push('error', source, message, data);
  }

  toText(): string {
    return this.entries
      .map((entry) => {
        const data =
          entry.data && Object.keys(entry.data).length > 0
            ? ` ${JSON.stringify(entry.data)}`
            : '';
        return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}${data}`;
      })
      .join('\n');
  }

  clear(): void {
    this.entries.length = 0;
  }

  count(): number {
    return this.entries.length;
  }

  private push(
    level: DebugLogLevel,
    source: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (this.entries.length >= this.maxEntries) {
      this.entries.shift();
    }
    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      data,
    });
  }
}
