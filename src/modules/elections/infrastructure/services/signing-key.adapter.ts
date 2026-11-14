import { Injectable } from '@nestjs/common';

import { ElectionKeyService } from '../../../../shared/blind-signature/election-key.service';

import { ElectionSigningKeyPort } from '../../application/ports/election-signing-key.port';

@Injectable()
export class SigningKeyAdapter implements ElectionSigningKeyPort {
  constructor(private readonly electionKeyService: ElectionKeyService) {}

  async ensureKey(electionId: string): Promise<string> {
    return this.electionKeyService.ensureElectionKey(electionId);
  }
}
