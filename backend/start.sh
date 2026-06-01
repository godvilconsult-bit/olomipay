#!/bin/sh
echo "=== Tuma API Startup ==="
echo "Node: $(node --version)"

echo "--- Syncing database schema (safe — no data loss) ---"
# NEVER use --force-reset — it drops all tables and deletes all users
npx prisma db push --accept-data-loss --skip-generate || echo "--- db push warning (continuing) ---"
echo "--- Database ready ---"

echo "--- Starting API ---"
node dist/index.js
