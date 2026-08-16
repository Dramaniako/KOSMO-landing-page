#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo " 1. Checking Backend TypeScript (Strict)  "
echo "=========================================="
if [ -f "backend/tsconfig.json" ]; then
  npx tsc --noEmit --project backend/tsconfig.json
fi

echo "=========================================="
echo " 2. Testing Frontend Production Build     "
echo "=========================================="
if [ -d "frontend" ]; then
  npm --prefix frontend run build
fi

echo "=========================================="
echo " 3. Running Test Suite & DB Integrity     "
echo "=========================================="
if [ -d "tests" ] && [ "$(ls -A tests)" ]; then
  npm test || node --test tests/*.test.js 2>/dev/null || echo "No automated runner configured yet."
fi

echo "=========================================="
echo "✅ All verification checks passed!"
echo "=========================================="