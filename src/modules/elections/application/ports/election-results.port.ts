import { ElectionTallyLedgerDto } from '../dtos';

export abstract class ElectionResultsPort {
  abstract tally(electionId: string): Promise<ElectionTallyLedgerDto>;
}
