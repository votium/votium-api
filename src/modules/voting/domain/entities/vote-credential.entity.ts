import {
  VoteCredentialStatusType,
  VOTE_CREDENTIAL_STATUS_VALUES,
} from '../values-objects/vote-credential-status.vo';

export interface CreateVoteCredentialInput {
  electionId: string;
  electorId: string;
  voterHash: string;
  blindedMessageHash: string;
  blindSignature: string;
}

export interface RestoreVoteCredentialInput {
  electionId: string;
  electorId: string;
  voterHash: string;
  blindedMessageHash: string;
  blindSignature: string;
  status: VoteCredentialStatusType;
}
export class VoteCredentialEntity {
  static readonly DEFAULT_STATUS: VoteCredentialStatusType = VOTE_CREDENTIAL_STATUS_VALUES[0]; // 'NONE'

  private constructor(
    public readonly electionId: string,
    public readonly electorId: string,
    public readonly voterHash: string,
    public readonly blindedMessageHash: string,
    public readonly blindSignature: string,
    private _status: VoteCredentialStatusType = VoteCredentialEntity.DEFAULT_STATUS,
  ) {}

  static create(input: CreateVoteCredentialInput): VoteCredentialEntity {
    return new VoteCredentialEntity(
      input.electionId,
      input.electorId,
      input.voterHash,
      input.blindedMessageHash,
      input.blindSignature,
    );
  }

  static restore(input: RestoreVoteCredentialInput): VoteCredentialEntity {
    return new VoteCredentialEntity(
      input.electionId,
      input.electorId,
      input.voterHash,
      input.blindedMessageHash,
      input.blindSignature,
      input.status,
    );
  }

  get status(): VoteCredentialStatusType {
    return this._status;
  }

  set status(newStatus: VoteCredentialStatusType) {
    this._status = newStatus;
  }
}
