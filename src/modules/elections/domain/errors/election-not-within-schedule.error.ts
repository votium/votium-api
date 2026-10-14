import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

export class ElectionNotWithinScheduleError extends ValidationException {
  constructor() {
    super(
      'The current date/time is outside the election start and closing range.',
      'ELECTION_NOT_WITHIN_SCHEDULE',
    );
  }
}
