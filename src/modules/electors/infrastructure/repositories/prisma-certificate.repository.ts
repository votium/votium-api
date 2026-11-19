import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { PrismaService } from 'src/shared/database/prisma.service';
import { Prisma } from '../../../../../generated/prisma/client';
import type { CertificateEntity } from '../../domain/entities/certificate.entity';
import type {
  CertificateRepository,
  EnsureCertificateInput,
} from '../../domain/repositories/certificate.repository.interface';
import type {
  FindVoterCertificatesParams,
  VoterCertificatePage,
  VoterCertificateReader,
} from '../../domain/repositories/voter-certificate.reader';
import { PrismaCertificateMapper } from '../mappers/prisma-certificate.mapper';

// One retry on a unique violation: either a verification_code collision (new code) or a
// concurrent request that already created the row for the same electoral roll (re-read).
const MAX_ATTEMPTS = 2;

@Injectable()
export class PrismaCertificateRepository implements CertificateRepository, VoterCertificateReader {
  constructor(private readonly prisma: PrismaService) {}

  // Paginated in the database. Selects only the item fields; ballot columns are never read.
  async findByElectorId(params: FindVoterCertificatesParams): Promise<VoterCertificatePage> {
    const { electorId, page, limit } = params;
    const where: Prisma.CertificateWhereInput = {
      electoralRoll: { is: { elector_id: electorId } },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.certificate.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          election_id: true,
          verification_code: true,
          created_at: true,
          election: { select: { name: true, start_date: true, start_time: true } },
          electoralRoll: { select: { last_vote_registered_at: true } },
        },
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        electionId: row.election_id,
        electionName: row.election.name,
        votingDate:
          row.electoralRoll.last_vote_registered_at ??
          new Date(ElectionEntity.toInstant(row.election.start_date, row.election.start_time)),
        verificationCode: row.verification_code,
        issuedAt: row.created_at,
      })),
      total,
    };
  }

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
