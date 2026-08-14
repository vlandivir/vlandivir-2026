import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import type { Request } from 'express';

export type SessionUser = {
  email: string;
  name?: string;
};

const SESSION_COOKIE = 'vl_session';
const STATE_COOKIE = 'vl_auth_state';
const SESSION_DAYS = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly sessionSecret: string;
  private readonly allowedEmails: Set<string>;
  private readonly isProd: boolean;
  private readonly oauthClient: OAuth2Client;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
    this.clientSecret =
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '';
    this.sessionSecret = this.configService.get<string>('SESSION_SECRET') || '';
    this.isProd = this.configService.get<string>('ENVIRONMENT') === 'PROD';
    this.allowedEmails = new Set(
      (this.configService.get<string>('ALLOWED_GOOGLE_EMAILS') || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
    this.oauthClient = new OAuth2Client(this.clientId);
  }

  get enabled(): boolean {
    return Boolean(
      this.clientId &&
        this.clientSecret &&
        this.sessionSecret &&
        this.allowedEmails.size > 0,
    );
  }

  get sessionCookieName(): string {
    return SESSION_COOKIE;
  }

  get stateCookieName(): string {
    return STATE_COOKIE;
  }

  get baseUrl(): string {
    if (this.isProd) {
      return (
        this.configService.get<string>('VLANDIVIR_2025_BASE_URL') ||
        'https://vlandivir.com'
      );
    }
    const port = this.configService.get<string>('PORT') || '3000';
    return `http://localhost:${port}`;
  }

  private get redirectUri(): string {
    return `${this.baseUrl}/auth/google/callback`;
  }

  // --- OAuth flow ---

  createState(redirectPath: string): { state: string; nonce: string } {
    const nonce = randomBytes(16).toString('hex');
    const state = jwt.sign(
      { r: this.safeRedirectPath(redirectPath), n: nonce },
      this.sessionSecret,
      { expiresIn: '10m' },
    );
    return { state, nonce };
  }

  verifyState(
    state: string,
    cookieNonce: string | undefined,
  ): { redirectPath: string } | null {
    try {
      const payload = jwt.verify(state, this.sessionSecret) as {
        r?: string;
        n?: string;
      };
      if (!payload.n || payload.n !== cookieNonce) return null;
      return { redirectPath: this.safeRedirectPath(payload.r || '/') };
    } catch {
      return null;
    }
  }

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // Exchanges the authorization code, verifies the id_token signature and
  // returns the user when their email is on the allowlist.
  async handleCallback(code: string): Promise<SessionUser | 'forbidden'> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(
        `Token exchange failed (${tokenResponse.status}): ${body}`,
      );
    }
    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token) {
      throw new Error('Token exchange response has no id_token');
    }

    const ticket = await this.oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.clientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    if (!email || !payload?.email_verified) {
      throw new Error('id_token has no verified email');
    }

    if (!this.allowedEmails.has(email)) {
      this.logger.warn(`Google login rejected for ${email} (not allowlisted)`);
      return 'forbidden';
    }

    return { email, name: payload.name };
  }

  // --- Session ---

  issueSessionToken(user: SessionUser): string {
    return jwt.sign({ sub: user.email, name: user.name }, this.sessionSecret, {
      expiresIn: `${SESSION_DAYS}d`,
    });
  }

  verifySessionToken(token: string): SessionUser | null {
    try {
      const payload = jwt.verify(token, this.sessionSecret) as {
        sub?: string;
        name?: string;
      };
      if (!payload.sub) return null;
      return { email: payload.sub, name: payload.name };
    } catch {
      return null;
    }
  }

  /** Raw session JWT from Authorization Bearer or vl_session cookie. */
  getSessionTokenFromRequest(request: Request): string | null {
    if (!this.enabled) return null;
    const bearer = this.bearerToken(request);
    if (bearer) return bearer;
    return this.parseCookies(request.headers.cookie)[SESSION_COOKIE] || null;
  }

  getSessionFromRequest(request: Request): SessionUser | null {
    const token = this.getSessionTokenFromRequest(request);
    if (!token) return null;
    return this.verifySessionToken(token);
  }

  private bearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const match = /^Bearer\s+(\S+)/i.exec(header.trim());
    return match?.[1] || null;
  }

  /** True when the email is on ALLOWED_GOOGLE_EMAILS (site admin / owner). */
  isAllowedEmail(email: string): boolean {
    return this.allowedEmails.has(email.trim().toLowerCase());
  }

  isAdminSession(request: Request): boolean {
    const session = this.getSessionFromRequest(request);
    return Boolean(session && this.isAllowedEmail(session.email));
  }

  sessionCookie(token: string): string {
    return this.cookieString(SESSION_COOKIE, token, SESSION_DAYS * 24 * 3600);
  }

  clearedSessionCookie(): string {
    return this.cookieString(SESSION_COOKIE, '', 0);
  }

  stateCookie(nonce: string): string {
    return this.cookieString(STATE_COOKIE, nonce, 600);
  }

  clearedStateCookie(): string {
    return this.cookieString(STATE_COOKIE, '', 0);
  }

  safeRedirectPath(path?: string): string {
    // Only same-site absolute paths: no schemes, no protocol-relative URLs.
    if (!path || !path.startsWith('/') || path.startsWith('//')) return '/';
    return path;
  }

  /**
   * Allowlisted bounce targets for native (iOS) OAuth handoff.
   * Custom scheme vlandivir-gtd://auth, plus loopback http for local debug.
   */
  isAllowedNativeRedirectUri(redirectUri: string): boolean {
    let url: URL;
    try {
      url = new URL(redirectUri);
    } catch {
      return false;
    }
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === 'vlandivir-gtd:') {
      return (
        url.hostname === 'auth' &&
        (url.pathname === '' || url.pathname === '/') &&
        !url.search
      );
    }
    if (url.protocol === 'http:') {
      return (
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
        (url.pathname === '' || url.pathname === '/') &&
        !url.search
      );
    }
    return false;
  }

  parseCookies(header?: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!header) return cookies;
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index === -1) continue;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (name) cookies[name] = decodeURIComponent(value);
    }
    return cookies;
  }

  private cookieString(
    name: string,
    value: string,
    maxAgeSeconds: number,
  ): string {
    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSeconds}`,
    ];
    if (this.isProd) parts.push('Secure');
    return parts.join('; ');
  }
}
