# Votium API

Backend for the Votium electronic voting system.

REST API built with NestJS, following Clean Architecture principles organized by business domains.

## Tech stack

- **Runtime:** Node.js 24
- **Framework:** NestJS 11
- **ORM:** Prisma 7 + PostgreSQL 16
- **Validation:** class-validator, Joi
- **Testing:** Jest (unit, integration, E2E)
- **Auth:** JWT

## Requirements

- Node.js >= 24.14.1
- PostgreSQL 16
- npm

## Setup

```bash
npm install
```

## Running

```bash
# Start PostgreSQL
docker compose up -d postgres

# Development with hot reload
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Development (watch mode) |
| `npm run build` | Compile TypeScript |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run start:prod` | Production |

## Project structure

```
src/
├── config/            # Centralized configuration
├── modules/
│   ├── iam/           # Identity & Access Management
│   └── auth/          # Authentication
└── shared/            # Cross-cutting (Prisma, exceptions, pagination)
```

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, layers, patterns, flows |
| [docs/AGENTS.md](docs/AGENTS.md) | Context for AI assistants |
| [docs/NAMING_CONVENTIONS.md](docs/NAMING_CONVENTIONS.md) | Naming conventions |
| [docs/TESTING.md](docs/TESTING.md) | Testing strategy |

## License

UNLICENSED
