import { UserEntity } from './user.entity';
import { RoleName } from '../value-objects/role-name.vo';
import { UserStatus } from '../value-objects/user-status.vo';

describe('UserEntity', () => {
  it('detects disabled status', () => {
    const user = new UserEntity(
      '1',
      'John',
      'Doe',
      'john@example.com',
      'hash',
      RoleName.ADMINISTRADOR,
      'role-1',
      UserStatus.DISABLED,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(user.isDisabled()).toBe(true);
  });

  it('detects active status', () => {
    const user = new UserEntity(
      '1',
      'John',
      'Doe',
      'john@example.com',
      'hash',
      RoleName.ADMINISTRADOR,
      'role-1',
      UserStatus.ACTIVE,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(user.isDisabled()).toBe(false);
  });
});
