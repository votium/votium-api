# Testing Strategy

Strategy based on **business value**, not coverage percentages.

## Test pyramid

```
     ╱╲
    ╱ E2E ╲           ← Critical flows (few)
   ╱────────╲
  ╱ Integration ╲     ← Persistence, adapters (some)
 ╱────────────────╲
╱    Unit Tests     ╲  ← Business logic (many)
╱────────────────────╲
```

## Unit tests

**What to test:**
- Use cases — happy paths, errors, edge cases
- Entities — business behavior (`disable()`, validation)
- Value Objects — when they contain validation logic
- Presenters — data transformation

**What NOT to test:**
- Value Objects without behavior (trivial holders)
- DTOs with properties only (no methods)
- Trivial one-to-one mapping methods
- NestJS module configuration
- Infrastructure implementations (covered by integration)

**Mocks:**
- Mock only boundaries (repositories, ports)
- Use `jest.Mocked<T>` for type safety
- Do not mock entities or value objects

Example of a good test:

```ts
// create-user.use-case.spec.ts
it('creates a user and logs audit', async () => {
  roles.findById.mockResolvedValue(role);
  users.findByEmail.mockResolvedValue(null);
  hasher.hash.mockResolvedValue('hashed');
  users.save.mockResolvedValue(savedUser);

  const useCase = new CreateUserUseCase(users, roles, hasher, audit);
  const result = await useCase.execute(validInput);

  expect(result.email).toBe('john@example.com');
  expect(audit.log).toHaveBeenCalledWith('USER_CREATED', 'admin-1', { userId: 'user-1' });
});
```

## Integration tests

**What to test:**
- Prisma repositories — CRUD, queries, transactions
- Prisma mappers — Prisma Model ↔ Domain Entity transformation
- Gateways — cross-module communication
- Services that interact with the database

**What NOT to test:**
- Use cases (already covered by unit tests)
- Controllers (already covered by E2E)

**When NOT to use mocks:**
- Integration tests must not mock the database. Use a real PostgreSQL instance (testcontainers or dedicated database).

```
test/users/
  prisma-user.repository.int.spec.ts
```

## E2E tests

**What to test:**
- Authentication (login, protected access)
- User CRUD (creation, deactivation)
- Roles and authorization
- Error handling (400, 401, 403, 404, 409)

**What NOT to test:**
- Every edge case (already covered by unit tests)
- Non-critical flows

E2E tests use supertest against the real application (with a test database).

```
test/
  app.e2e-spec.ts
```

## Expected coverage

No fixed percentage. Guideline:

| Layer | Goal |
|-------|------|
| Domain entities | High (business behavior) |
| Use cases | High (happy paths + errors) |
| Presenters | Medium (non-trivial transformations) |
| Repositories | High (CRUD + queries) |
| Controllers | Low (thin, covered by E2E) |
| NestJS modules | Do not test |
| DTOs | Do not test (trivial) |
| Config | Do not test |

## Test locations

```
src/modules/<context>/
  application/use-cases/<use-case>.spec.ts        # Unit
  domain/entities/<entity>.spec.ts                # Unit

test/
  <context>/<file>.int.spec.ts                    # Integration
  <file>.e2e-spec.ts                              # E2E

src/shared/
  pagination/<dto>.spec.ts                        # Unit (when it has logic)
```

## Running tests

```bash
npm test                 # Unit
npm run test:integration # Integration
npm run test:e2e         # E2E
npm run test:cov         # Coverage
```
