#!/bin/sh
echo "=== JIKO CONNECT API Startup ==="
echo "Node: $(node --version)"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"

# Create / update the schema to match prisma/schema.prisma.
# --accept-data-loss is required to replace the previous project's tables.
echo "--- prisma db push ---"
npx prisma db push --accept-data-loss --skip-generate 2>&1 | head -40
echo "--- schema synced ---"

echo "--- Starting API ---"
exec node dist/index.js
