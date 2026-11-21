/* eslint-disable @typescript-eslint/unbound-method */
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type {
  VoterCertificatePage,
  VoterCertificateReader,
} from '../../domain/repositories/voter-certificate.reader';
import { ListVoterCertificatesUseCase } from './list-voter-certificates.use-case';

const ELECTOR_ID = '11111111-1111-4111-8111-111111111111';

describe('ListVoterCertificatesUseCase', () => {
  let electors: jest.Mocked<Pick<ElectorRepository, 'findById'>>;
  let certificates: jest.Mocked<VoterCertificateReader>;
  let useCase: ListVoterCertificatesUseCase;

  const page: VoterCertificatePage = {
    items: [
      {
        electionId: 'election-1',
        electionName: 'Elección 2026',
        votingDate: new Date('2026-11-17T15:04:05.000Z'),
        status: 'AVAILABLE',
        verificationCode: '9f86d081884c7d659a2feaa0c55ad015',
        issuedAt: new Date('2026-11-17T15:05:00.000Z'),
      },
    ],
    total: 1,
  };

  beforeEach(() => {
    electors = { findById: jest.fn().mockResolvedValue({ id: ELECTOR_ID }) };
    certificates = { findByElectorId: jest.fn().mockResolvedValue(page) };
    useCase = new ListVoterCertificatesUseCase(
      electors as unknown as ElectorRepository,
      certificates,
    );
  });

  it('LVC-01: throws ElectorNotFoundError and does not query certificates', async () => {
    electors.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ electorId: ELECTOR_ID, page: 1, limit: 10 }),
    ).rejects.toBeInstanceOf(ElectorNotFoundError);
    expect(certificates.findByElectorId).not.toHaveBeenCalled();
  });

  it('LVC-02: delegates the exact electorId, page and limit to the reader', async () => {
    await useCase.execute({ electorId: ELECTOR_ID, page: 3, limit: 5 });

    expect(electors.findById).toHaveBeenCalledWith(ELECTOR_ID);
    expect(certificates.findByElectorId).toHaveBeenCalledWith({
      electorId: ELECTOR_ID,
      page: 3,
      limit: 5,
    });
  });

  it('LVC-03: returns the items and total from the reader unchanged', async () => {
    await expect(useCase.execute({ electorId: ELECTOR_ID, page: 1, limit: 10 })).resolves.toEqual(
      page,
    );
  });

  it('LVC-04: returns an empty page when the elector has no certificates', async () => {
    certificates.findByElectorId.mockResolvedValue({ items: [], total: 0 });

    await expect(useCase.execute({ electorId: ELECTOR_ID, page: 1, limit: 10 })).resolves.toEqual({
      items: [],
      total: 0,
    });
  });

  it('LVC-05: depends only on the elector repository and the certificate reader', () => {
    expect(ListVoterCertificatesUseCase.length).toBe(2);
  });
});
