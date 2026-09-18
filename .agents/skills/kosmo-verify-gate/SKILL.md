---
name: kosmo-verify-gate
description: Verification coordinator and automated triage guide for KOSMO's 5-gate deterministic verification pipeline (scripts/verify.sh and scripts/verify.ps1). Activates prior to git commits, after authoring backend/frontend code, during CI failures, or when diagnosing test suite errors.
version: 1.0.0
author: KOSMO Engineering Team
tags:
  - testing
  - verification
  - quality-gate
  - ci-cd
  - typescript
---

# KOSMO Verify Gate: 5-Gate Verification Pipeline & Automated Triage

## 1. Overview & Triggers
`kosmo-verify-gate` governs the mandatory verification standard required across all autonomous agents in KOSMO. Under Workspace Rules Phase 3 & Phase 4, **no code may be committed or delivered unless the full 5-gate pipeline passes with exit code 0**.

### Activation Triggers
- Prior to staging or committing any code (`git commit`).
- After adding or modifying files in `backend/`, `frontend/`, `tests/`, or `scripts/`.
- When GitHub Actions CI fails on push or pull request.
- When diagnosing TypeScript compiler errors, bundling issues, or test timeouts.

### Negative Triggers (When NOT to run full verification)
- Scratchpad ideation or early reconnaissance.
- Pure documentation edits (e.g., updating a markdown file outside `tests/`), though type-checking is still recommended.

---

## 2. The 5 Deterministic Gates

| Gate # | Name | Primary Command | Target Scope |
|---|---|---|---|
| **Gate 1** | Backend TypeScript Strictness | `npx tsc --noEmit` | `backend/**/*.ts`, root configs |
| **Gate 2** | Frontend & Backend Build | `npm --prefix frontend run build`<br>`npm run build:backend` | Vite bundling (`frontend/dist/`), esbuild bundle (`api/index.js`) |
| **Gate 3** | Backend Test Suite | `npm test` | All 17 node test modules (`tests/*.test.ts`) |
| **Gate 4** | Frontend Component Unit Tests | `npm --prefix frontend test -- --run` | Vitest + React Testing Library (`frontend/src/**/*.test.tsx`) |
| **Gate 5** | Playwright E2E Test Suite | `npm run db:seed`<br>`npx playwright test` | End-to-end browser flows (`tests/**/*.spec.ts`) |

---

## 3. Step-by-Step Execution Playbook

### 3.1 Running the Full Pipeline
Always use the platform-appropriate wrapper script:

```powershell
# Windows (PowerShell)
.\scripts\verify.ps1
```

```bash
# Linux / macOS / CI (Bash)
./scripts/verify.sh
```

### 3.2 Running Targeted Sub-Gates (Fast-Feedback Loop)
When iterating on a specific subsystem, do not wait for the entire suite:

1. **Quick TypeScript check:**
   ```powershell
   npm run type-check            # Runs both frontend and backend
   npm run type-check:backend    # Backend only (npx tsc --noEmit)
   npm run type-check:frontend   # Frontend only (tsc in frontend/)
   ```

2. **Targeted Backend Unit Test:**
   ```powershell
   node --import tsx --test --test-force-exit tests/auth.test.ts
   node --import tsx --test --test-force-exit tests/room_concurrency.test.ts
   node --import tsx --test --test-force-exit tests/contract.test.ts
   ```

3. **Targeted Frontend Unit Test:**
   ```powershell
   npm --prefix frontend test -- src/components/__tests__/BookingModal.test.tsx --run
   ```

4. **Database Reseed & Diagnostics:**
   ```powershell
   npm run db:diagnose
   npm run db:seed
   ```

---

## 4. Failure Modes & Automated Triage Matrix

| Gate | Observed Symptom | Probable Root Cause | Exact Remediation Procedure |
|---|---|---|---|
| **Gate 1** | `Property 'user' does not exist on type 'Request'` | Missing Express request typing augmentation | Import or cast `req.user` using `AuthenticatedRequest` from `backend/types/auth.d.ts`. |
| **Gate 1** | `Type 'null' is not assignable to type 'string'` | `strictNullChecks` violation in database query return | Add null coalescing (`row.field ?? ''`) or explicit type assertion guard. |
| **Gate 2** | `Cannot find module '...'` during `build:backend` | esbuild bundling an external CJS package improperly | Ensure package is listed under `dependencies` in root `package.json`, or flag as external in esbuild args. |
| **Gate 2** | `Failed to resolve import "..." from "frontend/src/..."` | Broken import path or missing export in React component | Inspect casing and relative paths in `frontend/src/`. Verify `tsconfig.json` paths. |
| **Gate 3** | `getaddrinfo ENOTFOUND ...tidbcloud.com` | Offline local environment or remote TiDB network blip | Check internet connectivity. For pure unit testing, use mocks or verify `db_init.test.ts` handles graceful fallback. |
| **Gate 3** | `Test timed out` or node runner hangs indefinitely | Open MySQL pool connection or unclosed server socket | Ensure `--test-force-exit` is present in npm test script. Check that DB connections are released in `finally` blocks. |
| **Gate 3** | `ER_DUP_ENTRY` on unique constraint | Previous test run left dirty test data | Run `npm run db:seed` to reset database to pristine initial state. |
| **Gate 4** | `An update to BookingModal inside a test was not wrapped in act(...)` | React state change triggered after test promise resolved | Wrap the triggering event or state change with `await act(async () => { ... })` or `waitFor(() => ...)`. |
| **Gate 4** | `localStorage is blocked` or `SecurityError` | Unmocked `window.localStorage` in jsdom environment | Verify mock implementation in test setup or use safe storage helpers. |
| **Gate 5** | Playwright browser executable not found | Chromium binaries missing in environment | Run `npx playwright install --with-deps chromium`. |
| **Gate 5** | E2E test fails on login | Database seed out of sync or password hash mismatch | Run `npm run db:seed` to repopulate users with standard test passwords (`password123`). |

---

## 5. Security & Verification Guardrails
- **Never bypass gates**: Do not modify `scripts/verify.sh` or `scripts/verify.ps1` to comment out gates or weaken exit code enforcement.
- **Never weaken tests to pass**: Modifying assertion thresholds, skipping tests (`test.skip`), or deleting tests is strictly prohibited.
- **Always verify exit codes**: In PowerShell, check `$LASTEXITCODE -eq 0`. In Bash, ensure `set -eu` catches failures immediately.
