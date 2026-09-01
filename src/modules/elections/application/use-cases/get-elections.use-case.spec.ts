import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { GetElectionsUseCase } from './get-elections.use-case';

function buildElection(): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
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
}

function date(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

describe('GetElectionsUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findAll.mockResolvedValue({ elections: [], total: 0 });
  });

  it('defaults to schedule-active elections when no status/active filter is provided', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10 });

    const args = elections.findAll.mock.calls[0][0];
    expect(args.active).toBe(true);
    expect(args.status).toBeUndefined();
  });

  it('forwards an explicit active=true as-is', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, active: true });

    expect(elections.findAll.mock.calls[0][0].active).toBe(true);
  });

  it('forwards an explicit active=false as-is (not overridden by the default)', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, active: false });

    expect(elections.findAll.mock.calls[0][0].active).toBe(false);
  });

  it('never overrides the repository clock (now stays undefined)', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, active: true });

    expect(elections.findAll.mock.calls[0][0].now).toBeUndefined();
  });

  it('does not add the default active filter when status is provided without active', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, status: 'CREATED' });

    const args = elections.findAll.mock.calls[0][0];
    expect(args.status).toBe('CREATED');
    expect(args.active).toBeUndefined();
  });

  it('combines status and active filters when both are provided', async () => {
    await new GetElectionsUseCase(elections).execute({
      page: 1,
      limit: 10,
      status: 'PENDING',
      active: true,
    });

    const args = elections.findAll.mock.calls[0][0];
    expect(args.status).toBe('PENDING');
    expect(args.active).toBe(true);
  });

  it('forwards name while still applying the default active filter', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, name: 'Council' });

    const args = elections.findAll.mock.calls[0][0];
    expect(args.name).toBe('Council');
    expect(args.active).toBe(true);
  });

  it('parses startDate to a UTC-midnight Date value', async () => {
    await new GetElectionsUseCase(elections).execute({
      page: 1,
      limit: 10,
      startDate: '2026-08-29',
    });

    expect(elections.findAll.mock.calls[0][0].startDate).toEqual(date(2026, 8, 29));
  });

  it('parses endDate to a UTC-midnight Date value', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, endDate: '2026-12-31' });

    expect(elections.findAll.mock.calls[0][0].endDate).toEqual(date(2026, 12, 31));
  });

  it('leaves startDate/endDate undefined when not provided', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10 });

    const args = elections.findAll.mock.calls[0][0];
    expect(args.startDate).toBeUndefined();
    expect(args.endDate).toBeUndefined();
  });

  it('rejects a malformed startDate with ELECTION_INVALID_DATE and never calls findAll', async () => {
    await expect(
      new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, startDate: '2026-13-40' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, startDate: '2026-13-40' }),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE' });
    expect(elections.findAll.mock.calls).toHaveLength(0);
  });

  it('rejects a malformed endDate with ELECTION_INVALID_DATE and never calls findAll', async () => {
    await expect(
      new GetElectionsUseCase(elections).execute({ page: 1, limit: 10, endDate: '2026-02-30' }),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE' });
    expect(elections.findAll.mock.calls).toHaveLength(0);
  });

  it('normalizes non-positive page/limit values to the defaults (1/10)', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 0, limit: -5 });

    const args = elections.findAll.mock.calls[0][0];
    expect(args.page).toBe(1);
    expect(args.limit).toBe(10);
  });

  it('normalizes NaN page/limit values to the defaults (1/10)', async () => {
    await new GetElectionsUseCase(elections).execute({ page: Number.NaN, limit: Number.NaN });

    const args = elections.findAll.mock.calls[0][0];
    expect(args.page).toBe(1);
    expect(args.limit).toBe(10);
  });

  it('forwards valid page/limit values intact', async () => {
    await new GetElectionsUseCase(elections).execute({ page: 2, limit: 25 });

    const args = elections.findAll.mock.calls[0][0];
    expect(args.page).toBe(2);
    expect(args.limit).toBe(25);
  });

  it('returns the repository result unchanged', async () => {
    const result = { elections: [buildElection()], total: 1 };
    elections.findAll.mockResolvedValue(result);

    const returned = await new GetElectionsUseCase(elections).execute({ page: 1, limit: 10 });

    expect(returned).toBe(result);
  });

  it('propagates unexpected repository failures unchanged', async () => {
    elections.findAll.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionsUseCase(elections).execute({ page: 1, limit: 10 }),
    ).rejects.toThrow('database exploded');
  });
});
