import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ResultsNotPublishedError extends ConflictException {
  constructor() {
    super('Results are not published for this election.', 'RESULTS_NOT_PUBLISHED');
  }
}
