import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, SessionUser } from './auth.service';

// Protects routes with the Google session cookie. Browser page requests are
// redirected to the Google sign-in flow; API requests get a plain 401.
@Injectable()
export class GoogleSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = this.authService.getSessionFromRequest(request);
    if (user) {
      (request as Request & { user: SessionUser }).user = user;
      return true;
    }

    const acceptsHtml =
      request.method === 'GET' &&
      (request.headers.accept || '').includes('text/html');
    if (acceptsHtml && this.authService.enabled) {
      const response = context.switchToHttp().getResponse<Response>();
      const redirect = encodeURIComponent(
        this.authService.safeRedirectPath(request.originalUrl),
      );
      response.redirect(`/auth/google?redirect=${redirect}`);
      return false;
    }

    throw new UnauthorizedException();
  }
}
