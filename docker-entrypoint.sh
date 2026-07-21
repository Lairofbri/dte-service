#!/bin/sh
set -e

echo "▶️ Ejecutando migraciones iniciales..."
node src/migrations/run.js 2>&1 || true

echo "▶️ Sembrando datos faltantes para migraciones..."
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    await pool.query(\`
      INSERT INTO tenants (id, nombre, nit, activo) VALUES
        ('a0000000-0000-0000-0000-000000000002', 'Placeholder', 'PLACEHOLDER', false)
      ON CONFLICT (id) DO NOTHING
    \`);
    console.log('  ✓ Tenant placeholder sembrado correctamente');
  } catch (err) {
    console.log('  - No se pudo sembrar:', err.message);
  }
  await pool.end();
})();
" 2>&1

echo "▶️ Re-ejecutando migraciones pendientes..."
node src/migrations/run.js 2>&1 || true

echo "🚀 Iniciando servidor..."
exec "$@"
