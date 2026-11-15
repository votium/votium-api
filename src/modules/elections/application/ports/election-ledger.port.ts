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

  abstract start(electionId: string): Promise<void>;

  abstract close(electionId: string): Promise<void>;

  abstract publish(electionId: string): Promise<void>;

  abstract cancel(electionId: string): Promise<void>;

  abstract get(electionId: string): Promise<ElectionLedgerDto>;

  abstract regsiterCandidate(
    input: RegisterCandidateLedgerDto,
  ): Promise<RegisterCandidateLedgerResultDto>;

  abstract registerElectoralRoll(
    input: RegisterElectoralRollLedgerDto,
  ): Promise<RegisterElectoralRollLedgerResultDto>;
}
