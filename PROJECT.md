# Project: GitHub Issues & Pull Requests Triage, Defect Resolution & Integration

## Architecture
- **Backend Architecture**: Node.js, Express, TypeScript (`backend/`). Domain routers in `backend/routes/` mounted through central router (`backend/routes/index.ts`). MySQL connection pooling via `mysql2/promise` in `backend/db.ts`. Standalone Node server (`backend/server.ts`) and Vercel serverless bundle (`api/index.js`).
- **Database Schema**: MySQL/InnoDB with ACID transactions. Core domain tables: `properties`, `rooms`, `property_photos`, `rentals`, `users`, `property_facilities`, `reviews`, `withdrawals`.
- **Frontend Architecture**: React 19, TypeScript, Vite, Tailwind CSS, Lucide React (`frontend/src/`). Central pages in `pages/`, shared components in `components/`, utilities in `utils/`.
- **Security & Caching**: Ephemeral random bytes fallback for JWT secrets, password verification gates (`bcrypt`), in-memory `apiCache` with pattern invalidation, HTTP 304 conditional caching (`Last-Modified`), client-side TTL caching and `AbortController`.
- **Verification Pipeline**: 5-gate deterministic pipeline enforced by `./scripts/verify.sh` / `./scripts/verify.ps1`:
  1. Backend TypeScript type-check (`npx tsc --noEmit`)
  2. Frontend build (`npm --prefix frontend run build`) & Backend bundle (`npm run build:backend`)
  3. Backend test suite (`npm test`)
  4. Frontend Vitest suite (`npm --prefix frontend test -- --run`)
  5. Playwright E2E browser suite (`npx playwright test`)

## Feature Inventory
| # | Feature / Item | Target Scope & Description | Milestone | Source |
|---|---|---|---|---|
| 1 | PR #75: JWT Secret Fallback | Replace hardcoded production fallback secret with cryptographically secure `randomBytes(32).toString('hex')` in `backend/middleware/auth.ts` and rebuild `api/index.js` | M1 | Survey 3 |
| 2 | PR #76: Admin Password Gate Audit | Audit admin user deletion password verification gate. Verify superseded in main by commit `8905d98` and modular `backend/routes/users.routes.ts`. Mark REJECT/CLOSE | M1 | Survey 3 |
| 3 | PR #77: property_facilities Index | Add index statement for `property_facilities.propertyId` to `backend/db.ts:ensureIndexes()` and update `.jules/bolt.md` | M1 | Survey 3 |
| 4 | PR #91: formatRupiah Caching (Winner) | Merge optimal PR #91 replacing expensive `.toLocaleString` with cached `formatRupiah` across `ActiveRentalSection.tsx`, `PendingPaymentModal.tsx`, `RentalHistorySection.tsx` | M1 | Survey 3 |
| 5 | PRs #92–#95: Redundant PRs Discard | Document technical disqualifications for PR #92 (scope creep), #93 (duplicate), #94 (incomplete), #95 (incomplete) | M1 | Survey 3 |
| 6 | Issue #78: Concurrent Queries in Rooms Route | In `backend/routes/rooms.routes.ts:103-134`, run independent room and photo SQL queries concurrently using `Promise.all` | M2 | Survey 1 |
| 7 | Issue #79: Explicit Column Projections | Replace 4 occurrences of `SELECT * FROM property_photos` in `backend/routes/rooms.routes.ts` and `backend/routes/photos.routes.ts` with explicit `PropertyPhotoRow` columns | M2 | Survey 1 |
| 8 | Issue #80: In-Memory Single-Room Caching | Wire `GET /api/rooms/:roomId` to `apiCache` (TTL 30s) and add `apiCache.invalidatePattern('rooms')` on room mutations | M2 | Survey 1 |
| 9 | Issue #81: Bulk UPDATE for Photo Reordering | In `backend/routes/photos.routes.ts:315-332`, collapse sequential loop of individual UPDATE queries into a single bulk `CASE WHEN` UPDATE | M2 | Survey 1 |
| 10 | Issue #82: Safe Server-Side Photo Pagination | In `backend/routes/photos.routes.ts:69-125`, add optional sanitized `limit`/`offset` pagination params & headers while preserving array format `PropertyPhoto[]` by default | M2 | Survey 1 |
| 11 | Issue #87: Photos updatedAt & HTTP 304 Caching | Add `updatedAt` column to `property_photos` in `backend/db.ts` and implement HTTP 304 conditional caching (`Last-Modified`/`If-Modified-Since`) in `backend/routes/photos.routes.ts` | M2 | Survey 2 |
| 12 | Issue #88: Multi-Row Batch Photo INSERT | In `backend/routes/photos.routes.ts:216-242`, replace sequential single-row INSERT loop with a single multi-row parameterized `INSERT INTO property_photos` query | M2 | Survey 2 |
| 13 | Issue #90: Photo Composite Index & Clean SQL Filter | Add composite indexes `idx_photos_prop_cat` and `idx_photos_prop_room` in `backend/db.ts`; clean `roomId IS NULL` lookup in `backend/routes/photos.routes.ts` | M2 | Survey 2 |
| 14 | Issue #83: BookingModal Client-Side Cache | In `frontend/src/components/BookingModal.tsx:74-124`, add module-level cache (`Map`) with 60s TTL and initialize state with preloaded listing photos/rooms | M3 | Survey 1 |
| 15 | Issue #84: Gallery Image Modern Loading Attributes | In `PropertyPhotoGallery.tsx`, add `loading="eager"`, `decoding="async"`, `fetchPriority="high"` on hero image, and `loading="lazy"`, `decoding="async"` on thumbnails/lightbox | M3 | Survey 1 |
| 16 | Issue #85: Cloudinary Responsive Thumbnail Transforms | Create `getCloudinaryThumbUrl` helper in `frontend/src/utils/cloudinary.ts` and integrate into thumbnail filmstrip in `PropertyPhotoGallery.tsx` | M3 | Survey 2 |
| 17 | Issue #86: Active Rental Fetch TTL Cache & Abort | In `frontend/src/pages/LandingPage.tsx:206-238`, wrap active rental check in 60s TTL cache with `AbortController` to stop network spam and button disability jitter | M3 | Survey 2 |
| 18 | Issue #89: RoomSelectionGrid Memo & Windowing | Extract memoized `RoomCardItem` and implement progressive windowing/pagination for large room lists in `RoomSelectionGrid.tsx` | M3 | Survey 2 |
| 19 | Milestone 4: Programmatic Verification & Tests | Write unit tests for new helpers/endpoints (`tests/triage_fixes.test.ts`, `frontend/src/utils/__tests__/cloudinary.test.ts`), verify all test suites, and execute Forensic Integrity Audit | M4 | Mandate |
| 20 | Milestone 5: GitHub Resolution & Sync Report | Generate `GITHUB_TRIAGE_REPORT.md` documenting disposition of all 13 issues and 8 PRs with copy-pasteable remote sync commands | M5 | Mandate |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | PR Evaluation & Branch Integration | Merge PRs #75, #77, #91; document discard for #76, #92–#95; rebuild backend bundle | Survey Complete | DONE |
| M2 | Backend & Database Defect Resolutions | Fix issues #78, #79, #80, #81, #82, #87, #88, #90 in `backend/routes/` and `backend/db.ts` | M1 | DONE |
| M3 | Frontend Performance & Virtualization | Fix issues #83, #84, #85, #86, #89 in `frontend/src/` components and utilities | M1 | DONE |
| M4 | Verification, Automated Tests & Forensic Audit | Write automated tests in `tests/` and frontend test suite; run full verify pipeline; run Forensic Auditor | M2, M3 | DONE |
| M5 | GitHub Resolution & Remote Sync Report | Generate comprehensive audit markdown report with copy-pasteable closure/merge commands | M4 | DONE |

## Interface Contracts

### Backend Auth Middleware (`backend/middleware/auth.ts`)
- `getJwtSecret(): string`: If `JWT_SECRET` is unset in production, logs a warning and generates an ephemeral secret via `process.env.JWT_FALLBACK_SECRET || randomBytes(32).toString('hex')`.

### Backend Photos API (`backend/routes/photos.routes.ts`)
- `GET /api/properties/:id/photos?category=&roomId=&limit=&offset=`:
  - Returns `PropertyPhoto[]` by default.
  - Sets HTTP headers `Last-Modified` and handles `If-Modified-Since` by returning `304 Not Modified` if unchanged.
  - If `limit` is passed, safely paginates results and sets headers `X-Total-Count`, `X-Page-Limit`, `X-Page-Offset`.
- `POST /api/properties/:id/photos`:
  - Inserts up to 10 photos in a single atomic multi-row `INSERT INTO property_photos` statement.
- `PUT /api/properties/:id/photos/reorder`:
  - Updates photo order indices using a single bulk `CASE id WHEN ? THEN ? ... END` statement.

### Backend Rooms API (`backend/routes/rooms.routes.ts`)
- `GET /api/properties/:id/rooms`: Queries rooms and room photos concurrently via `Promise.all`.
- `GET /api/rooms/:roomId`: Uses `apiCache` with 30s TTL, invalidated via `apiCache.invalidatePattern('rooms')`.

### Frontend Utilities (`frontend/src/utils/cloudinary.ts`)
- `getCloudinaryThumbUrl(url: string, width?: number, height?: number): string`: Injects Cloudinary on-the-fly transformations (`w_{width},h_{height},c_fill,q_auto,f_auto`) into valid Cloudinary asset URLs.

## Code Layout
- `backend/middleware/auth.ts`: Authentication middleware & JWT secret handling.
- `backend/db.ts`: Database connection, DDL, migrations, index definitions (`ensureIndexes`).
- `backend/routes/photos.routes.ts`: Property and room photo gallery endpoints.
- `backend/routes/rooms.routes.ts`: Discrete room endpoints and caching.
- `frontend/src/utils/cloudinary.ts`: Cloudinary thumbnail transformation helper.
- `frontend/src/utils/format.ts`: Central currency and date formatting (`formatRupiah`).
- `frontend/src/pages/LandingPage.tsx`: Property detail open handler & active rental status check.
- `frontend/src/components/BookingModal.tsx`: Booking modal lifecycle & client data cache.
- `frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx`: Gallery hero, filmstrip thumbnails, lightbox.
- `frontend/src/components/BookingModal/components/RoomSelectionGrid.tsx`: Memoized room card items and windowed rendering.
- `frontend/src/pages/TenantDashboard/components/ActiveRentalSection.tsx`: Formatted rental prices.
- `frontend/src/pages/TenantDashboard/components/PendingPaymentModal.tsx`: Formatted breakdown prices.
- `frontend/src/pages/TenantDashboard/components/RentalHistorySection.tsx`: Formatted history prices.
- `tests/triage_fixes.test.ts`: Automated tests for triage fixes and PR integrations.
- `api/index.js`: Compiled backend serverless bundle.
