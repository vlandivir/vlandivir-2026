import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

describe('AuthService native handoff', () => {
  const service = new AuthService({
    get: (key: string) => {
      const values: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'client',
        GOOGLE_CLIENT_SECRET: 'secret',
        SESSION_SECRET: 'session-secret-for-tests',
        ALLOWED_GOOGLE_EMAILS: 'owner@example.com',
        ENVIRONMENT: 'DEV',
        PORT: '3000',
      };
      return values[key];
    },
  } as ConfigService);

  it('allows the iOS custom scheme and loopback http', () => {
    expect(service.isAllowedNativeRedirectUri('vlandivir-gtd://auth')).toBe(
      true,
    );
    expect(service.isAllowedNativeRedirectUri('vlandivir-gtd://auth/')).toBe(
      true,
    );
    expect(service.isAllowedNativeRedirectUri('http://127.0.0.1:9876/')).toBe(
      true,
    );
    expect(service.isAllowedNativeRedirectUri('http://localhost:9876')).toBe(
      true,
    );
  });

  it('rejects open redirects and unexpected schemes', () => {
    expect(
      service.isAllowedNativeRedirectUri('https://evil.example/steal'),
    ).toBe(false);
    expect(service.isAllowedNativeRedirectUri('vlandivir-gtd://other')).toBe(
      false,
    );
    expect(
      service.isAllowedNativeRedirectUri('vlandivir-gtd://auth/extra'),
    ).toBe(false);
    expect(service.isAllowedNativeRedirectUri('vlandivir-gtd://auth?x=1')).toBe(
      false,
    );
    expect(service.isAllowedNativeRedirectUri('not a url')).toBe(false);
  });
});
