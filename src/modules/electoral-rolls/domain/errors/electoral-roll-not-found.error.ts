import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';

export class ElectoralRollNotFoundError extends NotFoundException {
  constructor(electionId: string, electorId: string) {
    super(
      'Electoral roll association for election and elector',
      `${electionId}/${electorId}`,
      'ELECTORAL_ROLL_NOT_FOUND',
    );
  }
}
