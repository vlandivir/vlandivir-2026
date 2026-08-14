import { enUS, ru } from 'date-fns/locale';
import { Locale } from 'date-fns';

export interface DateFormatRule {
  format: string;
  locale: Locale;
}

export const DATE_PARSER_RULES: DateFormatRule[] = [
  { format: 'yyyy.MM.dd', locale: enUS },
  { format: 'd MMMM', locale: ru },
  { format: 'd MMM yyyy', locale: enUS },
  { format: 'yyyy-MM-dd', locale: enUS },
  { format: 'dd.MM', locale: enUS },
  { format: 'MM/dd', locale: enUS },
];
