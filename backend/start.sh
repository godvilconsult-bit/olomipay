#!/bin/sh
set -e

echo "=== Tuma API Startup ==="
echo "Node: $(node --version)"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"

echo "--- Running prisma db push ---"
npx prisma db push --accept-data-loss --skip-generate
echo "--- Database ready ---"

echo "--- Starting API ---"
node dist/index.js
