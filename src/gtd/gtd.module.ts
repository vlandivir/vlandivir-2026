import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ServicesModule } from '../services/services.module';
import { EmailToGtdService } from './email-to-gtd.service';
import { GtdApiController } from './gtd-api.controller';
import { GtdAuthGuard } from './gtd-auth.guard';
import { GtdAuthService } from './gtd-auth.service';
import { GtdPagesController } from './gtd-pages.controller';
import { GtdSearchService } from './gtd-search.service';
import { GtdService } from './gtd.service';

@Module({
  imports: [AuthModule, PrismaModule, forwardRef(() => ServicesModule)],
  controllers: [GtdApiController, GtdPagesController],
  providers: [
    GtdAuthService,
    GtdAuthGuard,
    GtdService,
    GtdSearchService,
    EmailToGtdService,
  ],
  exports: [
    GtdAuthService,
    GtdService,
    GtdSearchService,
    EmailToGtdService,
  ],
})
export class GtdModule {}
