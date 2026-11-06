import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

export class CandidateCompanionIncompleteError extends ValidationException {
  constructor() {
    super(
      'All companion fields must be provided together when a companion is specified.',
      'CANDIDATE_COMPANION_INCOMPLETE',
    );
  }
}
