import { ElectionLedgerResultDto } from '../dtos/election-ledger-result.dto';

export interface CreateElectionLedgerInput {
  electionId: string;
  name: string;
  startDate: Date;
  startTime: Date;
  endDate: Date;
  endTime: Date;
  signingPublicKey: string;
}

export abstract class ElectionLedgerPort {
  abstract create(input: CreateElectionLedgerInput): Promise<ElectionLedgerResultDto>;

  abstract start(electionId: string): Promise<void>;

  abstract close(electionId: string): Promise<void>;

  abstract publish(electionId: string): Promise<void>;

  abstract cancel(electionId: string): Promise<void>;

  abstract get(electionId: string): Promise<ElectionLedgerResultDto>;
}
