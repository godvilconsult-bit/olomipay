#!/bin/sh
echo "=== JIKO CONNECT API ==="
echo "Node: $(node --version)"
# Schema sync runs inside the app on boot (src/index.ts) so it works regardless
# of which start command the platform uses.
exec node dist/index.js
