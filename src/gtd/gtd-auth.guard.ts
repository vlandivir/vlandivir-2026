import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { GtdAuthService, type GtdRequest } from './gtd-auth.service';

@Injectable()
export class GtdAuthGuard implements CanActivate {
  constructor(private readonly auth: GtdAuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    (request as GtdRequest).gtdAuth = await this.auth.authenticate(request);
    return true;
  }
}
