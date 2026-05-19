# TASK-001 - List Users — Test Design

## Overview

This document defines the complete test design for the `GET /users` endpoint. It covers unit tests for the application use case and integration tests for the infrastructure repository. The design follows the project's testing pyramid and naming conventions.

---

## Test Files

| Layer | File | Type | Jest Pattern |
|-------|------|------|-------------|
| **Application** | `src/modules/users/application/use-cases/list-users.use-case.spec.ts` | Unit | `<rootDir>/src/**/*.spec.ts` |
| **Infrastructure** | `test/users/prisma-user.repository.int.spec.ts` | Integration | `<rootDir>/test/**/*.int.spec.ts` |

---

## 1. Unit Test — `ListUsersUseCase`

### Test file

```
src/modules/users/application/use-cases/list-users.use-case.spec.ts
```

### Under Test

`ListUsersUseCase.execute()` — method that delegates to `UserRepository.findAllActive()` and returns `UserEntity[]`.

### Dependencies to Mock

| Dependency | Token | What to Mock |
|-----------|-------|-------------|
| `UserRepository` | `USER_REPOSITORY` | Only `findAllActive()` — the only method the use case calls |

No other repository methods (`findById`, `findByEmail`, `create`, `updateRole`) need to be mocked. The mock object should only implement the used method.

### Test Data

```ts
// --- Factory helpers (local to the spec file) ---

function makeUser(overrides?: Partial<UserEntity>): UserEntity {
  return new UserEntity(
    overrides?.id ?? '550e8400-e29b-41d4-a716-446655440000',
    overrides?.name ?? 'John Doe',
    overrides?.email ?? 'john@example.com',
    overrides?.passwordHash ?? 'hashed-password-not-returned',
    overrides?.role ?? RoleName.ADMINISTRADOR,
  );
}

function makeUserList(count: number): UserEntity[] {
  return Array.from({ length: count }, (_, i) =>
    makeUser({
      id: `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(3, '0')}`,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
    }),
  );
}
```

### Test Cases

#### 1.1 Returns all active users

```
Description:  findAllActive() returns a list of users
              → use case returns the same list unchanged
```

**Setup**:
```ts
const users = makeUserList(3);
const repository = { findAllActive: jest.fn().mockResolvedValue(users) } satisfies Partial<UserRepository>;
const useCase = new ListUsersUseCase(repository as UserRepository);
```

**Assertions**:
```ts
const result = await useCase.execute();
expect(result).toHaveLength(3);
expect(result).toEqual(users);
expect(repository.findAllActive).toHaveBeenCalledTimes(1);
```

---

#### 1.2 Returns empty array when no active users exist

```
Description:  findAllActive() returns []
              → use case returns []
```

**Setup**:
```ts
const repository = { findAllActive: jest.fn().mockResolvedValue([]) } satisfies Partial<UserRepository>;
const useCase = new ListUsersUseCase(repository as UserRepository);
```

**Assertions**:
```ts
const result = await useCase.execute();
expect(result).toEqual([]);
expect(repository.findAllActive).toHaveBeenCalledTimes(1);
```

---

#### 1.3 Propagates repository errors

```
Description:  findAllActive() throws a database error
              → use case re-throws the same error
              (the use case is a transparent delegate; no error wrapping)
```

**Setup**:
```ts
const error = new Error('Database connection failed');
const repository = { findAllActive: jest.fn().mockRejectedValue(error) } satisfies Partial<UserRepository>;
const useCase = new ListUsersUseCase(repository as UserRepository);
```

**Assertions**:
```ts
await expect(useCase.execute()).rejects.toThrow(error);
```

---

#### 1.4 Does not call other repository methods

```
Description:  The use case must only call findAllActive
              and not accidentally invoke other queries
```

**Setup**: Create a full mock of `UserRepository` with spies on all methods.

**Assertions**:
```ts
expect(repository.findAllActive).toHaveBeenCalledTimes(1);
expect(repository.findById).not.toHaveBeenCalled();
expect(repository.findByEmail).not.toHaveBeenCalled();
expect(repository.create).not.toHaveBeenCalled();
expect(repository.updateRole).not.toHaveBeenCalled();
```

---

### Mocking Rules Applied

- ✅ `UserRepository` is mocked (it's an infrastructure boundary)
- ❌ `UserEntity` is NOT mocked — real entity instances are used
- ❌ `RoleName` enum is NOT mocked — real enum values are used
- ❌ The use case has no other injected dependencies — no additional mocks needed

---

## 2. Integration Test — `PrismaUserRepository.findAllActive`

### Test file

```
test/users/prisma-user.repository.int.spec.ts
```

### Under Test

`PrismaUserRepository.findAllActive()` — the actual Prisma query that filters `deleted_at IS NULL` and maps rows to `UserEntity` via `PrismaUserMapper`.

### Test Infrastructure

#### Module Factory

```ts
// Uses Test.createTestingModule as seen in test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/shared/database/prisma.service';
import { PrismaUserRepository } from 'src/modules/users/infrastructure/repositories/prisma-user.repository';
import { PrismaRoleRepository } from 'src/modules/users/infrastructure/repositories/prisma-role.repository';
```

#### Lifecycle

```ts
let prisma: PrismaService;
let repository: PrismaUserRepository;
let roleRepo: PrismaRoleRepository;

beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, PrismaUserRepository, PrismaRoleRepository],
  }).compile();

  prisma = module.get(PrismaService);
  repository = module.get(PrismaUserRepository);
  roleRepo = module.get(PrismaRoleRepository);
});

afterEach(async () => {
  // Clean users first (due to FK constraints), then roles
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

#### Seed Helpers

```ts
async function seedRole(name: string): Promise<{ id: string; name: string }> {
  return prisma.role.create({ data: { name } });
}

async function seedUser(overrides?: {
  name?: string;
  email?: string;
  password_hash?: string;
  role_id?: string;
  deleted_at?: Date | null;
}): Promise<{ id: string; email: string }> {
  const adminRole = await seedRole(RoleName.ADMINISTRADOR);
  return prisma.user.create({
    data: {
      name: overrides?.name ?? 'Test User',
      email: overrides?.email ?? `test-${Date.now()}@example.com`,
      password_hash: overrides?.password_hash ?? 'hashed-password',
      role_id: overrides?.role_id ?? adminRole.id,
      deleted_at: overrides?.deleted_at ?? null,
    },
  });
}
```

### Test Cases

#### 2.1 Returns only active users (excludes soft-deleted)

```
Description:  When users exist with deleted_at = null and deleted_at = <date>,
              only non-deleted users are returned
```

**Setup**:
```ts
const adminRole = await seedRole(RoleName.ADMINISTRADOR);

// Active user
await seedUser({
  name: 'Active User',
  email: 'active@example.com',
  role_id: adminRole.id,
  deleted_at: null,
});

// Soft-deleted user
await seedUser({
  name: 'Deleted User',
  email: 'deleted@example.com',
  role_id: adminRole.id,
  deleted_at: new Date(),
});
```

**Assertions**:
```ts
const result = await repository.findAllActive();
expect(result).toHaveLength(1);
expect(result[0].name).toBe('Active User');
expect(result[0].email).toBe('active@example.com');
```

---

#### 2.2 Returns all active users when none are deleted

```
Description:  When multiple active users exist, all are returned
```

**Setup**:
```ts
const adminRole = await seedRole(RoleName.ADMINISTRADOR);
await seedUser({ name: 'User A', role_id: adminRole.id, email: 'a@example.com' });
await seedUser({ name: 'User B', role_id: adminRole.id, email: 'b@example.com' });
await seedUser({ name: 'User C', role_id: adminRole.id, email: 'c@example.com' });
```

**Assertions**:
```ts
const result = await repository.findAllActive();
expect(result).toHaveLength(3);
```

---

#### 2.3 Returns empty array when all users are soft-deleted

```
Description:  When every user has a deleted_at timestamp, result is []
```

**Setup**:
```ts
const adminRole = await seedRole(RoleName.ADMINISTRADOR);
await seedUser({ name: 'Deleted 1', role_id: adminRole.id, email: 'd1@example.com', deleted_at: new Date() });
await seedUser({ name: 'Deleted 2', role_id: adminRole.id, email: 'd2@example.com', deleted_at: new Date() });
```

**Assertions**:
```ts
const result = await repository.findAllActive();
expect(result).toHaveLength(0);
```

---

#### 2.4 Returns empty array when database has no users

```
Description:  Empty users table → []
```

**Assertions**:
```ts
const result = await repository.findAllActive();
expect(result).toHaveLength(0);
```

---

#### 2.5 Returned entities contain correct field values

```
Description:  Verify the full mapping — all UserEntity fields are populated
              from the Prisma row, including password_hash
```

**Setup**:
```ts
const adminRole = await seedRole(RoleName.ADMINISTRADOR);
const userId = '550e8400-e29b-41d4-a716-446655440000';
await prisma.user.create({
  data: {
    id: userId,
    name: 'Full Mapping Check',
    email: 'mapping@example.com',
    password_hash: 'some-password-hash-value',
    role_id: adminRole.id,
  },
});
```

**Assertions**:
```ts
const result = await repository.findAllActive();
expect(result).toHaveLength(1);
const entity = result[0];
expect(entity.id).toBe(userId);
expect(entity.name).toBe('Full Mapping Check');
expect(entity.email).toBe('mapping@example.com');
expect(entity.passwordHash).toBe('some-password-hash-value');
expect(entity.role).toBe(RoleName.ADMINISTRADOR);
```

---

#### 2.6 Maps role correctly for different roles

```
Description:  Users with different roles get the correct RoleName enum
```

**Setup**:
```ts
const adminRole = await seedRole(RoleName.ADMINISTRADOR);
const auditorRole = await seedRole(RoleName.AUDITOR);
await seedUser({ name: 'Admin', role_id: adminRole.id, email: 'admin@example.com' });
await seedUser({ name: 'Auditor', role_id: auditorRole.id, email: 'auditor@example.com' });
```

**Assertions**:
```ts
const result = await repository.findAllActive();
expect(result).toHaveLength(2);
const admin = result.find(u => u.email === 'admin@example.com');
const auditor = result.find(u => u.email === 'auditor@example.com');
expect(admin?.role).toBe(RoleName.ADMINISTRADOR);
expect(auditor?.role).toBe(RoleName.AUDITOR);
```

---

#### 2.7 Active user with deleted_at = null is explicitly set

```
Description:  Explicit deleted_at: null in the database is treated the same
              as omitting the field
```

**Setup**: Seed a user with `deleted_at: null` explicitly.

**Assertions**: User is returned in results.

---

## 3. Mapper Validation (auxiliary, unit-level)

While `PrismaUserMapper.toDomain` is already exercised by the integration tests, a lightweight isolated unit test for the mapper ensures the mapping contract is clear. This is optional but helpful for documentation.

### Test file (optional)

```
src/modules/users/infrastructure/mappers/prisma-user.mapper.spec.ts
```

### Test cases

| Input | Expected |
|-------|----------|
| Row with all fields and role name `ADMINISTRADOR` | Entity with `RoleName.ADMINISTRADOR` |
| Row with role name `AUDITOR` | Entity with `RoleName.AUDITOR` |
| Row with `password_hash: "secret"` | Entity with `passwordHash: "secret"` |

---

## 4. What NOT to Test

| Scenario | Reason |
|----------|--------|
| Controller-level guard behavior (401/403) | Guards are tested in the auth module; testing them here would be testing framework integration, not business logic |
| HTTP layer / request-response cycle | Unit and integration tests cover the behavior; E2E is available for critical flows only |
| `UserResponseDto` mapping details | `UserMapper.toResponse` is a pure function; tested implicitly in the controller E2E or via a simple mapper unit test if desired |
| `PrismaUserMapper` edge cases (null row) | The repository always returns rows from the DB or empty arrays; null rows are not possible |
| Pagination, sorting, filtering | Not in scope of the spec — don't test for absent features |
| Rate limiting, security headers | Cross-cutting concerns, not specific to this feature |

---

## 5. Test Execution

```bash
# Unit tests
npx jest --selectProjects unit --testPathPattern "list-users.use-case"

# Integration tests (requires running database)
npx jest --selectProjects integration --testPathPattern "prisma-user.repository.int"
```
