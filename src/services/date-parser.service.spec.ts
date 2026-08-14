import { Test, TestingModule } from '@nestjs/testing';
import { DateParserService } from './date-parser.service';

describe('DateParserService', () => {
  let service: DateParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DateParserService],
    }).compile();

    service = module.get(DateParserService);
  });

  it('should parse YYYY.MM.DD format and clean content', () => {
    const result = service.extractDateFromFirstLine(
      '2024.02.15\nsome text\nmore text',
    );
    expect(result.date?.getFullYear()).toBe(2024);
    expect(result.date?.getMonth()).toBe(1); // февраль = 1
    expect(result.date?.getDate()).toBe(15);
    expect(result.cleanContent).toBe('some text\nmore text');
  });

  it('should parse day and month in Russian and clean content', () => {
    const result = service.extractDateFromFirstLine('2 января\n\n\nsome text');
    const currentYear = new Date().getFullYear();
    expect(result.date?.getDate()).toBe(2);
    expect(result.date?.getMonth()).toBe(0); // январь = 0
    expect(result.date?.getFullYear()).toBe(currentYear);
    expect(result.cleanContent).toBe('some text');
  });

  it('should parse date with English month and year and clean content', () => {
    const result = service.extractDateFromFirstLine(
      '2 jan 2018\n  \nsome text',
    );
    expect(result.date?.getFullYear()).toBe(2018);
    expect(result.date?.getMonth()).toBe(0); // январь = 0
    expect(result.date?.getDate()).toBe(2);
    expect(result.cleanContent).toBe('some text');
  });

  it('should return null date and original text for invalid date', () => {
    const text = 'not a date\nsome text';
    const result = service.extractDateFromFirstLine(text);
    expect(result.date).toBeNull();
    expect(result.cleanContent).toBe(text);
  });

  it('should return null and empty string for empty input', () => {
    const result = service.extractDateFromFirstLine('');
    expect(result.date).toBeNull();
    expect(result.cleanContent).toBe('');
  });
});
