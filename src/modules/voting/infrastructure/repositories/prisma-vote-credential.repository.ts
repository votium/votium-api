import { Injectable, ConflictException } from '@nestjs/common';
import { VoteCredentialRepository } from '../../domain/repositories/vote-credential.repository';
import { PrismaService } from 'src/shared/database/prisma.service';
import { VoteCredentialEntity } from '../../domain/entities/vote-credential.entity';
import { PrismaVoteCredentialMapper } from '../mappers/prisma-vote-credential.mapper';
import {
  type VoteCredentialStatusType,
  VOTE_CREDENTIAL_STATUS_VALUES,
} from '../../domain/values-objects/vote-credential-status.vo';

@Injectable()
export class PrismaVoteCredentialRepository implements VoteCredentialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(electionId: string, electorId: string): Promise<VoteCredentialEntity | null> {
    const row = await this.prisma.voteCredential.findUnique({
      where: {
        election_id_elector_id: {
          election_id: electionId,
          elector_id: electorId,
        },
      },
    });

    if (!row) {
      return null;
    }

    return PrismaVoteCredentialMapper.toDomain(row);
  }

  async create(input: Omit<VoteCredentialEntity, 'status'>): Promise<void> {
    try {
      const row = PrismaVoteCredentialMapper.toPersistence(input as VoteCredentialEntity);
      await this.prisma.voteCredential.create({
        data: row,
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException({
          code: 'SIGNATURE_ALREADY_EXISTS',
          message: 'A vote credential with the same signature already exists.',
        });
      }
      throw e;
    }
  }

  async report(electionId: string, electorId: string): Promise<void> {
    await this.prisma.voteCredential.update({
      where: {
        election_id_elector_id: {
          election_id: electionId,
          elector_id: electorId,
        },
        markStatus: VOTE_CREDENTIAL_STATUS_VALUES[0], // 'NONE'
      },
      data: {
        markStatus: VOTE_CREDENTIAL_STATUS_VALUES[3], // 'REPORTED'
      },
    });
  }

  async findReported(electionId?: string): Promise<{ electionId: string; voterHash: string }[]> {
    const rows = await this.prisma.voteCredential.findMany({
      where: {
        markStatus: VOTE_CREDENTIAL_STATUS_VALUES[3],
        ...(electionId && { election_id: electionId }),
      },
      select: { election_id: true, voter_hash: true },
    });

    return rows.map((row) => ({ electionId: row.election_id, voterHash: row.voter_hash }));
  }

  async setMarkStatus(
    electionId: string,
    hashes: string[],
    s: Extract<VoteCredentialStatusType, 'MARKED' | 'REJECTED'>,
  ): Promise<void> {
    await this.prisma.voteCredential.updateMany({
      where: { election_id: electionId, voter_hash: { in: hashes } },
      data: { markStatus: s },
    });
  }

  async countReported(electionId: string): Promise<number> {
    const count = await this.prisma.voteCredential.count({
      where: { election_id: electionId, markStatus: VOTE_CREDENTIAL_STATUS_VALUES[3] },
    });
    return count;
  }
}
