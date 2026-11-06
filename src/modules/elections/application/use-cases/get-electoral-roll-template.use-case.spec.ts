import { parse } from 'csv-parse/sync';
import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectoralRollCsvFileParserService } from '../../infrastructure/services/electoral-roll-csv-file-parser.service';
import {
  ELECTORAL_ROLL_CSV_COLUMNS,
  ELECTORAL_ROLL_GUIDANCE_ROW_PREFIX,
  ELECTORAL_ROLL_TEMPLATE_FILENAME,
} from '../electoral-roll-csv-template';
import { GetElectoralRollTemplateUseCase } from './get-electoral-roll-template.use-case';

function buildElection(currentStatus: 'PENDING' | 'CLOSED' = 'PENDING'): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus,
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

function parseRows(csv: string): string[][] {
  return parse(csv, { relax_column_count: false }) as string[][];
}

describe('GetElectoralRollTemplateUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    nextElectionCode: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findStatusHistory: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    hasElectoralRoll: jest.fn(),
    findExpiredActive: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('UC-01: returns a template whose first row holds the official headers', async () => {
    elections.findById.mockResolvedValue(buildElection());

    const csv = await new GetElectoralRollTemplateUseCase(elections).execute('election-1');
    const [headers] = parseRows(csv);

    expect(headers).toEqual(['studentCode', 'programCode']);
  });

  it('UC-02: returns exactly two rows with one guidance cell per header', async () => {
    elections.findById.mockResolvedValue(buildElection());

    const csv = await new GetElectoralRollTemplateUseCase(elections).execute('election-1');
    const [headers, descriptions] = parseRows(csv);

    expect(parseRows(csv)).toHaveLength(2);
    expect(descriptions).toHaveLength(headers.length);
    expect(descriptions.every((cell) => cell.trim().length > 0)).toBe(true);
  });

  it('UC-02b: marks each guidance cell with the guidance-row prefix', async () => {
    elections.findById.mockResolvedValue(buildElection());

    const csv = await new GetElectoralRollTemplateUseCase(elections).execute('election-1');
    const [, descriptions] = parseRows(csv);

    expect(descriptions.every((cell) => cell.startsWith(ELECTORAL_ROLL_GUIDANCE_ROW_PREFIX))).toBe(
      true,
    );
  });

  it('UC-03: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new GetElectoralRollTemplateUseCase(elections).execute('election-1'),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    await expect(
      new GetElectoralRollTemplateUseCase(elections).execute('election-1'),
    ).rejects.toMatchObject({ code: 'ELECTION_NOT_FOUND' });
  });

  it('UC-04: is deterministic and validates existence with the exact id', async () => {
    elections.findById.mockResolvedValue(buildElection());

    const useCase = new GetElectoralRollTemplateUseCase(elections);
    const first = await useCase.execute('election-1');
    const second = await useCase.execute('election-1');

    expect(first).toBe(second);
    expect(elections.findById.mock.calls).toEqual([['election-1'], ['election-1']]);
  });

  it('UC-05: does not apply a lifecycle gate (non-PENDING election still downloads)', async () => {
    elections.findById.mockResolvedValue(buildElection('CLOSED'));

    const csv = await new GetElectoralRollTemplateUseCase(elections).execute('election-1');

    expect(csv).toContain('studentCode,programCode');
  });

  it('UC-06: the returned template is parsed by the real importer as zero data rows', async () => {
    elections.findById.mockResolvedValue(buildElection());

    const csv = await new GetElectoralRollTemplateUseCase(elections).execute('election-1');
    const parser = new ElectoralRollCsvFileParserService();

    expect(parser.parse(Buffer.from(csv, 'utf8'))).toEqual([]);
  });
});

describe('Electoral roll CSV template contract', () => {
  it('CON-01: columns expose the exact import headers in order', () => {
    expect(ELECTORAL_ROLL_CSV_COLUMNS.map((c) => c.header)).toEqual(['studentCode', 'programCode']);
  });

  it('CON-02: a CSV built from the columns maps to the parser positional destructure', () => {
    const parser = new ElectoralRollCsvFileParserService();
    const headers = ELECTORAL_ROLL_CSV_COLUMNS.map((c) => c.header);
    const csv = `${headers.join(',')}\n12345678,1234`;

    expect(parser.parse(Buffer.from(csv, 'utf8'))).toEqual([
      { studentCode: '12345678', programCode: '1234' },
    ]);
  });

  it('CON-03: guidance cells are non-digit-leading Spanish text documenting enforced rules', () => {
    for (const column of ELECTORAL_ROLL_CSV_COLUMNS) {
      expect(column.description.trim().length).toBeGreaterThan(0);
      expect(column.description).toMatch(/obligatorio/i);
      expect(column.description[0]).toMatch(/[^\d]/);
    }
    expect(ELECTORAL_ROLL_CSV_COLUMNS[1].description).toMatch(/cuatro dígitos/i);
  });

  it('CON-04: the download filename is the exact required value', () => {
    expect(ELECTORAL_ROLL_TEMPLATE_FILENAME).toBe('plantilla_padron_electoral.csv');
  });
});
