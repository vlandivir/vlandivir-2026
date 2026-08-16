import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleSessionGuard } from './google-session.guard';
import { AdminSessionGuard } from './admin-session.guard';
import { EditAccessGuard } from './edit-access.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleSessionGuard,
    AdminSessionGuard,
    EditAccessGuard,
  ],
  exports: [
    AuthService,
    GoogleSessionGuard,
    AdminSessionGuard,
    EditAccessGuard,
  ],
})
export class AuthModule {}
