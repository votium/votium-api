import { ElectorEntity } from '../../domain/entities/elector.entity';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import { SearchElectorsUseCase } from './search-electors.use-case';

describe('SearchElectorsUseCase', () => {
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findAll: jest.fn(),
  };

  const baseEntity = {
    id: 'elector-1',
    firstName: 'Juan Camilo',
    lastName: 'Garcia Saenz',
    email: 'juan.garcia@correounivalle.edu.co',
    passwordHash: 'pbkdf2$test-hash',
    studentCode: '202012345',
    programCode: '2710',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-09T12:00:00.000Z'),
  };

  function buildEntity(overrides: Partial<typeof baseEntity> = {}) {
    return ElectorEntity.restore({ ...baseEntity, ...overrides });
  }

  beforeEach(() => jest.clearAllMocks());

  const useCase = () => new SearchElectorsUseCase(electors);
  const lastFindAllParams = () => electors.findAll.mock.calls.at(-1)![0];

  describe('delegates filters to the repository', () => {
    beforeEach(() => {
      electors.findAll.mockResolvedValue({ electors: [], total: 0 });
    });

    it('delegates programCode when searching by program', async () => {
      await useCase().execute({ page: 1, limit: 10, programCode: '2710' });

      expect(lastFindAllParams()).toEqual(expect.objectContaining({ programCode: '2710' }));
    });

    it('delegates studentCode when searching by student code', async () => {
      await useCase().execute({ page: 1, limit: 10, studentCode: '202012345' });

      expect(lastFindAllParams()).toEqual(expect.objectContaining({ studentCode: '202012345' }));
    });

    it('delegates name when searching by name', async () => {
      await useCase().execute({ page: 1, limit: 10, name: 'juan' });

      expect(lastFindAllParams()).toEqual(expect.objectContaining({ name: 'juan' }));
    });

    it('delegates all supplied filters simultaneously', async () => {
      await useCase().execute({
        page: 1,
        limit: 10,
        programCode: '2710',
        studentCode: '202012345',
        name: 'juan',
      });

      expect(lastFindAllParams()).toEqual(
        expect.objectContaining({
          programCode: '2710',
          studentCode: '202012345',
          name: 'juan',
        }),
      );
    });

    it('does not send filters that were not supplied', async () => {
      await useCase().execute({ page: 1, limit: 10 });

      expect(lastFindAllParams()).toEqual({ page: 1, limit: 10 });
    });
  });

  describe('normalizes input', () => {
    beforeEach(() => {
      electors.findAll.mockResolvedValue({ electors: [], total: 0 });
    });

    it('falls back to default page/limit when values are not positive finite numbers', async () => {
      await useCase().execute({ page: NaN, limit: 0 });

      expect(lastFindAllParams()).toEqual({ page: 1, limit: 10 });
    });

    it('preserves valid page and limit', async () => {
      await useCase().execute({ page: 2, limit: 25 });

      expect(lastFindAllParams()).toEqual({ page: 2, limit: 25 });
    });

    it('trims filter values before delegating', async () => {
      await useCase().execute({
        page: 1,
        limit: 10,
        programCode: ' 2710 ',
        studentCode: ' 202012345 ',
        name: ' juan ',
      });

      expect(lastFindAllParams()).toEqual({
        page: 1,
        limit: 10,
        programCode: '2710',
        studentCode: '202012345',
        name: 'juan',
      });
    });

    it('omits whitespace-only filters', async () => {
      await useCase().execute({ page: 1, limit: 10, programCode: '   ', name: '' });

      expect(lastFindAllParams()).toEqual({ page: 1, limit: 10 });
    });
  });

  describe('returns repository results unchanged', () => {
    it('returns multiple matching electors with the total', async () => {
      electors.findAll.mockResolvedValue({
        electors: [buildEntity(), buildEntity({ id: 'elector-2', studentCode: '202012346' })],
        total: 2,
      });

      const result = await useCase().execute({ page: 1, limit: 10 });

      expect(result).toEqual({
        electors: [
          expect.objectContaining({ id: 'elector-1' }),
          expect.objectContaining({ id: 'elector-2' }),
        ],
        total: 2,
      });
    });

    it('returns a collection with a single matching elector', async () => {
      electors.findAll.mockResolvedValue({ electors: [buildEntity()], total: 1 });

      const result = await useCase().execute({ page: 1, limit: 10 });

      expect(result.electors).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('returns an empty collection for zero matches', async () => {
      electors.findAll.mockResolvedValue({ electors: [], total: 0 });

      await expect(useCase().execute({ page: 1, limit: 10 })).resolves.toEqual({
        electors: [],
        total: 0,
      });
    });
  });

  describe('error handling and read-only guarantee', () => {
    it('propagates repository/database errors without transformation', async () => {
      const dbError = new Error('db down');
      electors.findAll.mockRejectedValue(dbError);

      await expect(useCase().execute({ page: 1, limit: 10 })).rejects.toBe(dbError);
    });

    it('performs no write operations during search', async () => {
      electors.findAll.mockResolvedValue({ electors: [], total: 0 });

      await useCase().execute({ page: 1, limit: 10, programCode: '2710' });

      expect(electors.create.mock.calls).toHaveLength(0);
    });
  });
});
