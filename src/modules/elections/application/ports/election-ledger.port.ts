import {
  CreateElectionLedgerDto,
  CreateElectionLedgerResultDto,
  ElectionLedgerDto,
  RegisterCandidateLedgerResultDto,
  RegisterCandidateLedgerDto,
  RegisterElectoralRollLedgerResultDto,
  RegisterElectoralRollLedgerDto,
} from '../dtos';

export abstract class ElectionLedgerPort {
  abstract create(input: CreateElectionLedgerDto): Promise<CreateElectionLedgerResultDto>;

  abstract start(electionId: string): Promise<{ txId: string; blockNumber: number }>;

  abstract close(electionId: string): Promise<{ txId: string; blockNumber: number }>;

  abstract publish(electionId: string): Promise<{ txId: string; blockNumber: number }>;

  abstract cancel(electionId: string): Promise<{ txId: string; blockNumber: number }>;

  abstract get(electionId: string): Promise<ElectionLedgerDto>;

  abstract regsiterCandidate(
    input: RegisterCandidateLedgerDto,
  ): Promise<RegisterCandidateLedgerResultDto>;

  abstract registerElectoralRoll(
    input: RegisterElectoralRollLedgerDto,
  ): Promise<RegisterElectoralRollLedgerResultDto>;
}
