# TASK-001 - List Users Implementation Plan

## Summary

Implement a `GET /users` endpoint that returns all active (non-deleted) users. Only authenticated administrators can access it. The response must exclude sensitive data (password).

---

## Affected Layers

| Layer | Files |
|-------|-------|
| **Domain** | `user.repository.interface.ts` — add `findAllActive()` method |
| **Application** | `list-users.use-case.ts` (new) — orchestrates the listing |
| **Infrastructure** | `prisma-user.repository.ts` — implement `findAllActive()` with `deleted_at IS NULL` filter |
| **Presentation** | `users.controller.ts` — add `GET /` handler with guards |
| **Module** | `users.module.ts` — register `ListUsersUseCase` |
| **Tests** | Unit test for `ListUsersUseCase`, integration test for `PrismaUserRepository.findAllActive` |

No changes needed to:
- `UserEntity` — `deleted_at` is a persistence concern, filtered at infrastructure
- `UserResponseDto` / `UserMapper` — reuse existing patterns
- `PrismaUserMapper` — already maps all required fields
- `AuthModule` — guards already exist and are exported

---

## Required Changes

### 1. Domain — `user.repository.interface.ts`

Add a new method to the `UserRepository` interface:

```ts
findAllActive(): Promise<UserEntity[]>;
```

This is the contract that the infrastructure layer must satisfy.

---

### 2. Application — `list-users.use-case.ts` (NEW)

Create file: `src/modules/users/application/use-cases/list-users.use-case.ts`

```ts
@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(): Promise<UserEntity[]> {
    return this.users.findAllActive();
  }
}
```

The use case is intentionally thin — all logic (soft-delete filtering) lives in the repository implementation.

---

### 3. Application — `user.mapper.ts` (optional convenience)

Add a static helper to map arrays:

```ts
static toResponseList(entities: UserEntity[]): UserResponseDto[] {
  return entities.map(UserMapper.toResponse);
}
```

This is optional; the controller could also `.map()` inline. Adding it keeps mapping concern in the mapper.

---

### 4. Infrastructure — `prisma-user.repository.ts`

Implement the new interface method:

```ts
async findAllActive(): Promise<UserEntity[]> {
  const rows = await this.prisma.user.findMany({
    where: { deleted_at: null },
    include: { role: true },
  });
  return rows.map(PrismaUserMapper.toDomain);
}
```

- Uses `deleted_at: null` Prisma filter to exclude soft-deleted users.
- Reuses `PrismaUserMapper.toDomain` for each row.
- The `role` relation is included (already required by the mapper).

---

### 5. Presentation — `users.controller.ts`

Add a new handler to the existing controller:

```ts
@Get()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMINISTRADOR)
async list() {
  const users = await this.listUsers.execute();
  return users.map(UserMapper.toResponse);
}
```

Dependency to inject via constructor:

```ts
private readonly listUsers: ListUsersUseCase
```

Import guards and decorator from the auth module:

```ts
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/presentation/guards/roles.guard';
import { Roles } from 'src/modules/auth/presentation/guards/roles.decorator';
import { RoleName } from '../../domain/value-objects/role-name.vo';
```

---

### 6. Module — `users.module.ts`

Register `ListUsersUseCase` in the `providers` array:

```ts
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';

// In providers:
ListUsersUseCase,
```

---

## Testing Plan

### Unit Tests — `list-users.use-case.spec.ts`

Test file: `src/modules/users/application/use-cases/list-users.use-case.spec.ts`

| Test | Expected |
|------|----------|
| Returns all active users | Use case returns `UserEntity[]` from repository |
| Returns empty array when no active users exist | Use case returns `[]` |
| Delegates to `users.findAllActive()` | Repository method is called exactly once |

Mock `UserRepository` and verify the use case delegates correctly.

### Integration Tests — `prisma-user.repository.integration.spec.ts`

Test file: `test/users/prisma-user.repository.int.spec.ts` (per jest config: `test/**/*.int.spec.ts`)

| Test | Expected |
|------|----------|
| Returns only users where `deleted_at IS NULL` | Soft-deleted user is excluded from result |
| Returns all active users sorted by creation | All non-deleted users appear |
| Returns empty array when all users are deleted | No users in result |

Requires a test database / PrismaService integration.

### E2E (optional, minimal)

An E2E test in `test/users/users.e2e-spec.ts` could verify:
- `GET /users` returns 401 without token
- `GET /users` returns 403 with non-admin token
- `GET /users` returns 200 with admin token and correct shape

But E2E is low priority per the testing strategy (only critical flows). Unit + integration are sufficient.

---

## Risks and Edge Cases

| Concern | Mitigation |
|---------|------------|
| **Soft-delete filtering** — `deleted_at` is on the Prisma model but not exposed in `UserEntity`. This is intentional (persistence concern). | The filtering happens at the repository level, which is correct per architecture. |
| **Role exposure** — The response includes `role` via `UserResponseDto`, while the spec example shows only `id`, `email`, `name`. | The spec does not forbid extra fields. If the PO wants to remove `role`, it's a one-line change in the DTO. |
| **Empty list** — No users exist or all are soft-deleted. | Returns `[]` with 200 status. No special error case needed. |
| **Pagination** — The spec does not mention pagination. | Do not add speculative pagination. If needed later, it can be added as a separate task. |
| **Guard dependencies** — `JwtAuthGuard` injects `TokenServicePort` which is provided by `AuthModule`. | `AuthModule` already exports `JwtAuthGuard` and `RolesGuard`. The `UsersModule` imports `AuthModule`? Let's verify... |

### Dependency Direction Check

The `AuthModule` exports `JwtAuthGuard` and `RolesGuard`. The `UsersController` needs these guards. NestJS allows cross-module usage of exported providers when the importing module imports the exporting module.

**The `UsersModule` currently does NOT import `AuthModule`.** The guards are used in the controller, which belongs to `UsersModule`. To use `JwtAuthGuard` and `RolesGuard`, the `UsersModule` must import `AuthModule`.

```ts
// users.module.ts
imports: [AuthModule],
```

This is already consistent with the pattern — `AuthModule` imports `UsersModule` (for `LoginUseCase`). Adding `AuthModule` to `UsersModule`'s imports creates a circular dependency (`AuthModule -> UsersModule -> AuthModule`).

**Resolution**: NestJS supports forward references for circular dependencies. However, a simpler approach exists here:

- Option A: Create a separate `SharedAuthGuardModule` that both modules import.
- Option B: Use `@Global()` on `AuthModule` so its exports are available everywhere.
- Option C: Move guards to `shared/` since they are cross-cutting concerns.

**Recommendation**: Use `@Global()` decorator on `AuthModule`. This is the simplest change and follows the cross-cutting nature of auth guards. The guards are technical infrastructure, not business logic.

```ts
// auth.module.ts
@Global()
@Module({ ... })
export class AuthModule {}
```

This avoids circular dependency and requires no structural refactoring.

---

## Summary of File Changes

| File | Action |
|------|--------|
| `src/modules/users/domain/repositories/user.repository.interface.ts` | Add `findAllActive()` |
| `src/modules/users/application/use-cases/list-users.use-case.ts` | **CREATE** |
| `src/modules/users/application/mappers/user.mapper.ts` | Add `toResponseList()` (optional) |
| `src/modules/users/infrastructure/repositories/prisma-user.repository.ts` | Implement `findAllActive()` |
| `src/modules/users/presentation/controllers/users.controller.ts` | Add `list()` handler |
| `src/modules/users/users.module.ts` | Register `ListUsersUseCase`, optionally import `AuthModule` |
| `src/modules/auth/auth.module.ts` | Add `@Global()` to avoid circular dependency |
| `src/modules/users/application/use-cases/list-users.use-case.spec.ts` | **CREATE** — unit test |
| `test/users/prisma-user.repository.int.spec.ts` | **CREATE** — integration test |
