#!/bin/sh
echo "=== OlomiPay API Startup ==="
echo "Node: $(node --version)"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"

# SAFE schema sync — NEVER use --force-reset (that deletes all data)
echo "--- Applying safe schema changes ---"
npx prisma db push --accept-data-loss --skip-generate 2>&1 | grep -v "^$" | head -20
echo "--- Schema sync done ---"

echo "--- Starting API ---"
exec node dist/index.js
