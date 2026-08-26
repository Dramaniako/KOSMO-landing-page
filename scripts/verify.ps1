$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " 1. Checking Backend TypeScript (Strict)  "
Write-Host "=========================================="
npx tsc --noEmit

Write-Host "=========================================="
Write-Host " 2. Testing Frontend & Backend Build      "
Write-Host "=========================================="
if (Test-Path "frontend") {
  npm --prefix frontend run build
}
npm run build:backend

Write-Host "=========================================="
Write-Host " 3. Running Backend Test Suite            "
Write-Host "=========================================="
if (Test-Path "tests") {
  npm test
}

Write-Host "=========================================="
Write-Host " 4. Running Frontend Component Unit Tests "
Write-Host "=========================================="
if (Test-Path "frontend") {
  npm --prefix frontend test -- --run
}

Write-Host "=========================================="
Write-Host " 5. Running Playwright E2E Test Suite     "
Write-Host "=========================================="
if (Test-Path "playwright.config.ts") {
  npx playwright test
}

Write-Host "=========================================="
Write-Host "? All verification checks passed!"
Write-Host "=========================================="
