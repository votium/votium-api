import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { BallotAlreadyUsedError } from '../../domain/errors/ballot-already-used.error';
import { BallotCredentialAlreadyIssuedError } from '../../domain/errors/ballot-credential-already-issued.error';
import { CommitmentAlreadyRegisteredError } from '../../domain/errors/commitment-already-registered.error';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import type {
  AnonymousBallotReceipt,
  AnonymousVotingRepository,
  CastAnonymousVoteInput,
  IssueCredentialInput,
  StoredElectionKey,
  TallyRow,
} from '../../domain/repositories/anonymous-voting.repository.interface';

@Injectable()
export class PrismaAnonymousVotingRepository implements AnonymousVotingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findElectionKey(electionId: string): Promise<StoredElectionKey | null> {
    const row = await this.prisma.anonymousElectionKey.findUnique({
      where: { election_id: electionId },
    });
    return row ? { publicKeyPem: row.public_key_pem, privateKeyEnc: row.private_key_enc } : null;
  }

  // createMany + skipDuplicates is a single INSERT ... ON CONFLICT DO NOTHING: concurrent callers
  // cannot create two keys for one election.
  async saveElectionKeyIfAbsent(electionId: string, key: StoredElectionKey): Promise<void> {
    await this.prisma.anonymousElectionKey.createMany({
      data: [
        {
          election_id: electionId,
          public_key_pem: key.publicKeyPem,
          private_key_enc: key.privateKeyEnc,
        },
      ],
      skipDuplicates: true,
    });
  }

  async issueCredential(
    input: IssueCredentialInput,
    sign: (privateKeyEnc: string) => Promise<Uint8Array>,
  ): Promise<Uint8Array> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Share lock on the election row: serializes with cancellation and closure.
        const locked = await tx.$queryRaw<Array<{ current_status: string }>>`
          SELECT current_status FROM elections WHERE id = ${input.electionId} FOR SHARE`;
        if (locked.length === 0 || locked[0].current_status !== 'ACTIVE') {
          throw new ElectionNotActiveError(input.electionId);
        }

        const credential = await tx.anonymousCredential.findUnique({
          where: {
            election_id_elector_id: { election_id: input.electionId, elector_id: input.electorId },
          },
        });
        if (credential) throw new BallotCredentialAlreadyIssuedError();

        const commitment = await tx.anonymousCommitment.findUnique({
          where: { election_id_y: { election_id: input.electionId, y: input.y } },
        });
        if (commitment) throw new CommitmentAlreadyRegisteredError();

        const key = await tx.anonymousElectionKey.findUniqueOrThrow({
          where: { election_id: input.electionId },
        });
        const signature = await sign(key.private_key_enc);

        await tx.anonymousCommitment.create({
          data: { election_id: input.electionId, y: input.y },
        });
        await tx.anonymousCredential.create({
          data: { election_id: input.electionId, elector_id: input.electorId },
        });

        return signature;
      });
    } catch (error) {
      // Concurrent duplicates that pass the pre-checks hit the unique constraints.
      if (isUniqueViolation(error, 'AnonymousCredential')) {
        throw new BallotCredentialAlreadyIssuedError();
      }
      if (isUniqueViolation(error, 'AnonymousCommitment')) {
        throw new CommitmentAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async hasCredentialIssued(electionId: string, electorId: string): Promise<boolean> {
    const row = await this.prisma.anonymousCredential.findUnique({
      where: { election_id_elector_id: { election_id: electionId, elector_id: electorId } },
    });
    return row !== null;
  }

  async hasCommitment(electionId: string, y: string): Promise<boolean> {
    const row = await this.prisma.anonymousCommitment.findUnique({
      where: { election_id_y: { election_id: electionId, y } },
    });
    return row !== null;
  }

  async castVote(input: CastAnonymousVoteInput): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ current_status: string }>>`
          SELECT current_status FROM elections WHERE id = ${input.electionId} FOR SHARE`;
        if (locked.length === 0 || locked[0].current_status !== 'ACTIVE') {
          throw new ElectionNotActiveError(input.electionId);
        }

        // The ledger record: JSON with no identity data. ballot_id is UNIQUE, so a replay fails here.
        await tx.anonymousVote.create({
          data: {
            election_id: input.electionId,
            ballot_id: input.ballotId,
            candidacy_id: input.candidacyId,
            payload: {
              electionId: input.electionId,
              ballotId: input.ballotId,
              candidacyId: input.candidacyId,
              registeredAt: input.now.toISOString(),
            },
            created_at: input.now,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'AnonymousVote')) {
        throw new BallotAlreadyUsedError();
      }
      throw error;
    }
  }

  async findReceipt(electionId: string, ballotId: string): Promise<AnonymousBallotReceipt | null> {
    const row = await this.prisma.anonymousVote.findUnique({ where: { ballot_id: ballotId } });
    if (!row || row.election_id !== electionId) return null;
    // candidacy_id is deliberately not selected: the receipt proves registration, not the choice.
    return { electionId: row.election_id, ballotId: row.ballot_id, registeredAt: row.created_at };
  }

  async tally(electionId: string): Promise<TallyRow[]> {
    const rows = await this.prisma.anonymousVote.groupBy({
      by: ['candidacy_id'],
      where: { election_id: electionId },
      _count: { _all: true },
    });
    return rows.map((row) => ({ candidacyId: row.candidacy_id, votes: row._count._all }));
  }
}

// Prisma reports a unique violation as P2002 with meta.modelName set to the model name, which
// stays stable across constraint renames. Text matching on the error message is not used.
function isUniqueViolation(error: unknown, modelName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: { modelName?: unknown } };
  return code === 'P2002' && meta?.modelName === modelName;
}
