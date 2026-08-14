import { Injectable } from '@nestjs/common';
import {
  parse,
  isValid,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
} from 'date-fns';
import { DATE_PARSER_RULES } from './date-parser.rules';

interface ParseResult {
  date: Date | null;
  cleanContent: string;
}

@Injectable()
export class DateParserService {
  private readonly dateFormats = DATE_PARSER_RULES;

  extractDateFromFirstLine(text: string): ParseResult {
    if (!text) return { date: null, cleanContent: '' };

    const lines = text.split('\n');
    const firstLine = lines[0].trim();

    // Пробуем разные форматы
    for (const { format, locale } of this.dateFormats) {
      try {
        const parsedDate = parse(firstLine, format, new Date(), { locale });
        if (isValid(parsedDate)) {
          // Если год не был указан в формате, используем текущий
          if (!format.includes('yyyy')) {
            parsedDate.setFullYear(new Date().getFullYear());
          }
          // Устанавливаем время на начало дня в локальной временной зоне
          const date = setMilliseconds(
            setSeconds(setMinutes(setHours(parsedDate, 0), 0), 0),
            0,
          );

          // Удаляем первую строку и пустые строки в начале
          const cleanContent = lines.slice(1).join('\n').replace(/^\s+/, '');

          return { date, cleanContent };
        }
      } catch {
        continue;
      }
    }

    return { date: null, cleanContent: text };
  }
}
