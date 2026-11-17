import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionResultsSyncInconsistentError extends ConflictException {
  constructor() {
    super(
      'The results returned by the ledger are inconsistent with the election candidacies.',
      'RESULTS_SYNC_INCONSISTENT',
    );
  }
}
