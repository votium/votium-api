# Plan de Migración Arquitectónica

## 1. Diagnóstico de la Arquitectura Actual

### 1.1 Estructura General

```
src/
├── config/
│   ├── envs.ts
│   └── index.ts
├── modules/
│   ├── auth/                      # Módulo de autenticación
│   │   ├── application/
│   │   │   ├── dtos/
│   │   │   │   ├── auth-response.dto.ts
│   │   │   │   └── login.dto.ts
│   │   │   ├── ports/
│   │   │   │   ├── token-service.port.ts
│   │   │   │   └── tokens.ts
│   │   │   └── use-cases/
│   │   │       └── login.use-case.ts
│   │   ├── infrastructure/
│   │   │   └── services/
│   │   │       └── jwt-token.service.ts
│   │   ├── presentation/
│   │   │   ├── controllers/
│   │   │   │   └── auth.controller.ts
│   │   │   └── guards/
│   │   │       ├── jwt-auth.guard.ts
│   │   │       ├── roles.decorator.ts
│   │   │       └── roles.guard.ts
│   │   └── auth.module.ts
│   ├── users/                     # Módulo de usuarios (incluye roles)
│   │   ├── application/
│   │   │   ├── dtos/
│   │   │   │   ├── create-user.dto.ts
│   │   │   │   ├── disable-user-response.dto.ts
│   │   │   │   ├── list-users-query.dto.ts
│   │   │   │   ├── paginated-response.dto.ts
│   │   │   │   └── user-response.dto.ts
│   │   │   ├── mappers/
│   │   │   │   └── user.mapper.ts
│   │   │   ├── ports/
│   │   │   │   ├── audit-log.port.ts
│   │   │   │   ├── password-hasher.port.ts
│   │   │   │   └── tokens.ts
│   │   │   └── use-cases/
│   │   │       ├── create-user.use-case.ts
│   │   │       ├── create-user.use-case.spec.ts
│   │   │       ├── disable-user.use-case.ts
│   │   │       ├── disable-user.use-case.spec.ts
│   │   │       ├── ensure-default-roles.use-case.ts
│   │   │       ├── get-user.use-case.ts
│   │   │       ├── get-user.use-case.spec.ts
│   │   │       └── get-users.use-case.ts
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   ├── role.entity.ts
│   │   │   │   ├── user.entity.ts
│   │   │   │   └── user.entity.spec.ts
│   │   │   ├── errors/
│   │   │   │   ├── role-not-found.error.ts
│   │   │   │   ├── user-already-disabled.error.ts
│   │   │   │   ├── user-not-found.error.ts
│   │   │   │   └── user-self-disable.error.ts
│   │   │   ├── repositories/
│   │   │   │   ├── role.repository.interface.ts
│   │   │   │   ├── tokens.ts
│   │   │   │   └── user.repository.interface.ts
│   │   │   └── value-objects/
│   │   │       ├── role-name.vo.ts
│   │   │       └── user-status.vo.ts
│   │   ├── infrastructure/
│   │   │   ├── mappers/
│   │   │   │   ├── prisma-role.mapper.ts
│   │   │   │   └── prisma-user.mapper.ts
│   │   │   ├── repositories/
│   │   │   │   ├── prisma-role.repository.ts
│   │   │   │   └── prisma-user.repository.ts
│   │   │   └── services/
│   │   │       ├── node-crypto-password-hasher.service.ts
│   │   │       └── prisma-audit-log.service.ts
│   │   └── users.module.ts
│   └── (no hay elections, votes, candidates, electors, etc.)
├── shared/
│   ├── database/
│   │   └── prisma.service.ts
│   └── exceptions/
│       ├── dto/
│       │   └── error-response.dto.ts
│       ├── errors/
│       │   ├── conflict.error.ts
│       │   ├── domain.error.ts
│       │   ├── not-found.error.ts
│       │   └── validation.error.ts
│       └── filters/
│           └── global-exception.filter.ts
├── app.controller.ts
├── app.module.ts
└── main.ts
```

### 1.2 Estado Actual de Cada Capa

#### Domain
- **UserEntity**: Constructor público expuesto. Sin métodos `create()`/`restore()`. Anémica (solo tiene `isDisabled()`). Todos los campos son `readonly` públicos.
- **RoleEntity**: Anémica total. Sin comportamiento.
- **Value Objects**: `RoleName` y `UserStatus` son enums simples. Correctos para su función actual.
- **Repository interfaces**: Bien definidas en domain/. Correcto.
- **Injection tokens**: En archivo separado (`repositories/tokens.ts`) en lugar de junto a la interfaz.
- **Domain errors**: Heredan de `NotFoundError`/`ValidationError` que viven en `shared/exceptions/errors/`. **Violación**: el dominio importa desde shared/ (fuera del módulo).

#### Application
- **Use cases**: Usan `@Injectable()` e `@Inject()` de NestJS. **Violación**: la capa application conoce a NestJS.
- **Use cases**: Importan `ConflictError`, `NotFoundError` desde `shared/exceptions/errors/`. **Violación**: importan infraestructura de errores desde shared/.
- **Use cases**: Contienen lógica de negocio (ej. validación de email duplicado, verificación de estado disabled). Esto es correcto (orquestación).
- **DTOs**: Correctamente separados. Algunos con decoradores `class-validator`.
- **Mappers**: `UserMapper` vive en application/. Transforma Entity → ResponseDto. Rol correcto.
- **Ports**: Bien definidos en application/ports/. Correcto.

#### Infrastructure
- **Repositorios Prisma**: Correctamente implementan interfaces del dominio.
- **Mappers Prisma**: Convierten Prisma → Entity. Correcto.
- **Servicios**: `NodeCryptoPasswordHasherService` y `PrismaAuditLogService` implementan ports. Correcto.

#### Presentation
- **Controllers**: Thinos, llaman a use cases. Correcto en general.
- **Controllers**: Usan `UserMapper.toResponse()` directamente. No hay Presenters como capa separada.
- **Guards**: En auth/presentation/guards/. Correcto.
- **Roles decorator**: En auth/presentation/guards/. Correcto.

#### Shared
- `DomainError` con `statusCode`: **Violación**: concepto HTTP en error base del dominio.
- `GlobalExceptionFilter`: Correcto, manejo centralizado.

---

## 2. Problemas Encontrados

### 2.1 Violaciones de Clean Architecture

| # | Problema | Archivo | Gravedad |
|---|----------|---------|----------|
| 1 | `DomainError` (base de errores) vive en `shared/` en lugar de `domain/`. Contiene `statusCode` (HTTP). | `shared/exceptions/errors/domain.error.ts` | **ALTA** |
| 2 | Errores de dominio importan desde `shared/` (fuera del módulo). El dominio depende de una capa externa. | `users/domain/errors/*.error.ts` → `shared/exceptions/errors/` | **ALTA** |
| 3 | Use cases usan `@Injectable()` e `@Inject()` de NestJS. La capa application conoce al framework. | `users/application/use-cases/*.use-case.ts` | **MEDIA** |
| 4 | Use cases importan errores desde `shared/exceptions/errors/`. | `create-user.use-case.ts` importa `ConflictError`, `NotFoundError` | **MEDIA** |
| 5 | Auth module no tiene capa domain/. | `modules/auth/domain/` no existe | **MEDIA** |
| 6 | Auth application importa directamente de users domain (acoplamiento cross-module). | `login.use-case.ts` importa `UserRepository`, `USER_REPOSITORY`, `PasswordHasherPort`, `PASSWORD_HASHER_PORT`, `UserStatus` | **MEDIA** |
| 7 | Injection tokens en archivos separados de las interfaces. | `repositories/tokens.ts` separado de `user.repository.interface.ts` | **BAJA** |
| 8 | `paginated-response.dto.ts` vive en users/application/dtos/ como DTO genérico reutilizable. | `users/application/dtos/paginated-response.dto.ts` | **BAJA** |
| 9 | Entidades usan constructor público. No hay `create()`/`restore()`. | `user.entity.ts`, `role.entity.ts` | **BAJA** |

### 2.2 Problemas de Diseño

| # | Problema | Detalle |
|---|----------|---------|
| 10 | Acoplamiento auth ↔ users | Auth conoce la implementación concreta de users. Si users cambia, auth se rompe. |
| 11 | Falta de Aggregate Root | User y Role son entidades separadas sin un aggregate que las agrupe. |
| 12 | No hay Presenters | Los controllers transforman respuestas directamente con mappers. |
| 13 | PasswordHasherPort vive en application/users pero lo usa auth | El port belongs to users module, pero auth lo necesita. |
| 14 | `UserMapper` en application mezcla roles | Convierte entidad → DTO de respuesta, que es responsabilidad de presentación. |

---

## 3. Riesgos del Refactor

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Romper tests existentes | Alta | Alto | Migrar tests gradualmente, mantener tests verdes en cada fase |
| Romper contrato de API (cambios en respuestas HTTP) | Media | Alto | Mantener DTOs de respuesta idénticos externamente |
| Regresiones en autenticación | Baja | Crítico | Tests E2E de login como gate |
| Acoplamiento temporal (dos implementaciones conviviendo) | Alta | Medio | Fases cortas, eliminar código legacy rápido |
| Cambios en imports rompen compilación | Media | Medio | TypeScript catches en compilación. CI pipeline detecta |
| Dificultad para el equipo de adoptar nuevos patrones | Media | Medio | Documentación clara, cambios incrementales |

---

## 4. Organización Propuesta de los Dominios (Bounded Contexts)

### Análisis de Responsabilidades

**Contexto actual:**
- **users**: Gestión de usuarios (CRUD), roles, auditoría, hash de contraseñas.
- **auth**: Autenticación (login), emisión de tokens JWT, guards.

**Relaciones:**
- Todo usuario tiene un rol (FK `role_id`).
- Roles se usan para autorización en todos los módulos.
- Auth necesita validar credenciales contra usuarios.
- Auth consulta el estado del usuario (activo/deshabilitado).

**Conclusión:** User y Role pertenecen al **mismo dominio** (IAM). Auth es un dominio separado que depende de IAM.

### Propuesta de Organización

```
src/modules/
├── iam/                                     # Identity & Access Management
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── user.entity.ts
│   │   │   └── role.entity.ts
│   │   ├── value-objects/
│   │   │   ├── role-name.vo.ts
│   │   │   └── user-status.vo.ts
│   │   ├── repositories/
│   │   │   ├── user.repository.ts           # Interfaz + TOKEN export
│   │   │   └── role.repository.ts           # Interfaz + TOKEN export
│   │   ├── services/                        # Domain Services (si aplica)
│   │   │   └── password-validation.service.ts
│   │   └── exceptions/
│   │       ├── user-not-found.exception.ts
│   │       ├── user-already-disabled.exception.ts
│   │       ├── user-self-disable.exception.ts
│   │       └── role-not-found.exception.ts
│   ├── application/
│   │   ├── ports/
│   │   │   ├── password-hasher.port.ts      # Interfaz + TOKEN
│   │   │   ├── audit-log.port.ts            # Interfaz + TOKEN
│   │   │   └── iam.gateway.port.ts          # Puerto para que otros módulos consulten IAM
│   │   ├── use-cases/
│   │   │   ├── create-user.use-case.ts
│   │   │   ├── get-user.use-case.ts
│   │   │   ├── get-users.use-case.ts
│   │   │   ├── disable-user.use-case.ts
│   │   │   └── ensure-default-roles.use-case.ts
│   │   └── dtos/                            # DTOs de caso de uso (input)
│   │       ├── create-user.dto.ts
│   │       └── list-users-query.dto.ts
│   ├── infrastructure/
│   │   ├── persistence/
│   │   │   ├── mappers/
│   │   │   │   ├── prisma-user.mapper.ts
│   │   │   │   └── prisma-role.mapper.ts
│   │   │   └── repositories/
│   │   │       ├── prisma-user.repository.ts
│   │   │       └── prisma-role.repository.ts
│   │   └── services/
│   │       ├── node-crypto-password-hasher.service.ts
│   │       └── prisma-audit-log.service.ts
│   ├── presentation/
│   │   ├── controllers/
│   │   │   └── users.controller.ts
│   │   ├── dtos/                            # DTOs HTTP (request/response)
│   │   │   ├── user-response.dto.ts
│   │   │   ├── disable-user-response.dto.ts
│   │   │   └── list-users-query.dto.ts
│   │   └── presenters/
│   │       └── user.presenter.ts
│   └── iam.module.ts
│
├── auth/                                     # Authentication
│   ├── domain/
│   │   ├── entities/
│   │   │   └── access-token.entity.ts       # Opcional — solo si tiene comportamiento
│   │   ├── exceptions/
│   │   │   ├── invalid-credentials.exception.ts
│   │   │   └── invalid-token.exception.ts
│   │   └── repositories/
│   │       └── token-blacklist.repository.ts # Si implementas refresh/revoke
│   ├── application/
│   │   ├── ports/
│   │   │   ├── token-service.port.ts        # Interfaz + TOKEN
│   │   │   └── iam.gateway.port.ts          # Puerto hacia IAM (lo implementa IAM)
│   │   └── use-cases/
│   │       └── login.use-case.ts
│   ├── infrastructure/
│   │   └── services/
│   │       └── jwt-token.service.ts
│   ├── presentation/
│   │   ├── controllers/
│   │   │   └── auth.controller.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   └── roles.decorator.ts
│   │   ├── dtos/
│   │   │   ├── login.dto.ts
│   │   │   └── auth-response.dto.ts
│   │   └── presenters/
│   │       └── auth.presenter.ts
│   └── auth.module.ts
│
└── (futuros dominios: election, voting, reporting, etc.)
```

### Justificación de la Organización

**IAM como dominio único para User + Role:**
- User siempre tiene un Role (relación de base de datos 1:N).
- Role se usa exclusivamente para autorización de usuarios.
- Separarlos en dominios distintos forzaría a IAM a exponer un gateway para que otros dominios consulten roles, añadiendo complejidad innecesaria.
- El aggregate root natural es `User` (el rol sin usuario no tiene sentido de negocio).

**Auth como dominio separado:**
- La autenticación es un mecanismo técnico, no un concepto de negocio central.
- Sin embargo, tiene su propio ciclo de vida (tokens, sesiones) y sus propias reglas.
- Separarlo permite cambiar la implementación de autenticación sin afectar IAM.
- Auth depende de IAM a través de un **port** (`IamGateway`), no de forma directa.

---

## 5. Decisiones Arquitectónicas Justificadas

### 5.1 Creación de Entidades: `create()` / `restore()` estáticos (Opción A)

**Decisión:** Usar métodos estáticos `create()` y `restore()` en las entidades.

**Justificación:**
- No hay lógica compleja de construcción que justifique un Factory Method.
- `create()` encapsula: generación de ID, valores por defecto, validaciones de negocio en creación.
- `restore()` reconstruye desde persistencia sin validar invariantes que ya se validaron al crear.
- Factory Method agregaría un archivo/clase por entidad sin beneficio real.
- El constructor se mantiene `private` para forzar el uso de `create()`/`restore()`.

```ts
// Ejemplo objetivo
export class UserEntity {
  private constructor(
    private readonly _id: string,
    private _firstName: string,
    private _lastName: string,
    private _email: string,
    private _passwordHash: string,
    private _role: RoleEntity,
    private _status: UserStatus,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(input: CreateUserInput): UserEntity {
    // Validaciones de negocio, generación de ID, defaults
  }

  static restore(data: UserRestoreData): UserEntity {
    // Reconstrucción directa, sin revalidar
    return new UserEntity(/* ... */);
  }
}
```

### 5.2 DomainException como clase base

**Decisión:** Adoptar la implementación propuesta con `code` sin `statusCode`.

**Justificación:**
- Elimina el acoplamiento HTTP del dominio.
- El `code` es semántico para el negocio, no técnico.
- Permite que el ExceptionFilter mapee `code → HttpStatus` centralizadamente.

### 5.3 Mapeo de códigos en ExceptionFilter

**Decisión:** Mapa estático de `DomainException.code → HttpStatus` en el GlobalExceptionFilter.

**Justificación:**
- Es simple, explícito y fácil de mantener.
- No requiere un Service Locator ni inyección de dependencias.
- Si se necesitan mapeos dinámicos, se puede inyectar un `ExceptionMapper` en el futuro, pero empezar con un mapa estático es suficiente.

```ts
const DOMAIN_CODE_TO_HTTP: Record<string, HttpStatus> = {
  'USER_NOT_FOUND': HttpStatus.NOT_FOUND,
  'ROLE_NOT_FOUND': HttpStatus.NOT_FOUND,
  'INVALID_CREDENTIALS': HttpStatus.UNAUTHORIZED,
  'USER_ALREADY_DISABLED': HttpStatus.CONFLICT,
  'USER_SELF_DISABLE': HttpStatus.FORBIDDEN,
  'EMAIL_CONFLICT': HttpStatus.CONFLICT,
};
```

### 5.4 Cross-module Communication via Ports

**Decisión:** Crear `IamGateway` port en el dominio de auth, implementado por IAM.

**Justificación:**
- Auth necesita validar credenciales y estado de usuarios.
- En lugar de importar repositorios de users directamente, auth define un port (`IamGateway`) que IAM implementa.
- IAM registra el provider en su módulo y lo exporta.
- Auth inyecta la interfaz sin conocer la implementación.
- Rompe el acoplamiento directo auth → users.

### 5.5 Eliminación de @Injectable() de los Use Cases

**Decisión:** Los use cases serán clases Planas (POCO) sin decoradores NestJS.

**Justificación:**
- La capa application no debe conocer NestJS.
- Los use cases se registrarán como providers en el módulo usando `{ provide: UseCase, useClass: UseCase }`.
- Los tests no necesitan el módulo de NestJS, solo instanciar la clase directamente (ya funciona así).

---

## 6. Patrones de Diseño Propuestos

| Patrón | Dónde | Por qué |
|--------|-------|---------|
| **Static Factory** (`create`/`restore`) | Domain Entities | Centraliza creación, separa nueva entidad de reconstrucción |
| **Adapter** | Infrastructure repos/services | PrismaUserRepository adapta Prisma a UserRepository. JwtTokenService adapta JwtService a TokenServicePort |
| **Port & Adapter** | Application ports ↔ Infrastructure | Desacopla application de implementaciones concretas |
| **Presenter** | Presentation layer | Transforma respuestas de use cases a formato HTTP. Aísla la lógica de presentación |
| **Gateway** | Cross-module communication | Auth define IamGateway, IAM lo implementa. Desacopla módulos |
| **Strategy** | Password hashing (ya implementado) | Diferentes algoritmos sin cambiar el consumo |

**No se propone usar:**
- **Factory Method**: No aporta beneficio sobre static factory.
- **Abstract Factory**: No hay familias de productos relacionados.
- **Builder**: Las entidades no tienen configuraciones complejas optionals.
- **Command**: No hay operaciones que necesiten ser parametrizadas o encoladas.
- **Decorator**: No hay necesidad actual de añadir comportamiento transversal en tiempo de compilación.
- **Domain Events**: Agregaría complejidad innecesaria en este momento. Evaluar cuando haya más dominios.

---

## 7. Principios de DDD a Aplicar

| Principio | Aplicación |
|-----------|------------|
| **Bounded Contexts** | IAM y Auth como contextos delimitados separados |
| **Aggregate** | User como aggregate root que contiene Role |
| **Ubiquitous Language** | Mantener términos del negocio (Usuario, Rol, Administrador, Auditor, etc.) |
| **Value Objects** | Ya existen (RoleName, UserStatus). Evaluar Email como VO si las validaciones crecen |
| **Domain Services** | PasswordValidationService si las reglas de contraseña se vuelven complejas |
| **Entities with Behavior** | UserEntity con `disable()`, `changeRole()`, etc. Comportamiento de negocio, no setters genéricos |
| **Repository per Aggregate** | UserRepository (que incluye operaciones de Role dentro del aggregate) |

**No se aplicará:**
- **Domain Events**: No hay escenarios que lo justifiquen actualmente.
- **Event Sourcing**: Completamente fuera de alcance.
- **CQRS**: El proyecto no tiene la complejidad que lo justifique.
- **Anti-Corruption Layer**: No hay sistemas externos con modelos conflictivos.

---

## 8. Plan de Migración por Fases

### Fase 1: DomainException y Reorganización de Errores

**Objetivo:** Eliminar `DomainError` con `statusCode`, migrar a `DomainException` con `code`, mover errores al dominio de cada módulo.

**Pasos:**
1. Crear `DomainException` abstracta en `src/shared/exceptions/base/` (o en cada módulo — ver decisión).
2. Crear `ConflictException`, `NotFoundException`, `ValidationException` que extiendan `DomainException` con códigos semánticos (sin `statusCode`).
3. Migrar cada error de dominio de `users/domain/errors/` a la nueva jerarquía.
4. Agregar capa de dominio para auth (`auth/domain/exceptions/`).
5. Modificar `GlobalExceptionFilter` para mapear `DomainException.code → HttpStatus`.
6. Actualizar imports en use cases y tests.

**Estructura resultante:**
```
shared/exceptions/
├── base/
│   └── domain.exception.ts
├── errors/                               # ← se elimina
├── dto/
│   └── error-response.dto.ts
└── filters/
    └── global-exception.filter.ts
```

**Riesgos:**
- Los tests que esperan errores específicos pueden romperse si cambia la clase base.
- El `GlobalExceptionFilter` necesita actualizarse para manejar ambas jerarquías durante la transición.

**Criterios de aceptación:**
- `DomainError` y sus subclases ya no existen.
- `GlobalExceptionFilter` mapea correctamente códigos a HTTP.
- `DomainException` no contiene `statusCode`.

**Duración estimada:** 1-2 sesiones de trabajo.

---

### Fase 2: Reorganización de Módulos (IAM)

**Objetivo:** Renombrar `users` → `iam`, agrupar User + Role bajo un mismo contexto.

**Pasos:**
1. Crear `src/modules/iam/` con la estructura completa.
2. Mover todo `src/modules/users/` a `src/modules/iam/`.
3. Renombrar referencias: `UsersModule` → `IamModule`.
4. Mover `paginated-response.dto.ts` a `shared/`.
5. Actualizar `auth.module.ts` para importar `IamModule` en lugar de `UsersModule`.
6. Actualizar imports en auth (login.use-case, guards).
7. Actualizar `app.module.ts`.

**Riesgos:**
- Cambios de import masivos que pueden romper la compilación.
- Conflictos de nombres si hay otras referencias a `UsersModule`.

**Criterios de aceptación:**
- `npm run build` o `nest build` compila sin errores.
- `npm run lint` pasa.
- No hay imports rotos hacia `src/modules/users/`.

**Duración estimada:** 1 sesión.

---

### Fase 3: Entities con `create()`/`restore()` y Comportamiento

**Objetivo:** Centralizar creación de entidades, encapsular comportamiento.

**Pasos:**
1. Hacer constructor de `UserEntity` privado.
2. Implementar `UserEntity.create(input)`:
   - Valida que el email tenga formato.
   - Valida que el status sea válido.
   - Genera UUID (usar `crypto.randomUUID()`).
   - Setea `createdAt`, `updatedAt`.
3. Implementar `UserEntity.restore(data)`:
   - Reconstruye desde datos existentes sin revalidar.
4. Agregar método `disable()` en UserEntity:
   - Valida que no esté ya disabled.
   - Cambia status.
   - Actualiza `updatedAt`.
   - Lanza `UserAlreadyDisabledException`.
5. Actualizar use cases para usar `UserEntity.create()` y `user.disable()`.
6. Misma lógica para `RoleEntity` si aplica.

**Riesgos:**
- Tests existentes instancian `UserEntity` directamente con `new`. Deben migrar a `create()`/`restore()`.
- Si la lógica de `disable()` se mueve a la entidad, el use case ya no lanza `UserAlreadyDisabledError` — el test debe ajustarse.

**Criterios de aceptación:**
- `new UserEntity(...)` falla en compilación (constructor privado).
- Las entidades exportan `create()` y `restore()`.
- Los use cases usan `UserEntity.create()` y `user.disable()` en lugar de lógica inline.

**Duración estimada:** 1-2 sesiones.

---

### Fase 4: Desacoplar Auth de IAM vía Gateway

**Objetivo:** Eliminar dependencia directa de auth hacia los repositorios de IAM.

**Pasos:**
1. Definir `IamGateway` port en `auth/application/ports/iam.gateway.port.ts`:
   ```ts
   export const IAM_GATEWAY = 'IAM_GATEWAY';

   export interface IamGateway {
     findByEmail(email: string): Promise<UserData | null>;
     verifyPassword(password: string, hash: string): Promise<boolean>;
   }

   export interface UserData {
     id: string;
     email: string;
     role: string;
     status: string;
     passwordHash: string;
   }
   ```
2. Implementar `IamGateway` en `iam/infrastructure/gateways/prisma-iam.gateway.ts`.
3. Registrar el gateway en `iam.module.ts` y exportarlo.
4. Modificar `LoginUseCase` para inyectar `IamGateway` en lugar de `UserRepository` + `PasswordHasherPort`.
5. Mover lógica de verificación de contraseña al gateway (o mantener `PasswordHasherPort` — ver análisis).
6. Actualizar tests de `login.use-case`.

**Análisis de la verificación de contraseña:**
- Opción A: El gateway recibe la password hash y la verifica internamente con `PasswordHasherPort`.
- Opción B: El gateway devuelve el hash y auth lo verifica con `PasswordHasherPort`.
- **Decisión: Opción A.** Auth no necesita conocer el `PasswordHasherPort`. El gateway oculta completamente los detalles de IAM. Auth solo pregunta "¿son válidas estas credenciales?" y recibe sí/no + datos del usuario.

**Riesgos:**
- El gateway puede convertirse en un "god object" si crece demasiado. Mitigación: mantener métodos específicos, no genéricos.
- Auth pierde control sobre cómo se verifica la contraseña (no necesario).

**Criterios de aceptación:**
- `LoginUseCase` no importa nada de `src/modules/users/` o `src/modules/iam/`.
- `LoginUseCase` solo depende de su propio `IamGateway` y `TokenServicePort`.
- Compilación sin errores.

**Duración estimada:** 1-2 sesiones.

---

### Fase 5: Presenters y Separación de DTOs

**Objetivo:** Agregar capa de Presenters, separar DTOs de aplicación de DTOs HTTP.

**Pasos:**
1. Mover DTOs de respuesta HTTP de `application/dtos/` a `presentation/dtos/`.
   - `user-response.dto.ts`
   - `disable-user-response.dto.ts`
   - `auth-response.dto.ts`
2. Crear `presentation/presenters/`:
   - `user.presenter.ts` — transforma entidad → UserResponseDto.
   - `auth.presenter.ts` — transforma resultado de login → AuthResponseDto.
3. Modificar `UserMapper` en application/ para que transforme Entity → datos planos (no DTOs HTTP).
4. Actualizar controllers para usar presenters.
5. Mover `list-users-query.dto.ts` a presentation/dtos/ (es un DTO de entrada HTTP).

**Riesgos:**
- Los presenters pueden volverse una capa de mapeo redundante si no hay transformación real. En este proyecto, sí hay: fechas a ISO string, role a objeto `{id, name}`.
- Puede haber resistencia si el equipo percibe los presenters como "otra capa más". Justificación: separa responsabilidad de mapeo HTTP de la lógica de aplicación.

**Criterios de aceptación:**
- Controllers no tienen lógica de transformación. Solo llaman al use case y al presenter.
- Application mappers ya no conocen DTOs HTTP.

**Duración estimada:** 1 sesión.

---

### Fase 6: Eliminar Framework de Application Layer

**Objetivo:** Remover `@Injectable()` e `@Inject()` de los use cases.

**Pasos:**
1. Eliminar decoradores `@Injectable()` e `@Inject()` de todos los use cases.
2. Los use cases reciben dependencias por constructor sin decoradores.
3. Actualizar `iam.module.ts` para registrar providers explícitamente:
   ```ts
   {
     provide: CreateUserUseCase,
     useFactory: (users, roles, hasher, audit) =>
       new CreateUserUseCase(users, roles, hasher, audit),
     inject: [USER_REPOSITORY, ROLE_REPOSITORY, PASSWORD_HASHER_PORT, AUDIT_LOG_PORT],
   }
   ```
4. O usar `useClass` si NestJS puede inyectar sin decoradores (requiere probar).
5. Alternativa: mantener `@Injectable()` y aceptar que ése es el punto de integración con NestJS.

**Riesgos:**
- NestJS puede requerir `@Injectable()` para la inyección de dependencias. Si `useClass` no funciona sin decorador, esta fase se vuelve inviable o requiere `useFactory`.
- Los tests ya instancian use cases sin NestJS, así que no se ven afectados.

**Decisión:** Probar si NestJS inyecta sin `@Injectable()`. Si falla, mantener los decoradores como el punto de contacto framework ↔ aplicación. Es una concesión pragmática. Si se mantienen, documentar que son la **única dependencia de framework permitida en la capa application**.

**Criterios de aceptación:**
- `npm run build` o `nest build` compila.
- `npm run start` funciona.

**Duración estimada:** 1 sesión.

---

### Fase 7: Estandarizar Respuestas Paginadas

**Objetivo:** Mover `PaginatedResponseDto` a shared y estandarizar su uso.

**Pasos:**
1. Mover `PaginatedResponseDto` de `iam/application/dtos/` a `shared/pagination/`.
2. Verificar que todos los endpoints paginados lo usen consistentemente.
3. Agregar tests para el DTO paginado.

**Mejora propuesta:**
El `PaginatedResponseDto` actual es correcto. La única mejora: el constructor debería aceptar un objeto en lugar de 4 parámetros posicionales para mejor legibilidad:

```ts
constructor(params: { data: T[]; total: number; page: number; limit: number })
```

**Riesgos:** Mínimo. Solo mover archivo y actualizar imports.

**Criterios de aceptación:**
- Compilación pasa.
- Respuestas paginadas tienen el mismo formato que antes.

**Duración estimada:** <1 sesión.

---

### Fase 8: Inyección de Tokens Junto a Interfaces

**Objetivo:** Unificar interfaz + token en el mismo archivo.

**Pasos:**
1. Mover `USER_REPOSITORY`, `ROLE_REPOSITORY` a sus respectivos archivos de interfaz.
2. Mover `PASSWORD_HASHER_PORT`, `AUDIT_LOG_PORT` a sus respectivos ports.
3. Mover `TOKEN_SERVICE_PORT` a `token-service.port.ts`.
4. Eliminar archivos `tokens.ts` vacíos.

**Riesgos:** Mínimo. Cambios de import localizados.

**Criterios de aceptación:**
- No existen archivos `tokens.ts`.
- Todos los imports actualizados.

**Duración estimada:** <1 sesión.

---

### Fase 9: Ajustes Finales y Limpieza

**Objetivo:** Revisar el proyecto completo, eliminar código legacy, actualizar documentación.

**Pasos:**
1. Eliminar `src/modules/users/` (ya migrado a iam/).
2. Eliminar `shared/exceptions/errors/` (ya migrado a DomainException).
3. Verificar que no haya imports rotos.
4. Ejecutar suite completa de tests.
5. Ejecutar lint y formateo.
6. Actualizar `ARCHITECTURE.md` y `NAMING_CONVENTIONS.md` con los cambios.
7. Los archivos `README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `NAMING_CONVENTIONS.md` se ignoran según la instrucción.

**Riesgos:** Bajo. Solo limpieza.

**Criterios de aceptación:**
- `npm run build` o `nest build` sin errores.
- `npm run lint` sin errores.
- No hay archivos legacy.

**Duración estimada:** 1 sesión.

---

## 9. Resumen de Fases

| Fase | Descripción | Duración | Dependencias |
|------|-------------|----------|--------------|
| 1 | DomainException y errores | 1-2 sesiones | Ninguna |
| 2 | Reorganizar users → iam | 1 sesión | Fase 1 |
| 3 | create()/restore() en entities | 1-2 sesiones | Fase 2 |
| 4 | Gateway auth ↔ iam | 1-2 sesiones | Fase 2 |
| 5 | Presenters y DTOs | 1 sesión | Fase 2 |
| 6 | Eliminar framework de application | 1 sesión | Fase 1 |
| 7 | Estandarizar paginación | <1 sesión | Fase 2 |
| 8 | Unificar tokens con interfaces | <1 sesión | Fase 1 |
| 9 | Limpieza final | 1 sesión | Todas las anteriores |

**Orden recomendado de ejecución:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

Las fases 7 y 8 pueden ejecutarse en paralelo con 3-6.

---

## 10. Notas Adicionales

### Auth Module — Capa de Dominio

Auth no necesita entidades complejas. Sin embargo, debe tener:
- `auth/domain/exceptions/` — para `InvalidCredentialsException`, `InvalidTokenException`.
- `auth/domain/ports/` — `IamGateway` port.

No necesita `auth/domain/entities/` a menos que se implemente refresh tokens, blacklist, etc.

### Sobre `@nestjs/jwt`

El módulo auth usa `@nestjs/jwt` que no está en `package.json` como dependencia directa. `JwtModule` se importa en `auth.module.ts`. Esto sugiere que `@nestjs/jwt` está instalado pero no declarado explícitamente en `package.json`. Verificar durante la migración.

### Prisma Schema

El schema de Prisma incluye modelos no implementados: `Election`, `Candidate`, `Candiday` (typo: debería ser `Candidacy`), `Result`, `Elector`, `ElectoralRoll`, `Certificate`, `VoteMetadata`, `Notification`, `Report`. Esto indica que es un proyecto en desarrollo temprano. La migración debe considerar que estos modelos se implementarán en futuros dominios (election, voting, reporting).

### Tests de Integración

Existe `test/users/prisma-user.repository.int.spec.ts`. Estos tests pueden requerir ajustes si cambian los mappers o repositorios. Revisar durante la Fase 2.