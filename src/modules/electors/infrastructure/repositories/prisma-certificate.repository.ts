import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import type { CertificateEntity } from '../../domain/entities/certificate.entity';
import type {
  CertificateRepository,
  EnsureCertificateInput,
} from '../../domain/repositories/certificate.repository.interface';
import { PrismaCertificateMapper } from '../mappers/prisma-certificate.mapper';

// One retry on a unique violation: either a verification_code collision (new code) or a
// concurrent request that already created the row for the same electoral roll (re-read).
const MAX_ATTEMPTS = 2;

@Injectable()
export class PrismaCertificateRepository implements CertificateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByElectoralRollId(electoralRollId: string): Promise<CertificateEntity | null> {
    const row = await this.prisma.certificate.findUnique({
      where: { electoral_roll_id: electoralRollId },
    });
    return row ? PrismaCertificateMapper.toDomain(row) : null;
  }

  async ensureForRoll(input: EnsureCertificateInput): Promise<CertificateEntity> {
    for (let attempt = 1; ; attempt++) {
      try {
        const row = await this.prisma.certificate.upsert({
          where: { electoral_roll_id: input.electoralRollId },
          create: {
            electoral_roll_id: input.electoralRollId,
            election_id: input.electionId,
            verification_code: randomBytes(16).toString('hex'),
          },
          // Existing certificate: keep its verification code untouched.
          update: {},
        });
        return PrismaCertificateMapper.toDomain(row);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= MAX_ATTEMPTS) throw error;
        const existing = await this.findByElectoralRollId(input.electoralRollId);
        if (existing) return existing;
      }
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
