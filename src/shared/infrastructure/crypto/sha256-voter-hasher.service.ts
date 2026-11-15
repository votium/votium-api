// src/shared/infrastructure/crypto/sha256-voter-hasher.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { VoterHasherPort, VoterHashPayload } from '../../domain/ports/voter-hasher.port';

@Injectable()
export class Sha256VoterHasherService implements VoterHasherPort {
  private readonly salt: string;

  constructor(private readonly configService: ConfigService) {
    const salt = this.configService.get<string>('VOTER_HASH_SALT');

    // Validación temprana (fail-fast): si no existe el salt, la app no debe arrancar
    if (!salt) {
      throw new Error('La variable de entorno VOTER_HASH_SALT no está definida.');
    }

    this.salt = salt;
  }

  hash(payload: VoterHashPayload): Promise<string> {
    const rawString = `${this.salt}:${payload.electionId}:${payload.electorId}`;
    return Promise.resolve(createHash('sha256').update(rawString).digest('hex'));
  }

  hashBatch(payloads: VoterHashPayload[]): Promise<string[]> {
    return Promise.all(payloads.map((payload) => this.hash(payload)));
  }
}
