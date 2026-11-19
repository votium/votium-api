/* eslint-disable @typescript-eslint/unbound-method */
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollCertificateReader } from 'src/modules/elections/domain/repositories/electoral-roll-certificate.reader';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectoralRollNotFoundError } from 'src/modules/elections/domain/errors/electoral-roll-not-found.error';
import { CertificateEntity } from '../../domain/entities/certificate.entity';
import { CertificateNotAvailableError } from '../../domain/errors/certificate-not-available.error';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { CertificateRepository } from '../../domain/repositories/certificate.repository.interface';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { VoterParticipationPort } from '../ports/voter-participation.port';
import { GetVotingCertificateUseCase } from './get-voting-certificate.use-case';

const ELECTOR_ID = '11111111-1111-4111-8111-111111111111';
const ELECTION_ID = '22222222-2222-4222-8222-222222222222';
const ROLL_ID = '33333333-3333-4333-8333-333333333333';
const CODE = '9f86d081884c7d659a2feaa0c55ad015';
const VOTED_AT = new Date('2026-11-17T15:04:05.000Z');

describe('GetVotingCertificateUseCase', () => {
  let electors: jest.Mocked<Pick<ElectorRepository, 'findById'>>;
  let elections: jest.Mocked<Pick<ElectionRepository, 'findById'>>;
  let electoralRolls: jest.Mocked<ElectoralRollCertificateReader>;
  let certificates: jest.Mocked<CertificateRepository>;
  let participation: jest.Mocked<VoterParticipationPort>;
  let useCase: GetVotingCertificateUseCase;

  const input = { electorId: ELECTOR_ID, electionId: ELECTION_ID };

  beforeEach(() => {
    electors = {
      findById: jest.fn().mockResolvedValue({
        id: ELECTOR_ID,
        firstName: ' Ana María',
        lastName: 'Pérez ',
        studentCode: '202012345',
        email: 'ana@example.com',
        identification: '1000',
      }),
    };
    elections = {
      findById: jest.fn().mockResolvedValue({
        id: ELECTION_ID,
        name: 'Elección 2026',
        startDate: new Date('2026-11-17T00:00:00.000Z'),
        startTime: new Date('1970-01-01T08:30:00.000Z'),
      }),
    };
    electoralRolls = {
      findCertificateRoll: jest
        .fn()
        .mockResolvedValue({ id: ROLL_ID, lastVoteRegisteredAt: VOTED_AT }),
    };
    certificates = {
      findByElectoralRollId: jest.fn(),
      ensureForRoll: jest.fn().mockResolvedValue(
        CertificateEntity.restore({
          id: 'cert-1',
          electoralRollId: ROLL_ID,
          electionId: ELECTION_ID,
          verificationCode: CODE,
          createdAt: new Date(),
        }),
      ),
    };
    participation = { hasConfirmedVote: jest.fn().mockResolvedValue(true) };
    useCase = new GetVotingCertificateUseCase(
      electors as unknown as ElectorRepository,
      elections as unknown as ElectionRepository,
      electoralRolls,
      certificates,
      participation,
    );
  });

  it('VC-01: throws ElectorNotFoundError and skips every other lookup', async () => {
    electors.findById.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ElectorNotFoundError);
    expect(elections.findById).not.toHaveBeenCalled();
    expect(electoralRolls.findCertificateRoll).not.toHaveBeenCalled();
    expect(participation.hasConfirmedVote).not.toHaveBeenCalled();
    expect(certificates.ensureForRoll).not.toHaveBeenCalled();
  });

  it('VC-02: throws ElectionNotFoundError and skips the roll lookup', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(electoralRolls.findCertificateRoll).not.toHaveBeenCalled();
    expect(participation.hasConfirmedVote).not.toHaveBeenCalled();
  });

  it('VC-03: throws ElectoralRollNotFoundError and skips Fabric', async () => {
    electoralRolls.findCertificateRoll.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ElectoralRollNotFoundError);
    expect(participation.hasConfirmedVote).not.toHaveBeenCalled();
    expect(certificates.ensureForRoll).not.toHaveBeenCalled();
  });

  it('VC-04: throws CertificateNotAvailableError when Fabric does not confirm the vote', async () => {
    participation.hasConfirmedVote.mockResolvedValue(false);

    const error = await useCase.execute(input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CertificateNotAvailableError);
    expect((error as CertificateNotAvailableError).code).toBe('CERTIFICATE_NOT_AVAILABLE');
    expect(certificates.ensureForRoll).not.toHaveBeenCalled();
  });

  it('VC-05: returns exactly the five certificate fields when Fabric confirms VOTED', async () => {
    const result = await useCase.execute(input);

    expect(result).toEqual({
      electionName: 'Elección 2026',
      votingDate: VOTED_AT,
      voterName: 'Ana María Pérez',
      voterCode: '202012345',
      verificationCode: CODE,
    });
  });

  it('VC-06: falls back to the scheduled election start when the vote time is null', async () => {
    electoralRolls.findCertificateRoll.mockResolvedValue({
      id: ROLL_ID,
      lastVoteRegisteredAt: null,
    });

    const result = await useCase.execute(input);

    expect(result.votingDate.toISOString()).toBe('2026-11-17T08:30:00.000Z');
  });

  it('VC-07: ensures the certificate for the roll row and reuses its verification code', async () => {
    await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(certificates.ensureForRoll).toHaveBeenCalledWith({
      electoralRollId: ROLL_ID,
      electionId: ELECTION_ID,
    });
    expect(second.verificationCode).toBe(CODE);
  });

  it('VC-08: checks participation with the election and the JWT elector', async () => {
    await useCase.execute(input);

    expect(participation.hasConfirmedVote).toHaveBeenCalledWith({
      electionId: ELECTION_ID,
      electorId: ELECTOR_ID,
    });
    expect(electoralRolls.findCertificateRoll).toHaveBeenCalledWith(ELECTION_ID, ELECTOR_ID);
  });

  it('VC-09: never exposes ballot or personal data beyond the contract', async () => {
    const result = await useCase.execute(input);

    expect(Object.keys(result).sort()).toEqual([
      'electionName',
      'verificationCode',
      'voterCode',
      'voterName',
      'votingDate',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/candidac|ana@example.com|1000/i);
  });
});
