import { Test, TestingModule } from '@nestjs/testing';
import { validateSync } from 'class-validator';

import { BlindSignatureModule } from './blind-signature.module';
import { ElectionKeyService } from './election-key.service';
import { IsRsaPublicKey } from '../../fabric/dto/is-rsa-public-key';

class TestElectionKeyDto {
  @IsRsaPublicKey()
  publicKey!: string;
}

describe('ElectionKeyService', () => {
  let moduleRef: TestingModule;
  let electionKeyService: ElectionKeyService;

  const previousKeyStore = process.env.KEY_STORE;

  beforeAll(async () => {
    process.env.KEY_STORE = 'memory';

    moduleRef = await Test.createTestingModule({
      imports: [BlindSignatureModule],
    }).compile();

    electionKeyService = moduleRef.get(ElectionKeyService);
  });

  afterAll(async () => {
    await moduleRef.close();

    if (previousKeyStore === undefined) {
      delete process.env.KEY_STORE;
    } else {
      process.env.KEY_STORE = previousKeyStore;
    }
  });

  it('should import BlindSignatureModule and inject ElectionKeyService', () => {
    expect(electionKeyService).toBeDefined();
    expect(electionKeyService).toBeInstanceOf(ElectionKeyService);
  });

  it('should generate a public key that passes IsRsaPublicKey', async () => {
    const publicKey = await electionKeyService.ensureElectionKey('test-election-001');

    const dto = new TestElectionKeyDto();
    dto.publicKey = publicKey;

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
  });

  it('should return the same public key for an existing election', async () => {
    const firstKey = await electionKeyService.ensureElectionKey('test-election-002');

    const secondKey = await electionKeyService.ensureElectionKey('test-election-002');

    expect(secondKey).toBe(firstKey);
  });
});
