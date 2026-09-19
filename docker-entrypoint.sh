#!/bin/sh
set -e

echo "Ejecutando migraciones DTE..."
node src/migrations/run.js

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "Seed demo DTE omitido en producción."
else
  echo "Sembrando datos demo DTE..."
  node src/migrations/seed.js
fi

echo "Iniciando servidor DTE..."
exec "$@"
