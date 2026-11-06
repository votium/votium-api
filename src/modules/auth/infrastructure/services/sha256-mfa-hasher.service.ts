import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { MfaHasherPort } from '../../application/ports/mfa-hasher.port';

const DIGEST_PATTERN = /^[0-9a-fA-F]{64}$/;

@Injectable()
export class Sha256MfaHasherService implements MfaHasherPort {
  hash(code: string): Promise<string> {
    return Promise.resolve(createHash('sha256').update(code).digest('hex'));
  }

  verify(code: string, hash: string): Promise<boolean> {
    if (!DIGEST_PATTERN.test(hash)) return Promise.resolve(false);

    const computed = createHash('sha256').update(code).digest('hex');
    return Promise.resolve(timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex')));
  }
}
