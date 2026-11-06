import { Injectable } from '@nestjs/common';
import { envs } from 'src/config';
import type { KeyProtectionPort } from '../../domain/crypto/key-protection.port';
import { decryptKey, encryptKey } from '../../domain/crypto/key-cipher';

// Adapter that binds the pure AES-GCM functions to the key loaded and validated at startup
// (ELECTION_KEY_ENCRYPTION_KEY_FILE). Nothing else in the module reads the key.
@Injectable()
export class ElectionKeyCipher implements KeyProtectionPort {
  encrypt(plain: Uint8Array): string {
    return encryptKey(plain, envs.electionKeyEncryptionKey);
  }

  decrypt(encoded: string): Uint8Array {
    return decryptKey(encoded, envs.electionKeyEncryptionKey);
  }
}
