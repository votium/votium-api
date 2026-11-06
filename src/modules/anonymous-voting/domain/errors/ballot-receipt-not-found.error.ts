import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';

export class BallotReceiptNotFoundError extends NotFoundException {
  constructor() {
    super('Ballot receipt', undefined, 'BALLOT_RECEIPT_NOT_FOUND');
  }
}
