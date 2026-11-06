import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ResultsNotAvailableError extends ConflictException {
  constructor() {
    super('Results are published when the election closes.', 'RESULTS_NOT_AVAILABLE');
  }
}
