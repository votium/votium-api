import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type {
  VoterCertificatePage,
  VoterCertificateReader,
} from '../../domain/repositories/voter-certificate.reader';

export interface ListVoterCertificatesInput {
  electorId: string;
  page: number;
  limit: number;
}

// Read-only: lists the certificates already issued to the authenticated elector. Never
// queries the ledger and never issues missing certificates.
export class ListVoterCertificatesUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly certificates: VoterCertificateReader,
  ) {}

  async execute(input: ListVoterCertificatesInput): Promise<VoterCertificatePage> {
    const elector = await this.electors.findById(input.electorId);
    if (!elector) throw new ElectorNotFoundError(input.electorId);

    return this.certificates.findByElectorId({
      electorId: input.electorId,
      page: input.page,
      limit: input.limit,
    });
  }
}
