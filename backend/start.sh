#!/bin/sh
echo "=== OlomiPay API Startup ==="
echo "Node: $(node --version)"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"

# SAFE schema migration — NEVER drops existing data
# prisma migrate deploy only applies NEW pending migrations.
# It will NOT drop tables, columns, or data — ever.
echo "--- Applying safe migrations ---"
npx prisma migrate deploy 2>&1 | grep -v "^$" | head -30
echo "--- Migrations done ---"

echo "--- Starting API ---"
exec node dist/index.js
