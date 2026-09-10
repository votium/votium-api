import { Logger } from '@nestjs/common';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { InternalServerErrorException } from 'src/shared/exceptions/base/internal-server-error.exception';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorDuplicateError } from '../../domain/errors/elector-duplicate.error';
import { ElectoralRegistryDuplicateError } from '../../domain/errors/electoral-registry-duplicate.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { CsvParserPort, ElectorCsvRow } from '../ports/csv-parser.port';
import { ImportElectoralRegistryUseCase } from './import-electoral-registry.use-case';

function buildExistingElector(studentCode: string, email: string): ElectorEntity {
  return ElectorEntity.create({
    firstName: 'Existing',
    lastName: 'User',
    email,
    passwordHash: 'pbkdf2$hash',
    studentCode,
    programCode: '2710',
  });
}

describe('ImportElectoralRegistryUseCase', () => {
  const parser: jest.Mocked<CsvParserPort> = { parse: jest.fn() };
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = { hash: jest.fn(), verify: jest.fn() };

  const buffer = Buffer.from('csv-content', 'utf8');

  const rows: ElectorCsvRow[] = [
    {
      studentCode: '202012345',
      firstName: 'Juan Camilo',
      lastName: 'Garcia Saenz',
      programCode: '2710',
      email: 'juan.garcia@correounivalle.edu.co',
    },
    {
      studentCode: '202012346',
      firstName: 'Maria Fernanda',
      lastName: 'Rodriguez Perez',
      programCode: '2710',
      email: 'maria.rodriguez@correounivalle.edu.co',
    },
    {
      studentCode: '202012347',
      firstName: 'Carlos',
      lastName: 'Lopez',
      programCode: '2711',
      email: 'carlos.lopez@correounivalle.edu.co',
    },
  ];

  const rowsWithDuplicateCode: ElectorCsvRow[] = [
    {
      studentCode: '202012345',
      firstName: 'Juan',
      lastName: 'Garcia',
      programCode: '2710',
      email: 'juan.dup@example.com',
    },
    {
      studentCode: '202012345',
      firstName: 'Ana',
      lastName: 'Perez',
      programCode: '2710',
      email: 'ana.dup@example.com',
    },
  ];

  const rowsWithDuplicateEmail: ElectorCsvRow[] = [
    {
      studentCode: '202012345',
      firstName: 'Juan',
      lastName: 'Garcia',
      programCode: '2710',
      email: 'shared.dup@example.com',
    },
    {
      studentCode: '202012346',
      firstName: 'Ana',
      lastName: 'Perez',
      programCode: '2710',
      email: 'shared.dup@example.com',
    },
  ];

  let useCase: ImportElectoralRegistryUseCase;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    electors.findByStudentCodeOrEmail.mockResolvedValue([]);
    useCase = new ImportElectoralRegistryUseCase(parser, electors, hasher);
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
  });

  it('returns a summary with processed/created/failed counts on success', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    const result = await useCase.execute({ originalName: 'registry.csv', buffer });

    expect(result).toEqual({ processed: 3, created: 3, failed: 0 });
    expect(parser.parse.mock.calls[0]).toEqual([buffer]);
  });

  it('hashes the generated plaintext temporary password', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    await useCase.execute({ originalName: 'registry.csv', buffer });

    expect(hasher.hash.mock.calls.map(([password]) => password)).toEqual([
      'JU202012345GA',
      'MA202012346RO',
      'CA202012347LO',
    ]);
  });

  it('persists the hash, never the plaintext password', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hashed-value');
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    await useCase.execute({ originalName: 'registry.csv', buffer });

    const persisted = electors.create.mock.calls[0][0];
    expect(persisted.passwordHash).toBe('pbkdf2$hashed-value');
    expect(persisted.passwordHash).not.toContain('JU202012345GA');
    expect(persisted.passwordHash).not.toBe('JU202012345GA');
  });

  it('maps every CSV field onto the persisted entity', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    await useCase.execute({ originalName: 'registry.csv', buffer });

    const persisted = electors.create.mock.calls[0][0];
    expect(persisted).toEqual(
      expect.objectContaining({
        studentCode: '202012345',
        firstName: 'Juan Camilo',
        lastName: 'Garcia Saenz',
        programCode: '2710',
        email: 'juan.garcia@correounivalle.edu.co',
        status: 'ACTIVE',
      }),
    );
  });

  it('processes rows sequentially in CSV order', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    await useCase.execute({ originalName: 'registry.csv', buffer });

    const codes = electors.create.mock.calls.map(([entity]) => entity.studentCode);
    expect(codes).toEqual(['202012345', '202012346', '202012347']);
  });

  it('continues after an unexpected per-row error and counts it as failed', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => {
      if (entity.studentCode === '202012346') throw new Error('database exploded');
      return Promise.resolve(entity);
    });

    const result = await useCase.execute({ originalName: 'registry.csv', buffer });

    expect(result).toEqual({ processed: 3, created: 2, failed: 1 });
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  it('continues when hashing fails for a row and does not persist that row', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockImplementation((password) => {
      if (password === 'MA202012346RO') throw new Error('hashing failed');
      return Promise.resolve('pbkdf2$hash');
    });
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    const result = await useCase.execute({ originalName: 'registry.csv', buffer });

    expect(result).toEqual({ processed: 3, created: 2, failed: 1 });
    const codes = electors.create.mock.calls.map(([entity]) => entity.studentCode);
    expect(codes).toEqual(['202012345', '202012347']);
  });

  it('treats a row that still hits the unique constraint as failed (race safety net)', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => {
      if (entity.studentCode === '202012346') throw new ElectorDuplicateError();
      return Promise.resolve(entity);
    });

    const result = await useCase.execute({ originalName: 'registry.csv', buffer });

    expect(result).toEqual({ processed: 3, created: 2, failed: 1 });
    expect(electors.create.mock.calls).toHaveLength(3);
  });

  it('rejects a non-CSV extension with BadRequestException', async () => {
    await expect(useCase.execute({ originalName: 'registry.txt', buffer })).rejects.toMatchObject({
      constructor: BadRequestException,
      message: 'Only CSV files are supported.',
    });
    expect(parser.parse.mock.calls).toHaveLength(0);
  });

  it('rejects an extensionless file with BadRequestException', async () => {
    await expect(useCase.execute({ originalName: 'registry', buffer })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an uppercase .CSV extension', async () => {
    parser.parse.mockReturnValue([]);

    const result = await useCase.execute({ originalName: 'registry.CSV', buffer });

    expect(result).toEqual({ processed: 0, created: 0, failed: 0 });
  });

  it('propagates a BadRequestException raised by the parser', async () => {
    parser.parse.mockImplementation(() => {
      throw new BadRequestException('Invalid CSV format.');
    });

    await expect(useCase.execute({ originalName: 'registry.csv', buffer })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('wraps an unexpected parser error into InternalServerErrorException', async () => {
    parser.parse.mockImplementation(() => {
      throw new Error('parser exploded');
    });

    await expect(useCase.execute({ originalName: 'registry.csv', buffer })).rejects.toMatchObject({
      constructor: InternalServerErrorException,
      message: 'Unexpected error while importing electoral registry.',
    });
  });

  it('returns zero counts when there are no data rows', async () => {
    parser.parse.mockReturnValue([]);

    const result = await useCase.execute({ originalName: 'registry.csv', buffer });

    expect(result).toEqual({ processed: 0, created: 0, failed: 0 });
    expect(hasher.hash.mock.calls).toHaveLength(0);
    expect(electors.create.mock.calls).toHaveLength(0);
  });

  it('returns zero counts without querying for duplicates when the CSV has no rows', async () => {
    parser.parse.mockReturnValue([]);

    await useCase.execute({ originalName: 'registry.csv', buffer });

    expect(electors.findByStudentCodeOrEmail.mock.calls).toHaveLength(0);
  });

  it('never returns password material in the result', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    const result = await useCase.execute({ originalName: 'registry.csv', buffer });

    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('logs import started and completed with counts', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    await useCase.execute({ originalName: 'registry.csv', buffer });

    const logged = loggerLogSpy.mock.calls.map(([message]) => String(message)).join('\n');
    expect(logged).toContain('3 rows to process');
    expect(logged).toContain('processed=3 created=3 failed=0');
  });

  it('never logs a plaintext password', async () => {
    parser.parse.mockReturnValue(rows);
    hasher.hash.mockResolvedValue('pbkdf2$hash');
    electors.create.mockImplementation((entity) => Promise.resolve(entity));

    await useCase.execute({ originalName: 'registry.csv', buffer });

    const logged = [
      ...(loggerLogSpy.mock.calls as string[][]),
      ...(loggerWarnSpy.mock.calls as string[][]),
      ...(loggerErrorSpy.mock.calls as string[][]),
    ]
      .map(([message]) => String(message))
      .join('\n');

    expect(logged).not.toContain('JU202012345GA');
    expect(logged).not.toContain('MA202012346RO');
  });

  describe('duplicate pre-validation', () => {
    it('queries existing records with every student_code and email from the rows', async () => {
      parser.parse.mockReturnValue(rows);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await useCase.execute({ originalName: 'registry.csv', buffer });

      expect(electors.findByStudentCodeOrEmail.mock.calls).toHaveLength(1);
      expect(electors.findByStudentCodeOrEmail.mock.calls[0]).toEqual([
        ['202012345', '202012346', '202012347'],
        [
          'juan.garcia@correounivalle.edu.co',
          'maria.rodriguez@correounivalle.edu.co',
          'carlos.lopez@correounivalle.edu.co',
        ],
      ]);
    });

    it('pre-validates duplicates before persistence', async () => {
      parser.parse.mockReturnValue(rows);
      electors.findByStudentCodeOrEmail.mockResolvedValue([
        buildExistingElector('202012346', 'other@example.com'),
      ]);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(
        useCase.execute({ originalName: 'registry.csv', buffer }),
      ).rejects.toBeInstanceOf(ElectoralRegistryDuplicateError);

      expect(electors.findByStudentCodeOrEmail.mock.calls).toHaveLength(1);
      expect(electors.create.mock.calls).toHaveLength(0);
    });

    it('validates after parsing and before persisting', async () => {
      parser.parse.mockReturnValue(rows);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await useCase.execute({ originalName: 'registry.csv', buffer });

      const parseOrder = parser.parse.mock.invocationCallOrder[0];
      const queryOrder = electors.findByStudentCodeOrEmail.mock.invocationCallOrder[0];
      expect(parseOrder).toBeLessThan(queryOrder);
    });

    it('rejects the entire import when the file contains a duplicate student_code', async () => {
      parser.parse.mockReturnValue(rowsWithDuplicateCode);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(
        useCase.execute({ originalName: 'registry.csv', buffer }),
      ).rejects.toBeInstanceOf(ElectoralRegistryDuplicateError);

      expect(electors.create.mock.calls).toHaveLength(0);
      expect(hasher.hash.mock.calls).toHaveLength(0);
    });

    it('rejects the entire import when the file contains a duplicate email', async () => {
      parser.parse.mockReturnValue(rowsWithDuplicateEmail);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(
        useCase.execute({ originalName: 'registry.csv', buffer }),
      ).rejects.toBeInstanceOf(ElectoralRegistryDuplicateError);

      expect(electors.create.mock.calls).toHaveLength(0);
      expect(hasher.hash.mock.calls).toHaveLength(0);
    });

    it('validates even when the duplicate is only inside the file', async () => {
      parser.parse.mockReturnValue(rowsWithDuplicateCode);
      electors.findByStudentCodeOrEmail.mockResolvedValue([]);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(
        useCase.execute({ originalName: 'registry.csv', buffer }),
      ).rejects.toBeInstanceOf(ElectoralRegistryDuplicateError);

      expect(electors.findByStudentCodeOrEmail.mock.calls).toHaveLength(1);
      expect(electors.create.mock.calls).toHaveLength(0);
    });

    it('rejects the entire import when a student_code already exists in the database', async () => {
      parser.parse.mockReturnValue(rows);
      electors.findByStudentCodeOrEmail.mockResolvedValue([
        buildExistingElector('202012346', 'other@example.com'),
      ]);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(
        useCase.execute({ originalName: 'registry.csv', buffer }),
      ).rejects.toBeInstanceOf(ElectoralRegistryDuplicateError);

      expect(electors.create.mock.calls).toHaveLength(0);
      expect(hasher.hash.mock.calls).toHaveLength(0);
    });

    it('rejects the entire import when an email already exists in the database', async () => {
      parser.parse.mockReturnValue(rows);
      electors.findByStudentCodeOrEmail.mockResolvedValue([
        buildExistingElector('000000000', 'maria.rodriguez@correounivalle.edu.co'),
      ]);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(
        useCase.execute({ originalName: 'registry.csv', buffer }),
      ).rejects.toBeInstanceOf(ElectoralRegistryDuplicateError);

      expect(electors.create.mock.calls).toHaveLength(0);
      expect(hasher.hash.mock.calls).toHaveLength(0);
    });

    it('does not persist any row when the import is rejected', async () => {
      parser.parse.mockReturnValue(rowsWithDuplicateEmail);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(
        useCase.execute({ originalName: 'registry.csv', buffer }),
      ).rejects.toBeInstanceOf(ElectoralRegistryDuplicateError);

      expect(electors.create.mock.calls).toHaveLength(0);
    });

    it('does not hash any password when the import is rejected', async () => {
      parser.parse.mockReturnValue(rowsWithDuplicateCode);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(
        useCase.execute({ originalName: 'registry.csv', buffer }),
      ).rejects.toBeInstanceOf(ElectoralRegistryDuplicateError);

      expect(hasher.hash.mock.calls).toHaveLength(0);
    });

    it('throws the duplicate error with the total duplicate count in the message', async () => {
      const rowsWithMixedDuplicates: ElectorCsvRow[] = [
        {
          studentCode: '202012345',
          firstName: 'Juan',
          lastName: 'Garcia',
          programCode: '2710',
          email: 'a@example.com',
        },
        {
          studentCode: '202012345',
          firstName: 'Ana',
          lastName: 'Perez',
          programCode: '2710',
          email: 'b@example.com',
        },
        {
          studentCode: '202012346',
          firstName: 'Maria',
          lastName: 'Lopez',
          programCode: '2710',
          email: 'c@example.com',
        },
      ];
      parser.parse.mockReturnValue(rowsWithMixedDuplicates);
      electors.findByStudentCodeOrEmail.mockResolvedValue([
        buildExistingElector('999999999', 'c@example.com'),
      ]);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      await expect(useCase.execute({ originalName: 'registry.csv', buffer })).rejects.toMatchObject(
        {
          constructor: ElectoralRegistryDuplicateError,
          code: 'ELECTOR_CONFLICT',
          message: 'The electoral registry contains 2 duplicate record(s). Import rejected.',
        },
      );
    });

    it('continues the import when no duplicates are detected', async () => {
      parser.parse.mockReturnValue(rows);
      hasher.hash.mockResolvedValue('pbkdf2$hash');
      electors.create.mockImplementation((entity) => Promise.resolve(entity));

      const result = await useCase.execute({ originalName: 'registry.csv', buffer });

      expect(result).toEqual({ processed: 3, created: 3, failed: 0 });
    });

    it('propagates a repository query failure', async () => {
      parser.parse.mockReturnValue(rows);
      electors.findByStudentCodeOrEmail.mockRejectedValue(new Error('database exploded'));

      await expect(useCase.execute({ originalName: 'registry.csv', buffer })).rejects.toThrow(
        'database exploded',
      );
    });
  });
});
