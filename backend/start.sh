#!/bin/sh
set -e

echo "=== OlomiPay Startup ==="
echo "DATABASE_URL prefix: ${DATABASE_URL:0:30}..."

echo "--- Running prisma db push ---"
npx prisma db push --accept-data-loss
echo "--- Database schema synced ---"

echo "--- Starting API ---"
node dist/index.js
