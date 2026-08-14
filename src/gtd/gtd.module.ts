import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ServicesModule } from '../services/services.module';
import { GtdApiController } from './gtd-api.controller';
import { GtdAuthGuard } from './gtd-auth.guard';
import { GtdAuthService } from './gtd-auth.service';
import { GtdPagesController } from './gtd-pages.controller';
import { GtdService } from './gtd.service';

@Module({
  imports: [AuthModule, PrismaModule, ServicesModule],
  controllers: [GtdApiController, GtdPagesController],
  providers: [GtdAuthService, GtdAuthGuard, GtdService],
})
export class GtdModule {}
