import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { IamModule } from './modules/iam/iam.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [IamModule, AuthModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
