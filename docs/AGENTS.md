# AGENTS.md

Context for AI assistants working on Votium API.

## Project overview

Electronic voting backend. NestJS + Prisma + PostgreSQL.

**Current domains:**
- `iam` — Identity & Access Management (users, roles)
- `auth` — Authentication (JWT)

## Reference documentation

| Document | Content |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture, layers, patterns, SOLID, DDD, dependencies |
| [NAMING_CONVENTIONS.md](NAMING_CONVENTIONS.md) | Naming conventions |
| [TESTING.md](TESTING.md) | Testing strategy |

Always read these documents before implementing changes.

## Project structure

```
src/
├── config/envs.ts                    # Validated environment variables
├── main.ts                           # Bootstrap
├── app.module.ts                     # Root module
├── modules/
│   ├── iam/                          # Identity & Access Management
│   │   ├── domain/                   # Entities, VOs, repositories, errors
│   │   ├── application/              # Use cases, ports, DTOs
│   │   ├── infrastructure/           # Prisma repos, services, gateways
│   │   └── presentation/            # Controllers, HTTP DTOs, presenters
│   └── auth/                         # Authentication (same structure)
└── shared/
    ├── database/prisma.service.ts
    ├── exceptions/                   # DomainException base, filters, error DTOs
    └── pagination/                   # PaginatedResponseDto

test/                                 # Integration and E2E tests
plans/                                # Implementation plans
prisma/                               # Schema and migrations
```

## Implementation rules

1. **Architecture first** — Before coding, analyze the architecture impact. Verify dependency directions (see ARCHITECTURE.md).
2. **TDD** — Write tests before implementation (see TESTING.md).
3. **SOLID** — All code must respect SOLID principles. Favor decoupling, extensibility, and testability.
4. **No business logic duplication** — Business behavior belongs to entities, not use cases.
5. **No framework in domain** — Domain must not import NestJS, Prisma, Express, or HTTP.
6. **Use cases are POCOs** — No `@Injectable()`. Registered via `useFactory`.
7. **Ports for external dependencies** — Every external service is defined as a port in application and implemented in infrastructure.
8. **Gateway for cross-module communication** — Cross-module communication uses a port (Gateway) defined by the consuming module.
9. **Presenters for HTTP transformation** — Controllers must not transform data directly.
10. **Tokens next to interfaces** — Each interface exports its injection token as a constant in the same file.
11. **DomainException without statusCode** — Use a semantic `code`. HTTP mapping is in GlobalExceptionFilter.
12. **Value Objects must always be classes** — Never use enums or primitives as Value Objects. Only create VOs when there is a clear business justification.

## Workflow

```
1. Read existing documentation (SPEC/plan)
2. Create implementation plan in plans/
3. Write tests (red)
4. Implement minimal solution (green)
5. Refactor keeping tests green
6. Validate with lint and build
```

Never implement directly from ambiguous tasks. Always create a plan first.

## Artifact generation

Artifacts must be persisted as files, not only in the conversation:

```
plans/   → <task-id>.plan.md
specs/   → <task-id>.spec.md  (when applicable)
```

## Important restrictions

- Do not use `process.env` directly. Use `src/config/envs.ts`.
- Do not expose stack traces, passwords, or tokens in responses.
- Do not introduce unnecessary patterns or speculative generalization.
- Do not create Value Objects without a clear business justification.
- Do not use DTOs inside the domain layer.
- Do not expose Prisma models outside infrastructure.
