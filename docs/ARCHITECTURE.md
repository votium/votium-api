# Architecture

## Overview

Votium API follows **Clean Architecture** organized by business domains (Bounded Contexts). Each domain is a self-contained module with its own internal layers.

The project adopts selected **Domain-Driven Design (DDD)** principles to improve cohesion, maintainability, and scalability. Modules are organized by business domains rather than individual entities. Related entities that belong to the same business capability remain within the same domain.

## Domain organization

```
src/modules/
├── iam/          # Identity & Access Management
└── auth/         # Authentication
```

### IAM — Identity & Access Management

Groups User and Role as a single domain. A user always has a role; a role without a user carries no business meaning.

**Responsibilities:**
- User creation, querying, and deactivation
- Role management
- Password hashing
- Action auditing

### Auth — Authentication

Separate domain that depends on IAM through a **Gateway** (port). It has no knowledge of IAM's internal implementation.

**Responsibilities:**
- Login with credentials
- JWT token issuance
- Authentication and authorization guards

## Layers per module

Each module is organized into 4 layers with unidirectional dependencies:

```
┌─────────────────────────────────────────────────────────────┐
│                    presentation/                            │
│  controllers · guards · dtos · presenters                   │
│                                                             │
│  Depends on: application                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    application/                             │
│  use-cases · dtos · ports                                   │
│                                                             │
│  Depends on: domain                                         │
│  DOES NOT depend on: infrastructure, presentation, NestJS   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    domain/                                  │
│  entities · value-objects · repositories · errors           │
│                                                             │
│  DOES NOT depend on: any external layer, frameworks, Prisma │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 infrastructure/                             │
│  repositories · services · mappers · gateways               │
│                                                             │
│  Depends on: domain (implements interfaces)                 │
└─────────────────────────────────────────────────────────────┘
```

### Dependency rules

**Allowed:**
- `presentation → application`
- `application → domain`
- `infrastructure → domain`

**Forbidden:**
- `domain → any external layer`
- `application → infrastructure`
- `application → presentation`

## Domain Layer

Contains pure business logic. No dependencies on NestJS, Prisma, HTTP, or databases.

### Entities

Use the **Static Factory** pattern with `create()` and `restore()` methods:

- `create()` — public factory for new records. Validates business invariants, generates ID, sets defaults.
- `restore()` — rebuilds from persistence without re-validating already checked invariants.
- Private constructor — enforces usage of `create()`/`restore()`.
- Encapsulate business behavior (e.g., `user.disable()` instead of logic in use cases).

### Value Objects

Value Objects encapsulate validated, immutable values that carry business semantics.

**Rules:**
- Value Objects **must always be implemented as classes**.
- Enums, primitive types, or other representations **must not** be used as Value Objects.
- Use Value Objects only when business invariants need protection or when primitive obsession becomes harmful.
- Do not create Value Objects without a clear business justification.

Note: Some existing code still uses enums for what should be Value Objects. These will be migrated to classes in future iterations.

### Repository Contracts

Interfaces defining required persistence operations. They belong to the domain layer. Infrastructure provides implementations.

Each interface exports its own **injection token** as a named constant in the same file.

### Domain Errors

Hierarchy based on `DomainException` (semantic `code`, no HTTP `statusCode`):

- `NotFoundException`
- `ValidationException`
- `ConflictException`
- `ForbiddenException`
- `UnauthorizedException`

Code-to-HTTP mapping is centralized in `GlobalExceptionFilter`.

## Application Layer

Orchestrates business operations. No knowledge of infrastructure or HTTP.

### Use Cases

- One class per business action.
- Plain objects (POCOs) without NestJS decorators.
- Registered as providers in the module using `useFactory`.
- Dependencies injected via constructor (repositories, ports).
- Must not contain business logic that belongs to entities.

### Ports

Interfaces defining external capabilities required by the application:
- `PasswordHasherPort`
- `AuditLogPort`
- `TokenServicePort`

Each port exports its own injection token.

### Input DTOs

Define the input contract for use cases. Use `class-validator` for validation.

## Infrastructure Layer

Concrete implementations of domain repositories and application ports.

### Prisma Repositories

Implement domain interfaces using Prisma. Map between Prisma models and domain entities via **Prisma Mappers**.

### Services

Implement application ports:
- `JwtTokenService` → `TokenServicePort`
- `NodeCryptoPasswordHasherService` → `PasswordHasherPort`
- `PrismaAuditLogService` → `AuditLogPort`

### Gateways

Bridges for cross-module communication:
- `PrismaIamGateway` → implements `IamGateway` (defined in auth)

## Presentation Layer

Handles HTTP concerns. Thin layer.

### Controllers

- Receive requests
- Validate input
- Call the use case
- Return response using a **Presenter**

### Presenters

Transform use case results into HTTP response format. Isolate presentation transformation logic.

### Guards

- `JwtAuthGuard` — JWT-based authentication
- `RolesGuard` — Role-based authorization

### Exception Filters

`GlobalExceptionFilter` centralizes error handling:

1. Catches `DomainException` and maps `code → HttpStatus`
2. Catches known NestJS/HTTP exceptions
3. Returns a standardized error structure

## Cross-module communication

```
auth (presentation)
    ↓
auth (application) → IamGateway (port defined in auth)
    ↓
iam (infrastructure) → PrismaIamGateway (implementation in iam)
    ↓
iam (domain) → UserRepository, RoleRepository
```

Auth never imports anything from IAM directly. It only knows `IamGateway`.

## Shared

Contains cross-cutting technical concerns:

| Directory | Content |
|-----------|---------|
| `shared/database/` | `PrismaService` (Prisma client singleton) |
| `shared/exceptions/base/` | `DomainException` and base subclasses |
| `shared/exceptions/dto/` | `ErrorResponseDto` |
| `shared/exceptions/filters/` | `GlobalExceptionFilter` |
| `shared/pagination/` | `PaginatedResponseDto` |

## Data flow

```
HTTP Request
    ↓
Controller → validates input (DTO)
    ↓
Use Case → orchestrates operation
    ↓
Repository Contract → domain interface
    ↓
Prisma Repository → concrete implementation
    ↓
Prisma → Database
    ↓
(return) Domain Entity
    ↓
Presenter → transforms to Response DTO
    ↓
HTTP Response
```

## SOLID Principles

All new implementations must respect the SOLID principles:

- **Single Responsibility** — Each class has one clearly defined responsibility. Entities handle business rules, use cases orchestrate flows, controllers manage HTTP concerns.
- **Open/Closed** — Modules are open for extension (new use cases, new implementations) but closed for modification. Add behavior through new classes, not by altering existing ones.
- **Liskov Substitution** — Repository implementations and port adapters must be substitutable without altering the correctness of the program.
- **Interface Segregation** — Ports and repository interfaces define only the methods actually needed by their consumers. Avoid fat interfaces.
- **Dependency Inversion** — High-level modules (domain, application) depend on abstractions (interfaces, ports), not on concrete implementations. Infrastructure depends on domain abstractions.

Design decisions should favor decoupling, extensibility, maintainability, and testability.

## Design principles

- Consistency over cleverness
- Simplicity over abstraction
- Explicitness over magic
- Maintainability over premature optimization

## Key architectural decisions

| Decision | Rationale |
|----------|-----------|
| IAM as a single domain for User + Role | User always has a Role; separating them adds unnecessary complexity |
| Gateway for cross-module communication | Decouples auth from IAM; each domain exposes only what is needed |
| Static Factory (`create`/`restore`) on entities | Centralizes creation and reconstruction; private constructor |
| Use cases as POCOs without decorators | Application layer must not know NestJS |
| DomainException without statusCode | Avoids HTTP coupling in the domain; centralized mapping |
| Presenters as a separate layer | Isolates HTTP transformation logic from the application |
| DDD-inspired domain organization | Improves cohesion by grouping entities by business capability |

## Future domains

Based on the Prisma schema:
- Election (election management)
- Voting (voting process)
- Reporting (reports and results)
