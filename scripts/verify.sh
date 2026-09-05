#!/usr/bin/env bash
set -eu
set -o pipefail || true

echo "=========================================="
echo " 1. Checking Backend TypeScript (Strict)  "
echo "=========================================="
npx tsc --noEmit

echo "=========================================="
echo " 2. Testing Frontend & Backend Build      "
echo "=========================================="
if [ -d "frontend" ]; then
  npm --prefix frontend run build
fi
npm run build:backend

echo "=========================================="
echo " 3. Running Backend Test Suite            "
echo "=========================================="
if [ -d "tests" ] && [ "$(ls -A tests)" ]; then
  npm test
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
echo "Resetting database to pristine seed state..."
npm run db:seed
if [ -f "playwright.config.ts" ]; then
  npx playwright test
fi

echo "=========================================="
echo "✅ All verification checks passed!"
echo "=========================================="