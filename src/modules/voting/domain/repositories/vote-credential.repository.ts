import { VoteCredentialEntity } from '../entities/vote-credential.entity';
import { VoteCredentialStatusType } from '../values-objects/vote-credential-status.vo';

export const VOTE_CREDENTIAL_REPOSITORY = Symbol('VOTE_CREDENTIAL_REPOSITORY');

export interface VoteCredentialRepository {
  find(electionoId: string, electorId: string): Promise<VoteCredentialEntity | null>;
  create(input: Omit<VoteCredentialEntity, 'status'>): Promise<void>;
  report(electionId: string, electorId: string): Promise<void>;
  findReported(electionId?: string): Promise<{ electionId: string; voterHash: string }[]>;
  setMarkStatus(
    electionId: string,
    voterHashes: string[],
    s: Extract<VoteCredentialStatusType, 'MARKED' | 'REJECTED'>,
  ): Promise<void>;
  countReported(electionId: string): Promise<number>;
}
