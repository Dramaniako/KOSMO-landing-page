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
echo " 3. Running Backend Test Suite            "
echo "=========================================="
if [ -d "tests" ] && [ "$(ls -A tests)" ]; then
  npm test || node --experimental-strip-types --test tests/*.test.*
fi

echo "=========================================="
echo " 4. Running Frontend Component Unit Tests "
echo "=========================================="
if [ -d "frontend" ]; then
  npm --prefix frontend test -- --run
fi

echo "=========================================="
echo " 5. Running Playwright E2E Test Suite     "
echo "=========================================="
if [ -f "playwright.config.ts" ]; then
  npx playwright test
fi

echo "=========================================="
echo "✅ All verification checks passed!"
echo "=========================================="