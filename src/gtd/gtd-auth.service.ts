import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parse, validate } from '@telegram-apps/init-data-node';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import {
  GtdIdentityProvider,
  type GtdIdentity,
} from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';

export type GtdAuthContext = { workspaceId: string; identity: GtdIdentity };
export type GtdRequest = Request & { gtdAuth: GtdAuthContext };

@Injectable()
export class GtdAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  async authenticate(request: Request): Promise<GtdAuthContext> {
    const google = this.authService.getSessionFromRequest(request);
    if (google)
      return this.resolveIdentity(
        GtdIdentityProvider.GOOGLE,
        google.email.toLowerCase(),
        google.name || google.email,
      );
    const value = request.headers['x-telegram-init-data'];
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) throw new UnauthorizedException('Authentication required');
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new UnauthorizedException('Telegram auth unavailable');
    try {
      validate(raw, token);
      const user = parse(raw).user;
      if (!user?.id) throw new Error('No Telegram user');
      const displayName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username ||
        String(user.id);
      return this.resolveIdentity(
        GtdIdentityProvider.TELEGRAM,
        String(user.id),
        displayName,
      );
    } catch {
      throw new UnauthorizedException('Invalid Telegram initData');
    }
  }

  private async resolveIdentity(
    provider: GtdIdentityProvider,
    providerId: string,
    displayName: string,
  ): Promise<GtdAuthContext> {
    const existing = await this.prisma.gtdIdentity.findUnique({
      where: { provider_providerId: { provider, providerId } },
    });
    if (existing) {
      if (displayName && existing.displayName !== displayName)
        await this.prisma.gtdIdentity.update({
          where: { id: existing.id },
          data: { displayName },
        });
      return {
        workspaceId: existing.workspaceId,
        identity: { ...existing, displayName },
      };
    }
    try {
      const workspace = await this.prisma.gtdWorkspace.create({
        data: { identities: { create: { provider, providerId, displayName } } },
        include: { identities: true },
      });
      return { workspaceId: workspace.id, identity: workspace.identities[0] };
    } catch {
      const raced = await this.prisma.gtdIdentity.findUnique({
        where: { provider_providerId: { provider, providerId } },
      });
      if (!raced) throw new UnauthorizedException('Could not create account');
      return { workspaceId: raced.workspaceId, identity: raced };
    }
  }
}
