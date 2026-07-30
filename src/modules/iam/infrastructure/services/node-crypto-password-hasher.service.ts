import { Injectable } from '@nestjs/common';
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { PasswordHasherPort } from '../../application/ports/password-hasher.port';

const DEFAULT_ITERATIONS = 210_000;
const DIGEST = 'sha256';
const KEYLEN = 32;

@Injectable()
export class NodeCryptoPasswordHasherService implements PasswordHasherPort {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = await pbkdf2Async(password, salt, DEFAULT_ITERATIONS);
    return `pbkdf2$${DEFAULT_ITERATIONS}$${salt}$${hash}`;
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const [algo, itStr, salt, hash] = passwordHash.split('$');
    if (algo !== 'pbkdf2' || !itStr || !salt || !hash) return false;
    const iterations = Number(itStr);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;

    const computed = await pbkdf2Async(password, salt, iterations);
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
  }
}

function pbkdf2Async(password: string, salt: string, iterations: number): Promise<string> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, KEYLEN, DIGEST, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}
