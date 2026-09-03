import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorPresenter } from './elector.presenter';

const buildElector = () =>
  ElectorEntity.restore({
    id: 'elector-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    passwordHash: 'secret-hash',
    studentCode: 'E1234',
    programCode: '2710',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });

describe('ElectorPresenter.toMeResponse', () => {
  it('maps id, role ELECTOR, name and email from the persisted entity', () => {
    const response = ElectorPresenter.toMeResponse(buildElector());

    expect(response).toEqual({
      user: {
        id: 'elector-1',
        role: 'ELECTOR',
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
      },
    });
  });

  it('name is the concatenation of first name and last name', () => {
    const response = ElectorPresenter.toMeResponse(buildElector());

    expect(response.user.name).toBe('Jane Doe');
  });

  it('exposes only { user: { id, role, name, email } } and no secret/internal fields', () => {
    const response = ElectorPresenter.toMeResponse(buildElector());

    expect(Object.keys(response)).toEqual(['user']);
    expect(Object.keys(response.user).sort()).toEqual(['email', 'id', 'name', 'role']);
    const body = JSON.stringify(response);
    expect(body).not.toContain('secret-hash');
    expect(body).not.toContain('password');
    expect(body).not.toContain('studentCode');
    expect(body).not.toContain('programCode');
  });
});
