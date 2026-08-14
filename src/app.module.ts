import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ServicesModule } from './services/services.module';
import { MiniAppController } from './mini-app/mini-app.controller';
import { SubsController } from './subs.controller';
import { NotesApiController } from './notes-api.controller';
import { NotificationsApiController } from './notifications-api.controller';
import { MapApiController } from './map-api.controller';
import { MapPagesController } from './map-pages.controller';
import { ReelsApiController } from './reels-api.controller';
import { ReelsPagesController } from './reels-pages.controller';
import { EmailApiController } from './email-api.controller';
import { EmailPagesController } from './email-pages.controller';
import { DiaryApiController } from './diary-api.controller';
import { DiaryPagesController } from './diary-pages.controller';
import { TripApiController } from './trip-api.controller';
import { McpController } from './mcp/mcp.controller';
import { McpToolsService } from './mcp/mcp-tools.service';
import { GtdModule } from './gtd/gtd.module';
import { MapSearchThrottleGuard } from './common/rate-limit.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    ServicesModule,
    TelegramBotModule,
    GtdModule,
  ],
  controllers: [
    AppController,
    MiniAppController,
    SubsController,
    NotesApiController,
    NotificationsApiController,
    MapApiController,
    MapPagesController,
    ReelsApiController,
    ReelsPagesController,
    EmailApiController,
    EmailPagesController,
    DiaryApiController,
    DiaryPagesController,
    TripApiController,
    McpController,
  ],
  providers: [AppService, McpToolsService, MapSearchThrottleGuard],
})
export class AppModule {}
