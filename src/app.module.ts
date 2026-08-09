import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { IamModule } from './modules/iam/iam.module';
import { AuthModule } from './modules/auth/auth.module';
import { ElectorsModule } from './modules/electors/electors.module';

@Module({
  imports: [IamModule, AuthModule, ElectorsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
