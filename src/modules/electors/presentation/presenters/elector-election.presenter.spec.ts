import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectorElectionPresenter } from './elector-election.presenter';

describe('ElectorElectionPresenter', () => {
  const entity = ElectionEntity.restore({
    id: 'election-1',
    electionCode: 'ELECTION-102026-0001',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: 'CREATED',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });

  const participationDate = new Date('2026-09-15T10:00:00.000Z');

  it('P-01: preserves every base and nested detail field', () => {
    const detail = ElectorElectionPresenter.toDetail({
      election: entity,
      statusHistory: [{ status: 'ACTIVE', timestamp: participationDate }],
      candidacies: [],
      registeredVoters: 42,
      hasVoted: true,
      participationDate,
    });

    expect(detail.id).toBe('election-1');
    expect(detail.electionCode).toBe('ELECTION-102026-0001');
    expect(detail.startDate).toBe('2026-10-01');
    expect(detail.startTime).toBe('08:00:00');
    expect(detail.currentStatus).toBe('CREATED');
    expect(detail.statusHistory).toEqual([
      { status: 'ACTIVE', timestamp: '2026-09-15T10:00:00.000Z' },
    ]);
    expect(detail.registeredVoters).toBe(42);
  });

  it('P-02: serializes participationDate as ISO and keeps hasVoted boolean', () => {
    const detail = ElectorElectionPresenter.toDetail({
      election: entity,
      statusHistory: [],
      candidacies: [],
      registeredVoters: 0,
      hasVoted: true,
      participationDate,
    });

    expect(detail.hasVoted).toBe(true);
    expect(detail.participationDate).toBe('2026-09-15T10:00:00.000Z');
  });

  it('P-03: maps a missing participationDate to null', () => {
    const detail = ElectorElectionPresenter.toDetail({
      election: entity,
      statusHistory: [],
      candidacies: [],
      registeredVoters: 0,
      hasVoted: false,
      participationDate: null,
    });

    expect(detail.hasVoted).toBe(false);
    expect(detail.participationDate).toBeNull();
  });

  it('P-04: exposes the voter detail contract without vote content', () => {
    const detail = ElectorElectionPresenter.toDetail({
      election: entity,
      statusHistory: [],
      candidacies: [],
      registeredVoters: 0,
      hasVoted: false,
      participationDate: null,
    });

    expect(Object.keys(detail).sort()).toEqual(
      [
        'id',
        'electionCode',
        'name',
        'description',
        'startDate',
        'startTime',
        'endDate',
        'endTime',
        'currentStatus',
        'blankVoteEnabled',
        'createdAt',
        'statusHistory',
        'candidacies',
        'registeredVoters',
        'hasVoted',
        'participationDate',
      ].sort(),
    );
    expect(detail).not.toHaveProperty('lastVoteCandidacyId');
  });
});
describe('ElectorElectionPresenter.toVoterCertificateListItem', () => {
  const item = {
    electionId: 'election-1',
    electionName: 'Elección 2026',
    votingDate: new Date('2026-11-17T15:04:05.000Z'),
    status: 'AVAILABLE' as const,
    verificationCode: '9f86d081884c7d659a2feaa0c55ad015' as string | null,
    issuedAt: new Date('2026-11-17T15:05:00.000Z') as Date | null,
  };

  it('serializes dates to ISO and maps every field', () => {
    expect({ ...ElectorElectionPresenter.toVoterCertificateListItem(item) }).toEqual({
      electionId: 'election-1',
      electionName: 'Elección 2026',
      votingDate: '2026-11-17T15:04:05.000Z',
      status: 'AVAILABLE',
      verificationCode: '9f86d081884c7d659a2feaa0c55ad015',
      issuedAt: '2026-11-17T15:05:00.000Z',
    });
  });

  it('keeps null certificate fields until it is generated', () => {
    const dto = ElectorElectionPresenter.toVoterCertificateListItem({
      ...item,
      verificationCode: null,
      issuedAt: null,
    });

    expect(dto.verificationCode).toBeNull();
    expect(dto.issuedAt).toBeNull();
  });

  it('adds no fields beyond the six of the contract', () => {
    const dto = ElectorElectionPresenter.toVoterCertificateListItem({
      ...item,
      candidacyId: 'secret',
    } as typeof item);

    expect(Object.keys(dto).sort()).toEqual([
      'electionId',
      'electionName',
      'issuedAt',
      'status',
      'verificationCode',
      'votingDate',
    ]);
  });
});
