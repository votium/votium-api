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

  // Lists issued certificates plus elections whose participation mark is reported or
  // confirmed. Uses local state only and never reads ballot or vote-timing columns.
  async findByElectorId(params: FindVoterCertificatesParams): Promise<VoterCertificatePage> {
    const { electorId, page, limit } = params;

    const rolls = await this.prisma.electoralRoll.findMany({
      where: { elector_id: electorId },
      select: { election_id: true, certificates: { select: { id: true }, take: 1 } },
    });
    const credentials = await this.prisma.voteCredential.findMany({
      where: {
        elector_id: electorId,
        election_id: { in: rolls.map((roll) => roll.election_id) },
        mark_status: { in: ['REPORTED', 'MARKED'] },
      },
      select: { election_id: true, mark_status: true },
    });
    const markByElection = new Map(credentials.map((c) => [c.election_id, c.mark_status]));
    const listedElectionIds = rolls
      .filter((roll) => roll.certificates.length > 0 || markByElection.has(roll.election_id))
      .map((roll) => roll.election_id);

    const where: Prisma.ElectoralRollWhereInput = {
      elector_id: electorId,
      election_id: { in: listedElectionIds },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.electoralRoll.findMany({
        where,
        orderBy: [
          { election: { start_date: 'desc' } },
          { election: { start_time: 'desc' } },
          { id: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          election_id: true,
          election: { select: { name: true, start_date: true, start_time: true } },
          certificates: { select: { verification_code: true, created_at: true }, take: 1 },
        },
      }),
      this.prisma.electoralRoll.count({ where }),
    ]);

    return {
      items: rows.map((row) => {
        const certificate = row.certificates[0];
        const available = !!certificate || markByElection.get(row.election_id) === 'MARKED';
        return {
          electionId: row.election_id,
          electionName: row.election.name,
          votingDate: new Date(
            ElectionEntity.toInstant(row.election.start_date, row.election.start_time),
          ),
          status: available ? ('AVAILABLE' as const) : ('PROCESSING' as const),
          verificationCode: certificate?.verification_code ?? null,
          issuedAt: certificate?.created_at ?? null,
        };
      }),
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
