import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

function serviceWithAllowlist(emails: string) {
  return new AuthService({
    get: (key: string) => {
      const values: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'client',
        GOOGLE_CLIENT_SECRET: 'secret',
        SESSION_SECRET: 'session-secret-for-tests',
        ALLOWED_GOOGLE_EMAILS: emails,
        ENVIRONMENT: 'DEV',
        PORT: '3000',
      };
      return values[key];
    },
  } as ConfigService);
}

describe('AuthService admin vs any Google user', () => {
  const service = serviceWithAllowlist(
    'owner@example.com, second-admin@example.com',
  );

  it('treats every allowlisted email as admin and others as regular users', () => {
    expect(service.isAllowedEmail('Owner@Example.com')).toBe(true);
    expect(service.isAdminUser({ email: 'owner@example.com' })).toBe(true);
    expect(service.isAdminUser({ email: 'second-admin@example.com' })).toBe(
      true,
    );
    expect(service.isAdminUser({ email: 'friend@gmail.com' })).toBe(false);
    expect(service.isAdminUser(null)).toBe(false);
  });

  it('issues a session token for any verified Google email', () => {
    const token = service.issueSessionToken({
      email: 'friend@gmail.com',
      name: 'Friend',
    });
    expect(service.verifySessionToken(token)).toEqual({
      email: 'friend@gmail.com',
      name: 'Friend',
    });
  });
});
