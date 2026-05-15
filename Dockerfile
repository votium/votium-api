# ─────────────────────────────────────────
# Stage 1: deps
# Instala SOLO dependencias de producción
# ─────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY package*.json ./
COPY prisma/ ./prisma/

RUN npm ci --only=production && \
   npx prisma generate


# ─────────────────────────────────────────
# Stage 2: builder
# Instala todo (dev deps) y compila TypeScript
# ─────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma/ ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate && \
   npm run build


# ─────────────────────────────────────────
# Stage 3: runner
# Imagen final — solo lo necesario para correr
# ─────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Usuario no-root por seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copia dependencias de producción (sin dev deps)
COPY --from=deps /app/node_modules ./node_modules

# Copia cliente de Prisma generado
COPY --from=builder /app/generated ./src/generated

# Copia el schema para poder correr migraciones al iniciar
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Copia el build compilado
COPY --from=builder /app/dist ./dist

# Copia package.json (NestJS lo necesita en runtime)
COPY package.json ./

# Aplica migraciones y levanta la app
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER appuser

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]