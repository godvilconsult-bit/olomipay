#!/bin/sh
echo "=== Tuma API Startup ==="
echo "Node: $(node --version)"

echo "--- Syncing database schema ---"
npx prisma db push --accept-data-loss --skip-generate || {
  echo "--- db push failed, trying force reset ---"
  npx prisma db push --accept-data-loss --force-reset --skip-generate || echo "--- db push failed, continuing anyway ---"
}
echo "--- Database ready ---"

echo "--- Starting API ---"
node dist/index.js
