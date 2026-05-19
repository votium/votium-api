# AGENTS.md

## Project Overview

Electronic voting system backend built with:
- NestJS
- Prisma ORM
- PostgreSQL
- Node.js 24.14.1

Current scope excludes blockchain integration. The system currently handles:
- user management
- election management
- authentication
- vote result visualization

Architecture follows a modular clean architecture approach.

---

# Architecture Rules

## Module Structure

Each business context must live inside:

```txt
src/modules/<context>/
```

Each module contains:

```txt
domain/
application/
infrastructure/
presentation/
```

---

## Dependency Rules

Allowed dependencies:

```txt
presentation -> application
application -> domain
infrastructure -> domain
```

Forbidden dependencies:

```txt
domain -> infrastructure
domain -> presentation
application -> presentation
application -> infrastructure
```

The domain layer must remain framework-independent.

Never import:
- NestJS
- Prisma
- Express
- HTTP classes

inside domain.

---

# Domain Rules

## Entities

- Entities represent business concepts.
- Entities must not contain framework-specific code.
- Entities must not expose persistence details.

## Value Objects

Use Value Objects only when:
- business invariants exist
- validation rules are important
- primitive obsession becomes harmful

Avoid unnecessary Value Objects.

## Repositories

Repository contracts belong to the domain layer.

Infrastructure implements repositories.

Never expose Prisma models outside infrastructure.

---

# Application Layer Rules

## Use Cases

- One use case per business action.
- Use cases contain business orchestration.
- Use cases must not know HTTP details.

## DTOs

DTOs belong only to application/presentation boundaries.

Never use DTOs inside domain.

## Mappers

Always map:
- DTO <-> Entity
- Prisma Model <-> Entity

Never expose entities directly to HTTP responses.

---

# Infrastructure Rules

## Prisma

Prisma must only exist inside infrastructure.

Never import:
- Prisma types
- Prisma enums
- Prisma models

outside infrastructure.

All Prisma errors must be mapped to domain errors.

## External Services

Infrastructure services implement application ports.

---

# Presentation Rules

## Controllers

Controllers must remain thin.

Controllers are only responsible for:
- receiving requests
- validating input
- calling use cases
- returning responses

Controllers must not contain business logic.

## Exception Handling

All exceptions must be handled through the global exception filter.

Never expose internal implementation details to clients.

---

# Error Handling Rules

## Domain Errors

Use reusable domain errors whenever possible:
- ValidationError
- NotFoundError
- ConflictError
- UnauthorizedError
- ForbiddenError

Avoid excessive custom exception classes.

Use specific error codes/messages when needed.

## Validation

Use:
- class-validator for input validation
- domain errors for business rule validation

---

# Testing Strategy

Testing follows a pragmatic pyramid.

## Unit Tests

Focus on:
- use cases
- entities
- value objects
- business rules

Avoid testing framework internals.

## Integration Tests

Focus on:
- Prisma repositories
- database persistence
- transactions
- infrastructure adapters

## E2E Tests

Only critical flows:
- authentication
- election creation
- vote flow
- result visualization

Avoid excessive E2E coverage.

---

# TDD Workflow

Development flow:

1. Read SPEC
2. Create implementation plan
3. Design tests
4. Implement minimal solution
5. Refactor
6. Validate with tests

Never implement directly from ambiguous tasks.

---

# Code Quality Rules

- Prefer simple solutions over abstractions.
- Avoid premature optimization.
- Avoid overengineering.
- Keep modules cohesive.
- Keep functions focused and small.
- Use explicit names.
- Avoid magic values.
- Use dependency injection properly.

---

# Environment Rules

Never access process.env directly.

Always use:
```txt
src/config/envs.ts
```

Application must fail fast on invalid environment variables.

---

# Security Rules

Never:
- log passwords
- log tokens
- expose stack traces to clients
- expose internal database errors

Validate all external input.

---

# Agent Behavior Rules

Before implementing:
- analyze architecture impact
- check dependency direction
- verify existing patterns
- reuse existing abstractions when appropriate

Do not introduce:
- unnecessary patterns
- unnecessary abstractions
- speculative generalization
- framework leakage into domain

Prefer consistency over cleverness.

# Artifact Generation Rules

Agents must persist their outputs as files.

Do not provide important artifacts only in chat responses.

Required artifact locations:

```txt
specs/   -> specifications
plans/   -> implementation plans
reviews/ -> review reports
```

All generated files must:
- use kebab-case
- include task identifier
- remain concise and descriptive

Examples:

```txt
specs/task-001-list-users.spec.md
plans/task-001-list-users.plan.md
reviews/task-001-list-users.review.md
```

Generated artifacts must be updated in their respective files, not recreated in chat repeatedly.