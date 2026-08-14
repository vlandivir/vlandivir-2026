import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { AuthService } from './auth.service';

// Protected map/reels endpoints (mutations and reels reads): a logged-in
// Google session (browser) OR a machine API key in x-map-api-key /
// x-reels-api-key (scripts, integrations). No URL-based secrets.
@Injectable()
export class EditAccessGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (this.authService.getSessionFromRequest(request)) return true;

    const received =
      this.header(request, 'x-map-api-key') ||
      this.header(request, 'x-reels-api-key');
    const candidates = [
      this.configService.get<string>('REELS_API_KEY'),
      this.configService.get<string>('MAP_API_KEY'),
      this.configService.get<string>('NOTE_API_KEY'),
    ].filter((key): key is string => Boolean(key));
    if (
      received &&
      candidates.some((expected) => sameSecret(received, expected))
    ) {
      return true;
    }

    throw new UnauthorizedException('Sign in or provide a valid API key');
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    return typeof value === 'string' && value ? value : undefined;
  }
}

function sameSecret(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}
