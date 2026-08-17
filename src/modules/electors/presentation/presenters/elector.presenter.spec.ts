import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorPresenter } from './elector.presenter';

describe('ElectorPresenter', () => {
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

  describe('toSearchResponse', () => {
    it('maps all exposed fields to the response DTO', () => {
      const response = ElectorPresenter.toSearchResponse(buildEntity());

      expect(response).toEqual({
        id: 'elector-1',
        firstName: 'Juan Camilo',
        lastName: 'Garcia Saenz',
        email: 'juan.garcia@correounivalle.edu.co',
        studentCode: '202012345',
        programCode: '2710',
        status: 'ACTIVE',
        createdAt: '2026-08-09T12:00:00.000Z',
      });
    });

    it('never exposes passwordHash', () => {
      const response = ElectorPresenter.toSearchResponse(buildEntity());

      expect(response).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(response)).not.toContain('pbkdf2$test-hash');
    });

    it('exposes no relation data', () => {
      const response = ElectorPresenter.toSearchResponse(buildEntity());

      expect(JSON.stringify(response)).not.toContain('electoralRolls');
    });
  });

  describe('toSearchList', () => {
    it('maps multiple entities preserving order', () => {
      const entities = [buildEntity(), buildEntity({ id: 'elector-2', studentCode: '202012346' })];

      const responses = ElectorPresenter.toSearchList(entities);

      expect(responses).toHaveLength(2);
      expect(responses[0].id).toBe('elector-1');
      expect(responses[1].id).toBe('elector-2');
    });

    it('returns an empty array for an empty input', () => {
      expect(ElectorPresenter.toSearchList([])).toEqual([]);
    });
  });
});
