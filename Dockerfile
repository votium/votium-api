
# --------------------------------------------------
# Base
# --------------------------------------------------
FROM node:24.14.1-alpine AS base

WORKDIR /app

RUN apk add --no-cache openssl


# --------------------------------------------------
# Stage 1: Production dependencies
# --------------------------------------------------
FROM base AS deps

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev


# --------------------------------------------------
# Stage 2: Build
# --------------------------------------------------
FROM base AS builder

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

COPY . .

RUN DATABASE_URL="postgresql://user:password@localhost:5432/votium?schema=public" \
  npx prisma generate \
  && npm run build


# --------------------------------------------------
# Stage 3: Production runner
# --------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production

RUN addgroup -S -g 10001 appgroup \
  && adduser -S -u 10001 -G appgroup appuser

# Production dependencies, including Prisma CLI
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Compiled application AND generated Prisma Client
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# Prisma schema, migrations and configuration
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=builder --chown=appuser:appgroup /app/prisma.config.ts ./prisma.config.ts

COPY --chown=appuser:appgroup package.json ./

USER 10001:10001

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
