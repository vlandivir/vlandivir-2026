import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, SessionUser } from './auth.service';

// Like GoogleSessionGuard, but only ALLOWED_GOOGLE_EMAILS (site admin).
// Regular signed-in Google users get 403, not a login redirect.
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = this.authService.getSessionFromRequest(request);
    if (this.authService.isAdminUser(user)) {
      (request as Request & { user: SessionUser }).user = user as SessionUser;
      return true;
    }

    const acceptsHtml =
      request.method === 'GET' &&
      (request.headers.accept || '').includes('text/html');
    if (!user && acceptsHtml && this.authService.enabled) {
      const response = context.switchToHttp().getResponse<Response>();
      const redirect = encodeURIComponent(
        this.authService.safeRedirectPath(request.originalUrl),
      );
      response.redirect(`/auth/google?redirect=${redirect}`);
      return false;
    }

    if (user) throw new ForbiddenException('Admin access required');
    throw new UnauthorizedException();
  }
}
