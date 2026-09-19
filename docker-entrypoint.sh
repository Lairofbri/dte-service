#!/bin/sh
set -e

echo "Ejecutando migraciones DTE..."
node src/migrations/run.js

echo "Sembrando datos demo DTE..."
node src/migrations/seed.js

echo "Iniciando servidor DTE..."
exec "$@"
