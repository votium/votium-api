# NAMING_CONVENTIONS.md

# Overview

This document defines naming conventions used across the project.

Consistency is mandatory.

Avoid inventing alternative naming styles.

---

# General Rules

- Use kebab-case for file names.
- Use PascalCase for classes.
- Use camelCase for variables/functions.
- File names must reflect their responsibility.
- Prefer explicit names over abbreviations.

---

# File Naming Conventions

---

## Entities

Pattern:

```txt
<entity>.entity.ts
```

Examples:

```txt
user.entity.ts
election.entity.ts
vote.entity.ts
```

Class naming:

```ts
UserEntity
ElectionEntity
```

---

## Value Objects

Pattern:

```txt
<value>.vo.ts
```

Examples:

```txt
email.vo.ts
password.vo.ts
election-status.vo.ts
```

Class naming:

```ts
EmailVO
PasswordVO
```

---

## Repository Contracts

Pattern:

```txt
<entity>.repository.ts
```

Examples:

```txt
user.repository.ts
election.repository.ts
```

Avoid:

```txt
user.repository.interface.ts
i-user.repository.ts
```

Class/interface naming:

```ts
UserRepository
ElectionRepository
```

---

## Prisma Repository Implementations

Pattern:

```txt
prisma-<entity>.repository.ts
```

Examples:

```txt
prisma-user.repository.ts
prisma-election.repository.ts
```

Class naming:

```ts
PrismaUserRepository
PrismaElectionRepository
```

---

## Use Cases

Pattern:

```txt
<action>-<entity>.use-case.ts
```

Examples:

```txt
create-user.use-case.ts
get-user.use-case.ts
create-election.use-case.ts
```

Class naming:

```ts
CreateUserUseCase
GetUserUseCase
```

Use cases should represent business actions.

---

## DTOs

Input DTO pattern:

```txt
<action>-<entity>.dto.ts
```

Examples:

```txt
create-user.dto.ts
update-election.dto.ts
```

Response DTO pattern:

```txt
<entity>-response.dto.ts
```

Examples:

```txt
user-response.dto.ts
election-response.dto.ts
```

Class naming:

```ts
CreateUserDto
UserResponseDto
```

---

## Mappers

Pattern:

```txt
<entity>.mapper.ts
```

Examples:

```txt
user.mapper.ts
election.mapper.ts
```

Infrastructure-specific mappers:

```txt
prisma-user.mapper.ts
```

Class naming:

```ts
UserMapper
PrismaUserMapper
```

---

## Controllers

Pattern:

```txt
<entity>.controller.ts
```

Examples:

```txt
user.controller.ts
election.controller.ts
```

Class naming:

```ts
UserController
ElectionController
```

---

## Services

Pattern:

```txt
<provider>-<purpose>.service.ts
```

Examples:

```txt
sendgrid-email.service.ts
jwt-token.service.ts
```

Class naming:

```ts
SendgridEmailService
JwtTokenService
```

---

## Ports

Pattern:

```txt
<purpose>.port.ts
```

Examples:

```txt
email-service.port.ts
token-service.port.ts
```

Class naming:

```ts
EmailServicePort
TokenServicePort
```

---

## Errors

Pattern:

```txt
<reason>.error.ts
```

Examples:

```txt
not-found.error.ts
conflict.error.ts
validation.error.ts
```

Specific business errors:

```txt
user-email-already-exists.error.ts
election-closed.error.ts
```

Class naming:

```ts
NotFoundError
ConflictError
UserEmailAlreadyExistsError
```

---

# Test Naming

---

## Unit Tests

Pattern:

```txt
<file>.spec.ts
```

Examples:

```txt
create-user.use-case.spec.ts
email.vo.spec.ts
```

---

## Integration Tests

Pattern:

```txt
<file>.integration.spec.ts
```

Examples:

```txt
prisma-user.repository.integration.spec.ts
```

---

## E2E Tests

Pattern:

```txt
<feature>.e2e-spec.ts
```

Examples:

```txt
auth.e2e-spec.ts
election-flow.e2e-spec.ts
```

---

# Naming Principles

Prefer:
- explicit names
- business-oriented names
- consistency

Avoid:
- abbreviations
- ambiguous names
- generic file names
- unnecessary prefixes
- unnecessary suffixes

Bad examples:

```txt
helpers.ts
utils.ts
common.service.ts
base.repository.ts
manager.ts
```

Good examples:

```txt
jwt-token.service.ts
user.mapper.ts
create-election.use-case.ts
```