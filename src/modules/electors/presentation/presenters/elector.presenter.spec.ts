import { ElectorEntity } from '../../domain/entities/elector.entity';
import type { ElectorElectionParticipation } from '../../domain/repositories/elector.repository.interface';
import { ElectorPresenter } from './elector.presenter';

function buildElector(status = 'ACTIVE'): ElectorEntity {
  return ElectorEntity.restore({
    id: 'elector-1',
    firstName: 'Juan Camilo',
    lastName: 'Garcia Saenz',
    email: 'juan.garcia@correounivalle.edu.co',
    passwordHash: 'pbkdf2$210000$salt$hash',
    studentCode: '202012345',
    programCode: '2710',
    identification: '1001234567',
    status,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    updatedAt: new Date('2026-08-20T15:00:00.000Z'),
  });
}

function buildParticipation(
  overrides: Partial<ElectorElectionParticipation> = {},
): ElectorElectionParticipation {
  return {
    electionId: 'election-1',
    electionName: 'Consejo Superior',
    electionStatus: 'PENDING',
    hasVoted: true,
    ...overrides,
  };
}

describe('ElectorPresenter', () => {
  describe('toDetail', () => {
    it('EP-01: maps the exact detail shape', () => {
      const entity = buildElector();
      const participation = [buildParticipation()];

      const detail = ElectorPresenter.toDetail(entity, participation);

      expect(detail).toEqual({
        id: 'elector-1',
        firstName: 'Juan Camilo',
        lastName: 'Garcia Saenz',
        identification: '1001234567',
        studentCode: '202012345',
        programCode: '2710',
        email: 'juan.garcia@correounivalle.edu.co',
        isActive: true,
        createdAt: '2026-08-19T15:00:00.000Z',
        updatedAt: '2026-08-20T15:00:00.000Z',
        elections: [
          {
            id: 'election-1',
            name: 'Consejo Superior',
            status: 'PENDING',
            isEligible: true,
            hasVoted: true,
          },
        ],
      });
    });

    it('EP-02: derives isActive from the entity status', () => {
      expect(ElectorPresenter.toDetail(buildElector('ACTIVE'), []).isActive).toBe(true);
      expect(ElectorPresenter.toDetail(buildElector('INACTIVE'), []).isActive).toBe(false);
    });

    it('EP-03: passes identification through and serializes updatedAt to ISO', () => {
      const entity = buildElector();
      const detail = ElectorPresenter.toDetail(entity, []);

      expect(detail.identification).toBe('1001234567');
      expect(detail.updatedAt).toBe('2026-08-20T15:00:00.000Z');
      expect(new Date(detail.updatedAt).toISOString()).toBe(detail.updatedAt);
    });

    it('EP-04: maps participation entries with isEligible always true', () => {
      const participation = [
        buildParticipation(),
        buildParticipation({
          electionId: 'election-2',
          electionName: 'Consejo de Facultad',
          electionStatus: 'CLOSED',
          hasVoted: false,
        }),
      ];

      const detail = ElectorPresenter.toDetail(buildElector(), participation);

      expect(detail.elections).toHaveLength(2);
      expect(detail.elections[0]).toEqual({
        id: 'election-1',
        name: 'Consejo Superior',
        status: 'PENDING',
        isEligible: true,
        hasVoted: true,
      });
      expect(detail.elections[1]).toEqual({
        id: 'election-2',
        name: 'Consejo de Facultad',
        status: 'CLOSED',
        isEligible: true,
        hasVoted: false,
      });
    });

    it('EP-05: maps an empty participation to an empty elections array', () => {
      const detail = ElectorPresenter.toDetail(buildElector(), []);

      expect(detail.elections).toEqual([]);
    });
  });

  describe('toList regression', () => {
    it('EP-06: still emits exactly the eight list contract keys', () => {
      const list = ElectorPresenter.toList([buildElector()]);

      expect(Object.keys(list[0]).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'email',
          'studentCode',
          'programCode',
          'status',
          'createdAt',
        ].sort(),
      );
    });
  });
});
