import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

// Simple in-memory fixed-window limiter for the public search endpoint, which
// fans out to OpenAI (embeddings) and Nominatim (geocoding). The app serves
// HTTPS directly (no reverse proxy — see main.ts), so req.ip is the real
// client. A single container means one process, so an in-memory map is enough.
const LIMIT = 30;
const WINDOW_MS = 60 * 1000;
const MAX_TRACKED_IPS = 10000;

@Injectable()
export class MapSearchThrottleGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.clientIp(request);
    const now = Date.now();

    const recent = (this.hits.get(ip) ?? []).filter(
      (timestamp) => now - timestamp < WINDOW_MS,
    );
    if (recent.length >= LIMIT) {
      throw new HttpException(
        'Слишком много запросов, попробуйте чуть позже',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(ip, recent);
    if (this.hits.size > MAX_TRACKED_IPS) this.evictStale(now);
    return true;
  }

  private clientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  private evictStale(now: number): void {
    for (const [ip, timestamps] of this.hits) {
      const recent = timestamps.filter(
        (timestamp) => now - timestamp < WINDOW_MS,
      );
      if (recent.length) this.hits.set(ip, recent);
      else this.hits.delete(ip);
    }
  }
}
