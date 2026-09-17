import { ElectorEntity } from 'src/modules/electors/domain/entities/elector.entity';
import { UserEntity } from 'src/modules/iam/domain/entities/user.entity';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from 'src/modules/iam/domain/value-objects/user-status.vo';
import { AuthPresenter } from './auth.presenter';

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

describe('AuthPresenter.toMeUserResponse', () => {
  it('P1: maps id, role, name and email from the persisted user entity', () => {
    const response = AuthPresenter.toMeUserResponse(buildUser(RoleName.ADMINISTRATOR));

    expect(response).toEqual({
      user: {
        id: 'user-1',
        role: 'ADMINISTRATOR',
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
      },
    });
  });

  it('P2: reflects the AUDITOR role value', () => {
    const response = AuthPresenter.toMeUserResponse(buildUser(RoleName.AUDITOR));

    expect(response.user.role).toBe('AUDITOR');
  });

  it('P3: name is the trim of firstName plus lastName', () => {
    const user = buildUser(RoleName.ADMINISTRATOR);
    const response = AuthPresenter.toMeUserResponse(user);

    expect(response.user.name).toBe('Jane Doe');
  });

  it('P4: exposes only { user: { id, role, name, email } } and no secret fields', () => {
    const response = AuthPresenter.toMeUserResponse(buildUser(RoleName.ADMINISTRATOR));

    expect(Object.keys(response)).toEqual(['user']);
    expect(Object.keys(response.user).sort()).toEqual(['email', 'id', 'name', 'role']);
    const body = JSON.stringify(response);
    expect(body).not.toContain('secret-hash');
    expect(body).not.toContain('password');
    expect(body).not.toContain('createdAt');
    expect(body).not.toContain('updatedAt');
    expect(body).not.toContain('roleId');
  });
});

describe('AuthPresenter.toMeElectorResponse', () => {
  it('P5: maps id, role ELECTOR, name and email from the persisted elector entity', () => {
    const response = AuthPresenter.toMeElectorResponse(buildElector());

    expect(response).toEqual({
      user: {
        id: 'elector-1',
        role: 'ELECTOR',
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
      },
    });
  });

  it('P6: exposes only { user: { id, role, name, email } } and no secret/internal fields', () => {
    const response = AuthPresenter.toMeElectorResponse(buildElector());

    expect(Object.keys(response)).toEqual(['user']);
    expect(Object.keys(response.user).sort()).toEqual(['email', 'id', 'name', 'role']);
    const body = JSON.stringify(response);
    expect(body).not.toContain('secret-hash');
    expect(body).not.toContain('password');
    expect(body).not.toContain('studentCode');
    expect(body).not.toContain('programCode');
    expect(body).not.toContain('createdAt');
  });
});
