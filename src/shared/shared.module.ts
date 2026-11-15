// src/shared/shared.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VOTER_HASHER_PORT } from './domain/ports/voter-hasher.port';
import { Sha256VoterHasherService } from './infrastructure/crypto/sha256-voter-hasher.service';

@Global() // Opcional: te evita importar SharedModule en cada módulo
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: VOTER_HASHER_PORT,
      useClass: Sha256VoterHasherService,
    },
  ],
  exports: [VOTER_HASHER_PORT],
})
export class SharedModule {}
