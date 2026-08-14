import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleSessionGuard } from './google-session.guard';
import { EditAccessGuard } from './edit-access.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleSessionGuard, EditAccessGuard],
  exports: [AuthService, GoogleSessionGuard, EditAccessGuard],
})
export class AuthModule {}
