import { Module } from '@nestjs/common';

import { ElectionKeyService } from './election-key.service';

@Module({
  providers: [ElectionKeyService],
  exports: [ElectionKeyService],
})
export class BlindSignatureModule {}
