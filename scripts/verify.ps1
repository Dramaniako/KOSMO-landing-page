$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host " 1. Checking Backend TypeScript (Strict)  "
Write-Host "=========================================="
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Error "Verification failed at Gate 1: Backend TypeScript check failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "=========================================="
Write-Host " 2. Testing Frontend & Backend Build      "
Write-Host "=========================================="
if (Test-Path "frontend") {
    npm --prefix frontend run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Verification failed at Gate 2: Frontend build failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}
npm run build:backend
if ($LASTEXITCODE -ne 0) {
    Write-Error "Verification failed at Gate 2: Backend build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "=========================================="
Write-Host " 3. Running Backend Test Suite            "
Write-Host "=========================================="
if (Test-Path "tests") {
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Verification failed at Gate 3: Backend test suite failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Write-Host "=========================================="
Write-Host " 4. Running Frontend Component Unit Tests "
Write-Host "=========================================="
if (Test-Path "frontend") {
    npm --prefix frontend test -- --run
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Verification failed at Gate 4: Frontend component unit tests failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Write-Host "=========================================="
Write-Host " 5. Running Playwright E2E Test Suite     "
Write-Host "=========================================="
Write-Host "Resetting database to pristine seed state..."
npm run db:seed
if ($LASTEXITCODE -ne 0) {
    Write-Error "Verification failed: Database reseeding prior to Gate 5 failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
if (Test-Path "playwright.config.ts") {
    npx playwright test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Verification failed at Gate 5: Playwright E2E test suite failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Write-Host "=========================================="
Write-Host "✅ All verification checks passed!"
Write-Host "=========================================="
exit 0

