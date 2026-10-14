import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

// Raised when a manual close is requested for an election that has not yet reached its
// configured end instant. The automatic close silently skips such elections (it is an
// idempotent job); the manual close surfaces the precondition failure instead.
export class ElectionNotEndedError extends ValidationException {
  constructor() {
    super('The election has not reached its configured end date/time.', 'ELECTION_NOT_ENDED');
  }
}
