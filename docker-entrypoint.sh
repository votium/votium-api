#!/bin/sh
set -e

echo "▶ Aplicando migraciones..."
npx prisma migrate deploy

echo "▶ Iniciando aplicación..."
exec node dist/src/main.js