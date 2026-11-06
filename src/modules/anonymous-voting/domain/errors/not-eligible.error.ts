import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';

export class NotEligibleError extends ForbiddenException {
  constructor() {
    super('The elector is not eligible for this election.', 'NOT_ELIGIBLE');
  }
}
