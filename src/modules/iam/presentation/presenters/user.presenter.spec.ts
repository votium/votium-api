import { UserEntity } from '../../domain/entities/user.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import { UserPresenter } from './user.presenter';

const buildUser = (role: RoleName) =>
  UserEntity.restore({
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    passwordHash: 'secret-hash',
    role,
    roleId: 'role-1',
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });

describe('UserPresenter.toMeResponse', () => {
  it('maps id, role, name and email from the persisted entity', () => {
    const response = UserPresenter.toMeResponse(buildUser(RoleName.ADMINISTRATOR));

    expect(response).toEqual({
      user: {
        id: 'user-1',
        role: 'ADMINISTRATOR',
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
      },
    });
  });

  it('reflects the AUDITOR role value', () => {
    const response = UserPresenter.toMeResponse(buildUser(RoleName.AUDITOR));

    expect(response.user.role).toBe('AUDITOR');
  });

  it('exposes only { user: { id, role, name, email } } and no secret fields', () => {
    const response = UserPresenter.toMeResponse(buildUser(RoleName.ADMINISTRATOR));

    expect(Object.keys(response)).toEqual(['user']);
    expect(Object.keys(response.user).sort()).toEqual(['email', 'id', 'name', 'role']);
    expect(JSON.stringify(response)).not.toContain('secret-hash');
    expect(JSON.stringify(response)).not.toContain('password');
  });
});
