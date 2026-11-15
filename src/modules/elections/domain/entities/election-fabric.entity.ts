import { ElectionStatusType } from '../value-objects/election-status.vo';

export interface CreateElectionFabricInput {
  docType: 'election';
  electionId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: ElectionStatusType;
  signingPublicKey: string;
  createdBy: string;
  updatedBy: string;
  timeline: {
    createdAt: string;
    startedAt?: string;
    closedAt?: string;
    publishedAt?: string;
    canceledAt?: string;
  };
}

export interface RestoreElectionFabricInput {
  docType: 'election';
  electionId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: ElectionStatusType;
  signingPublicKey: string;
  createdBy: string;
  updatedBy: string;
  timeline: {
    createdAt: string;
    startedAt?: string;
    closedAt?: string;
    publishedAt?: string;
    canceledAt?: string;
  };
}

export class ElectionFabricEntity {
  constructor(
    public readonly electionId: string,
    public readonly signingPublicKey: string,
    public readonly createdAt: Date | null,
    public readonly startedAt: Date | null,
    public readonly closedAt: Date | null,
    public readonly publishedAt: Date | null,
    public readonly canceledAt: Date | null,
  ) {}

  static create(input: CreateElectionFabricInput): ElectionFabricEntity {
    return new ElectionFabricEntity(
      input.electionId,
      input.signingPublicKey,
      input.timeline.createdAt ? new Date(input.timeline.createdAt) : null,
      input.timeline.startedAt ? new Date(input.timeline.startedAt) : null,
      input.timeline.closedAt ? new Date(input.timeline.closedAt) : null,
      input.timeline.publishedAt ? new Date(input.timeline.publishedAt) : null,
      input.timeline.canceledAt ? new Date(input.timeline.canceledAt) : null,
    );
  }

  static restore(input: RestoreElectionFabricInput): ElectionFabricEntity {
    return new ElectionFabricEntity(
      input.electionId,
      input.signingPublicKey,
      input.timeline.createdAt ? new Date(input.timeline.createdAt) : null,
      input.timeline.startedAt ? new Date(input.timeline.startedAt) : null,
      input.timeline.closedAt ? new Date(input.timeline.closedAt) : null,
      input.timeline.publishedAt ? new Date(input.timeline.publishedAt) : null,
      input.timeline.canceledAt ? new Date(input.timeline.canceledAt) : null,
    );
  }
}
