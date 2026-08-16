---
trigger: always_on
---

# KOSMO Workspace Operating Rules & Verification Standards

## 1. Core Architecture & Tech Stack
- **Backend:** Node.js, Express, TypeScript (`backend/server.ts`, `backend/router.ts`) running on standalone Node and Vercel Serverless (`api/index.js`).
- **Database:** MySQL via `mysql2/promise` connection pooling in `backend/db.ts`. 
  - Domain tables: `users`, `properties`, `property_facilities`, `reviews`, `withdrawals`, `visitor_tracking`, `rentals`.
  - Canonical User Roles: Strict union type `'admin' | 'landlord' | 'tenant'`.
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide React (`frontend/src/`).
- **Maps & Location:** Leaflet OpenStreetMap (`frontend/src/types/leaflet.d.ts`).
- **Static Assets:** Handled via `/uploads/*` and Multer in `backend/uploads/`.

---

## 2. Mandatory Autonomous Execution Protocol
For EVERY user prompt, feature request, or bug fix—regardless of brevity—execute these 4 phases sequentially without asking for intermediate approval:

### Phase 1: Scout & Anti-Redundancy Audit
1. **Search Before Writing:** Use grep and symbol search across `backend/router.ts`, `backend/db.ts`, and `frontend/src/` to check for existing endpoints, queries, or components before authoring new ones.
2. **Extend Existing Interfaces:** If an endpoint or component partially exists (e.g., `/api/properties` filtering or `BookingModal.tsx`), extend its parameters and handlers rather than creating parallel routes or duplicate components.
3. **Plan Generation:** Generate an Implementation Plan following `.agents/workflows/PLAN_TEMPLATE.md`, explicitly citing lines and functions to be modified.

### Phase 2: Implementation & Safety Guardrails
1. **Surgical Edits Only:** Apply focused line-by-line diffs. Never rewrite entire files (>50 lines) to apply localized changes.
2. **Database Integrity & Concurrency:**
   - Always use prepared statements (`pool.execute` or `connection.execute`) with parameterized inputs to prevent SQL injection.
   - For balance updates, room allocations, withdrawals, and rental status changes, use transactional connections (`pool.getConnection()`) with `beginTransaction()`, `commit()`, `rollback()`, and row-locking (`SELECT ... FOR UPDATE`).
3. **Security & Authentication:**
   - Never expose raw passwords. Always verify passwords via `bcrypt` hash comparison (`/api/auth/verify-password`).
   - Require password confirmation gates for destructive actions (e.g., `DELETE /api/properties/:id`, `POST /api/rentals/:id/terminate`).
   - Read all secrets and ports strictly from `process.env`. Never hardcode API keys or credentials.
4. **Zero-`any` TypeScript Policy:**
   - Type all Express route parameters, request bodies, and database query returns using domain interfaces in `backend/types/` and `frontend/src/types/`.
   - Never suppress compiler warnings with `// @ts-ignore` or `# noqa`.
5. **Dependency Guard:** Do not run `npm install` for new third-party packages without explicit user confirmation.
6. **Untracked Artifacts:** Never modify unreferenced legacy JSON files (`backend/db/*.json`) or generated build outputs in `frontend/dist/`.

### Phase 3: Deterministic Verification Loop
1. **Automated Testing:** Write or update automated unit/integration tests in `tests/` for any modified or newly added endpoint or helper function.
2. **Verification Gate:** Run `./scripts/verify.sh` in the integrated terminal.
3. **Self-Correction:** If TypeScript compilation (`tsc`), frontend build (`vite build`), or test suites fail, inspect the exact error tracebacks, apply corrective diffs, and re-run `./scripts/verify.sh` until exit code is 0.

### Phase 4: Autonomous Git Commits
1. **Pre-Commit Enforcement:** NEVER run `git commit` unless `./scripts/verify.sh` passes with exit code 0.
2. **Deterministic Staging:**
   - NEVER use `git add .` or `git add -A`.
   - Explicitly stage changed and created files by path (e.g., `git add backend/router.ts tests/router.test.js`).
   - Verify `git status` to ensure `.env`, build artifacts (`dist/`, `.vite/`), and temporary logs are not staged.
3. **Conventional Commit Format:**
   - Format: `<type>(<scope>): <short summary>` (under 72 chars, imperative mood).
   - Valid types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.
   - Examples:
     - `feat(api): add geospatial radius search to property endpoint`
     - `fix(booking): prevent room overbooking on concurrent rental requests`
     - `test(auth): add integration tests for password verification gates`
4. **Remote Guard:** Do NOT execute `git push` or modify remote branches autonomously.