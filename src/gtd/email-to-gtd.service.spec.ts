import { BadRequestException } from '@nestjs/common';
import { EmailToGtdService } from './email-to-gtd.service';

describe('EmailToGtdService', () => {
  const service = new EmailToGtdService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('parses LLM JSON and truncates the title', () => {
    const long = 'x'.repeat(250);
    const result = service.parseFormulation(
      JSON.stringify({ content: long, context: 'тело письма' }),
    );
    expect(result.content).toHaveLength(200);
    expect(result.context).toBe('тело письма');
  });

  it('falls back to content when context is missing', () => {
    expect(service.parseFormulation('{"content":"Позвонить"}')).toEqual({
      content: 'Позвонить',
      context: 'Позвонить',
    });
  });

  it('rejects empty or non-JSON answers', () => {
    expect(() => service.parseFormulation('not json')).toThrow(
      BadRequestException,
    );
    expect(() => service.parseFormulation('{"content":""}')).toThrow(
      BadRequestException,
    );
  });
});
