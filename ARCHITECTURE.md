# ARCHITECTURE.md

# Overview

This project uses a modular clean architecture approach with strong separation between business logic, infrastructure, and delivery mechanisms.

The architecture is designed to:
- isolate business rules
- minimize framework coupling
- improve maintainability
- support testing
- allow controlled scalability

The project is organized by business context (module-first structure).

---

# High-Level Structure

```txt
src/
├── modules/
│   └── <context>/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       ├── presentation/
│       └── <context>.module.ts
│
├── shared/
├── app.module.ts
└── main.ts
```

Each module represents a business context.

Examples:
- users
- elections
- votes
- authentication

---

# Architectural Layers

---

# Domain Layer

Location:

```txt
domain/
```

The domain layer contains pure business logic and business rules.

It must remain independent from:
- NestJS
- Prisma
- HTTP
- Express
- databases
- external services

The domain layer is the core of the application.

---

## Responsibilities

The domain layer contains:

```txt
entities/
value-objects/
repositories/
errors/
```

---

## Entities

Entities represent business concepts with identity and behavior.

Example:
- User
- Election
- Vote

Entities:
- must not depend on frameworks
- must not contain persistence logic
- must enforce business invariants when appropriate

Example responsibilities:
- validating entity state
- enforcing business rules
- encapsulating business behavior

---

## Value Objects

Value Objects encapsulate validated immutable values.

Examples:
- Email
- Password
- ElectionStatus

Use Value Objects only when:
- validation rules are meaningful
- invariants must be protected
- primitive obsession becomes harmful

Avoid creating unnecessary Value Objects.

---

## Repository Contracts

Repository abstractions belong to the domain layer.

Example:

```txt
repositories/user.repository.interface.ts
```

Repositories define:
- required operations
- return types
- expected behavior

Infrastructure provides implementations.

Domain never knows Prisma.

The name of the interface must be IcontextRespository

---

## Domain Errors

Business errors should be represented using reusable domain exceptions.

Preferred reusable exceptions:
- ValidationError
- NotFoundError
- ConflictError
- UnauthorizedError
- ForbiddenError

Use specific error codes/messages when necessary.

Avoid excessive custom exception classes.

---

# Application Layer

Location:

```txt
application/
```

The application layer orchestrates business operations.

It coordinates:
- entities
- repositories
- ports
- business workflows

It does not contain infrastructure details.

---

## Responsibilities

The application layer contains:

```txt
use-cases/
dtos/
mappers/
ports/
```

---

## Use Cases

Use cases represent application actions.

Examples:
- CreateUserUseCase
- CreateElectionUseCase
- GetElectionResultsUseCase

Use cases:
- orchestrate business flow
- coordinate repositories/services
- enforce application-level rules

Use cases must not:
- access HTTP directly
- know Prisma
- contain framework-specific logic

---

## DTOs

DTOs define external input/output contracts.

DTOs are used for:
- request validation
- response shaping

DTOs should not exist inside domain.

---

## Ports

Ports define external capabilities required by the application layer.

Examples:
- EmailServicePort
- JwtServicePort
- BlockchainGatewayPort

Ports are implemented in infrastructure.

---

## Application Mappers

Application mappers transform:
- DTO -> Entity
- Entity -> DTO

Entities must never be exposed directly to HTTP responses.

---

# Infrastructure Layer

Location:

```txt
infrastructure/
```

Infrastructure contains technical implementations.

Examples:
- Prisma repositories
- external API integrations
- email services
- file storage
- blockchain adapters

---

## Responsibilities

The infrastructure layer contains:

```txt
repositories/
services/
mappers/
```

---

## Prisma Repositories

Repositories implement domain contracts using Prisma.

Prisma must remain isolated inside infrastructure.

Never expose:
- Prisma models
- Prisma enums
- Prisma types

outside infrastructure.

---

## Prisma Mappers

Prisma mappers transform:

```txt
Prisma Model <-> Domain Entity
```

This protects the domain from persistence concerns.

---

## External Services

Infrastructure services implement application ports.

Examples:
- SendGrid
- AWS S3
- Blockchain nodes

---

# Presentation Layer

Location:

```txt
presentation/
```

The presentation layer handles HTTP concerns.

It is responsible for:
- controllers
- guards
- interceptors
- filters

---

## Controllers

Controllers must remain thin.

Controllers only:
- receive requests
- validate input
- call use cases
- return responses

Controllers must not:
- contain business logic
- access Prisma directly
- implement workflows

---

## Guards

Guards handle:
- authentication
- authorization
- request protection

---

## Interceptors

Interceptors handle:
- response transformation
- logging
- request/response concerns

---

## Exception Filters

Global exception filters centralize error handling.

Responsibilities:
- normalize API responses
- map exceptions
- avoid leaking internal details

All API errors must follow a consistent structure.

---

# Shared Layer

Location:

```txt
shared/
```

The shared layer contains cross-cutting technical concerns.

Examples:
- PrismaService
- decorators
- global exception filters
- common utilities

---

## Important Rule

The shared layer must not become a dumping ground.

Do not place:
- business logic
- random helpers
- module-specific code

inside shared.

---

# Dependency Direction

Allowed:

```txt
presentation -> application
application -> domain
infrastructure -> domain
```

Forbidden:

```txt
domain -> infrastructure
domain -> presentation
application -> infrastructure
application -> presentation
```

The domain layer must remain isolated.

---

# Data Flow

Typical request flow:

```txt
HTTP Request
    ↓
Controller
    ↓
DTO Validation
    ↓
Use Case
    ↓
Repository Contract
    ↓
Infrastructure Repository
    ↓
Prisma
    ↓
Database
```

Response flow:

```txt
Database
    ↓
Prisma Model
    ↓
Infrastructure Mapper
    ↓
Domain Entity
    ↓
Application Mapper
    ↓
Response DTO
    ↓
HTTP Response
```

---

# Error Handling Flow

Errors should flow upward through layers.

Example:

```txt
Prisma Error
    ↓
Infrastructure maps to DomainError
    ↓
Use Case propagates error
    ↓
Global Exception Filter
    ↓
Standardized HTTP Response
```

---

# Environment Configuration

Environment variables must be centralized.

Never use:

```ts
process.env
```

directly throughout the application.

Always use:

```txt
envs.ts
```

Application startup must fail on invalid configuration.

---

# Testing Strategy

Testing follows a pragmatic pyramid.

---

## Unit Tests

Focus:
- use cases
- entities
- value objects
- business rules

Avoid framework internals.

---

## Integration Tests

Focus:
- repositories
- database behavior
- Prisma integration
- transactions

---

## E2E Tests

Focus only on critical flows:
- authentication
- election lifecycle
- voting process
- result retrieval

Avoid excessive E2E coverage.

---

# Architectural Principles

The project prioritizes:

- consistency over cleverness
- simplicity over abstraction
- explicitness over magic
- maintainability over premature optimization

Avoid:
- speculative abstractions
- unnecessary patterns
- framework leakage
- overengineering

Architecture decisions should optimize long-term maintainability.