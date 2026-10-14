import { UserEntity } from './user.entity';
import { RoleName } from '../value-objects/role-name.vo';
import { UserStatus } from '../value-objects/user-status.vo';
import { UserAlreadyActiveError } from '../errors/user-already-active.error';
import { UserAlreadyDisabledError } from '../errors/user-already-disabled.error';

function restoreUser(overrides: Partial<Parameters<typeof UserEntity.restore>[0]> = {}) {
  return UserEntity.restore({
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
    ...overrides,
  });
}

describe('UserEntity', () => {
  it('detects disabled status', () => {
    const user = restoreUser({ status: UserStatus.DISABLED });

    expect(user.isDisabled()).toBe(true);
  });

  it('detects active status', () => {
    const user = restoreUser({ status: UserStatus.ACTIVE });

    expect(user.isDisabled()).toBe(false);
  });

  it('create() defaults deletedAt to null', () => {
    const user = UserEntity.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      passwordHash: 'hash',
      role: RoleName.ADMINISTRATOR,
      roleId: 'role-1',
    });

    expect(user.deletedAt).toBeNull();
    expect(user.isDeleted()).toBe(false);
    expect(user.isActive()).toBe(true);
  });

  it('restore() round-trips deletedAt', () => {
    const deletedAt = new Date('2026-09-30T00:00:00Z');
    const user = restoreUser({ deletedAt });

    expect(user.deletedAt).toEqual(deletedAt);
    expect(user.isDeleted()).toBe(true);
  });

  it('activate() transitions DISABLED -> ACTIVE', () => {
    const user = restoreUser({ status: UserStatus.DISABLED });

    user.activate();

    expect(user.status).toBe(UserStatus.ACTIVE);
  });

  it('activate() throws when already active', () => {
    const user = restoreUser({ status: UserStatus.ACTIVE });

    expect(() => user.activate()).toThrow(UserAlreadyActiveError);
  });

  it('activate() does not clear a deletion marker', () => {
    const user = restoreUser({
      status: UserStatus.DISABLED,
      deletedAt: new Date('2026-09-30T00:00:00Z'),
    });

    user.activate();

    expect(user.isDeleted()).toBe(true);
  });

  it('delete() marks the user as deleted and keeps status', () => {
    const now = new Date('2026-09-30T00:00:00Z');
    const user = restoreUser({ status: UserStatus.ACTIVE });

    user.delete(now);

    expect(user.isDeleted()).toBe(true);
    expect(user.deletedAt).toEqual(now);
    expect(user.status).toBe(UserStatus.ACTIVE);
  });

  it('isActive() is false for a disabled user', () => {
    expect(restoreUser({ status: UserStatus.DISABLED }).isActive()).toBe(false);
  });

  it('isActive() is false for a deleted user', () => {
    expect(restoreUser({ status: UserStatus.ACTIVE, deletedAt: new Date() }).isActive()).toBe(
      false,
    );
  });

  it('isActive() is true for an active, non-deleted user', () => {
    expect(restoreUser({ status: UserStatus.ACTIVE }).isActive()).toBe(true);
  });

  it('isAuditor() is true only for the AUDITOR role', () => {
    expect(restoreUser({ role: RoleName.AUDITOR }).isAuditor()).toBe(true);
    expect(restoreUser({ role: RoleName.ADMINISTRATOR }).isAuditor()).toBe(false);
  });

  it('deactivate() (disable) throws when already disabled', () => {
    const user = restoreUser({ status: UserStatus.DISABLED });

    expect(() => user.disable()).toThrow(UserAlreadyDisabledError);
  });
});
