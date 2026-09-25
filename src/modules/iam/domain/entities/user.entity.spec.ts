import { UserEntity } from './user.entity';
import { RoleName } from '../value-objects/role-name.vo';
import { UserStatus } from '../value-objects/user-status.vo';

describe('UserEntity', () => {
  it('detects disabled status', () => {
    const user = UserEntity.restore({
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      passwordHash: 'hash',
      role: RoleName.ADMINISTRATOR,
      roleId: 'role-1',
      status: UserStatus.DISABLED,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(user.isDisabled()).toBe(true);
  });

  it('detects active status', () => {
    const user = UserEntity.restore({
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      passwordHash: 'hash',
      role: RoleName.ADMINISTRATOR,
      roleId: 'role-1',
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(user.isDisabled()).toBe(false);
  });
});
