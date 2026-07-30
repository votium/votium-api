# Naming Conventions

Consistency is mandatory. Do not invent alternative naming styles.

## General

- **Files:** kebab-case
- **Classes:** PascalCase
- **Variables/functions:** camelCase
- **File names:** must reflect their responsibility
- **Prefer:** explicit names over abbreviations

## File naming

### Entities
```
<entity>.entity.ts              →  UserEntity, RoleEntity
```
```
user.entity.ts
role.entity.ts
```

### Value Objects
```
<name>.vo.ts                    →  EmailVO, ElectionStatusVO
```
```
email.vo.ts
election-status.vo.ts
```
Value Objects must always be implemented as classes. Enums or primitive types must not be used as Value Objects.

### Repository Interfaces
```
<entity>.repository.interface.ts  →  UserRepository, RoleRepository
```
```
user.repository.interface.ts
role.repository.interface.ts
```
The injection token is exported as a constant in the same file.

### Prisma Repository Implementations
```
prisma-<entity>.repository.ts  →  PrismaUserRepository
```
```
prisma-user.repository.ts
prisma-role.repository.ts
```

### Use Cases
```
<action>-<entity>.use-case.ts  →  CreateUserUseCase
```
```
create-user.use-case.ts
disable-user.use-case.ts
get-user.use-case.ts
```

### DTOs — Input
```
<action>-<entity>.dto.ts       →  CreateUserDto, LoginDto
```
```
create-user.dto.ts
login.dto.ts
```

### DTOs — Response
```
<entity>-response.dto.ts       →  UserResponseDto
```
```
user-response.dto.ts
auth-response.dto.ts
```

### Mappers (Infrastructure)
```
prisma-<entity>.mapper.ts      →  PrismaUserMapper
```

### Controllers
```
<entity>.controller.ts         →  UserController, AuthController
```
```
users.controller.ts
auth.controller.ts
```

### Services
```
<provider>-<purpose>.service.ts  →  JwtTokenService
```
```
jwt-token.service.ts
node-crypto-password-hasher.service.ts
prisma-audit-log.service.ts
```

### Ports
```
<domain>-<purpose>.port.ts    →  TokenServicePort
```
```
token-service.port.ts
password-hasher.port.ts
audit-log.port.ts
```

### Gateways
```
prisma-<domain>.gateway.ts    →  PrismaIamGateway
```
```
prisma-iam.gateway.ts
```

### Presenters
```
<context>.presenter.ts         →  UserPresenter, AuthPresenter
```
```
user.presenter.ts
auth.presenter.ts
```

### Domain Errors
```
<reason>.error.ts              →  NotFoundError
```
```
user-not-found.error.ts
role-not-found.error.ts
user-already-disabled.error.ts
user-self-disable.error.ts
```

### Integration Exceptions (exceptions without additional domain logic)
```
<reason>.exception.ts          →  UserEmailAlreadyExistsException
```
```
user-email-already-exists.exception.ts
invalid-credentials.exception.ts
invalid-token.exception.ts
```

### Guards
```
<purpose>.guard.ts             →  JwtAuthGuard, RolesGuard
```
```
jwt-auth.guard.ts
roles.guard.ts
```

### Decorators
```
<purpose>.decorator.ts         →  Roles
```
```
roles.decorator.ts
```

## Tests

### Unit
```
<file>.spec.ts                 →  alongside the production file
```
```
create-user.use-case.spec.ts
user.entity.spec.ts
```

### Integration
```
<file>.int.spec.ts             →  inside test/
```
```
prisma-user.repository.int.spec.ts
```

### E2E
```
<feature>.e2e-spec.ts          →  inside test/
```
```
app.e2e-spec.ts
```

## Injection tokens

Injection tokens are defined as exported constants in the **same file** as the interface they represent.

```ts
// user.repository.interface.ts
export const USER_REPOSITORY = 'UserRepository';
export interface UserRepository { ... }
```

## Principles

**Prefer:**
- Explicit names
- Business-oriented names
- Consistency

**Avoid:**
- Abbreviations
- Ambiguous names
- Generic file names (`helpers.ts`, `utils.ts`)
- Unnecessary prefixes or suffixes
