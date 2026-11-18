import { ElectionTallyLedgerDto } from '../dtos';

export abstract class GetElectionTallyLedgerPort {
  abstract getTally(electionId: string): Promise<ElectionTallyLedgerDto>;
}
