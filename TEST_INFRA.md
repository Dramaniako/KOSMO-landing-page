# E2E Test Infrastructure: KOSMO Bali Co-Living Marketplace v2.0.0

## 1. Test Philosophy & Engineering Principles
- **Requirement-Driven & Opaque-Box**: Tests are derived strictly from authoritative specifications (`ORIGINAL_REQUEST.md` and `PROJECT.md`), asserting user-observable behaviors, API contracts, and business invariants rather than internal private functions.
- **Strict 4-Tier Test Suite Architecture**:
  1. **Tier 1 — Feature Coverage (Equivalence Partitioning)**: Minimum 5 tests per feature covering happy-path and typical variants in complete isolation.
  2. **Tier 2 — Boundary & Corner Cases (Boundary Value Analysis)**: Minimum 5 tests per domain exercising extreme limits, zero/negative quantities, payload boundaries, and adversarial injection attempts.
  3. **Tier 3 — Cross-Feature Combinations (Pairwise Interaction)**: Pairwise permutations verifying feature intersections, state handoffs, and concurrency boundaries across subsystems.
  4. **Tier 4 — Real-World Application Scenarios (Persona Workloads)**: End-to-end multi-step application journeys simulating authentic Bali digital nomad, local tenant, landlord, and administrator workflows.
- **Determinism & Shared Staging Safety**:
  - Test records use strictly isolated prefixes (`test-user-*`, `test-prop-*`, `test-contract-*`, `rent-e2e-*`).
  - Zero-disk streaming to Cloudinary in-memory buffers; zero disk writes to `backend/uploads/`.
  - Non-destructive DB operations (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
  - Automatic teardown and cleanup in `afterEach` and `afterAll` hooks.
- **Zero-`any` TypeScript Policy**: Strict domain typing throughout all Playwright specifications and fixtures.

---

## 2. Feature Inventory Mapping (All 23 Features)

| Feature # | Feature Name | Milestone | Specification Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|:---:|:---|:---:|:---|:---:|:---:|:---:|:---:|
| 1 | Single Active Tenancy Guard in Payment Token | M1 | ORIGINAL_REQUEST §R1.1, PROJECT §1 | 5 | 5 | 2 | 2 |
| 2 | Pessimistic Locking on Room Booking & Signing | M1 | ORIGINAL_REQUEST §R1.1, PROJECT §2 | 5 | 5 | 2 | 2 |
| 3 | Decouple CDN Upload from DB Transaction | M1 | ORIGINAL_REQUEST §R1.1, PROJECT §3 | 5 | 5 | 1 | 1 |
| 4 | Direct SQL Aggregations for Landlord Analytics | M1 | ORIGINAL_REQUEST §R1.2, PROJECT §4 | 5 | 5 | 2 | 2 |
| 5 | Atomic Withdrawal Refund Rollback | M1 | ORIGINAL_REQUEST §R1.2, PROJECT §5 | 5 | 5 | 2 | 2 |
| 6 | Non-Destructive Migrations | M1 | ORIGINAL_REQUEST §R1.3, PROJECT §6 | 5 | 5 | 1 | 1 |
| 7 | Integration Test Isolation & Mock Teardown | M1 | ORIGINAL_REQUEST §R1.3, PROJECT §7 | 5 | 5 | 1 | 1 |
| 8 | Digital E-Contract Audit Trail | M2 | ORIGINAL_REQUEST §R2.1, PROJECT §8 | 5 | 5 | 2 | 2 |
| 9 | Zero-Disk Cloudinary PDF Streaming | M2 | ORIGINAL_REQUEST §R2.2, PROJECT §9 | 5 | 5 | 1 | 1 |
| 10 | Legal Clauses & Inclusions (UU ITE & KUHPerdata) | M2 | ORIGINAL_REQUEST §R2.3, PROJECT §10 | 5 | 5 | 1 | 2 |
| 11 | In-Memory Sharp/WebP Media Pipeline | M2 | ORIGINAL_REQUEST §R5.1, PROJECT §11 | 5 | 5 | 1 | 1 |
| 12 | OWASP Strict Zod Mutation Validation | M2 | ORIGINAL_REQUEST §R5.2, PROJECT §12 | 5 | 5 | 2 | 1 |
| 13 | API Latency Optimization (< 200ms) | M2 | ORIGINAL_REQUEST §R5.2, PROJECT §13 | 5 | 5 | 1 | 1 |
| 14 | Manual Lease Renewal Lifecycle | M3 | ORIGINAL_REQUEST §R3.1, PROJECT §14 | 5 | 5 | 2 | 2 |
| 15 | Renewal Token Endpoint & Midtrans Handler | M3 | ORIGINAL_REQUEST §R3.2, PROJECT §15 | 5 | 5 | 2 | 2 |
| 16 | 3-Tier Monetization Implementation | M3 | ORIGINAL_REQUEST §R3.3, PROJECT §16 | 5 | 5 | 2 | 2 |
| 17 | Hyperlocal Micro-PMS Badges | M3 | ORIGINAL_REQUEST §R4.1, PROJECT §17 | 5 | 5 | 1 | 2 |
| 18 | Landlord Billing Reminder Utilities | M3 | ORIGINAL_REQUEST §R4.1, PROJECT §18 | 5 | 5 | 1 | 1 |
| 19 | Multi-Criteria Adaptive Recommendation Engine | M4 | ORIGINAL_REQUEST §R4.2, PROJECT §19 | 5 | 5 | 2 | 2 |
| 20 | Interaction Telemetry & Dynamic Preference Updating | M4 | ORIGINAL_REQUEST §R4.2, PROJECT §20 | 5 | 5 | 2 | 2 |
| 21 | 100% E2E Test Suite Pass (Tiers 1-4) | M5 | ORIGINAL_REQUEST §R6, PROJECT §21 | 5 | 5 | 2 | 2 |
| 22 | Tier 5 Adversarial Coverage Hardening | M5 | ORIGINAL_REQUEST §R6, PROJECT §22 | 5 | 5 | 2 | 2 |
| 23 | Deterministic 5-Gate Final Verification | M5 | ORIGINAL_REQUEST §R6, PROJECT §23 | 5 | 5 | 2 | 2 |

---

## 3. 4-Tier Test Architecture & Specification Design

### Tier 1: Feature Coverage (Isolation Happy Paths — >= 5 tests per feature)
Each feature is validated with at least 5 isolated tests verifying core requirements and happy-path data sets:
- **Feature 1 (Single Active Tenancy Guard in Payment Token)**:
  - T1-01-01: Generates payment token for user without active lease (`POST /api/payment/token`).
  - T1-01-02: Returns HTTP 409 Conflict when user already holds an active lease on any property.
  - T1-01-03: Allows token generation if requested `customRentalId` matches user's existing pending lease.
  - T1-01-04: Returns calculated gross amount including flat Rp5,000 admin fee.
  - T1-01-05: Returns Midtrans attempt order ID with timestamp suffix for retry idempotency.
- **Feature 2 (Pessimistic Locking on Room Booking & Signing)**:
  - T1-02-01: Acquires row lock and reserves discrete available room during `/rentals/contract/sign`.
  - T1-02-02: Rejects booking with HTTP 409 Conflict if target room status is `occupied`.
  - T1-02-03: Rejects booking with HTTP 409 Conflict if target room status is `maintenance`.
  - T1-02-04: Auto-selects and locks lowest room number when property has discrete inventory and no roomId is specified.
  - T1-02-05: Atomically updates property occupied room counts on successful booking settlement.
- **Feature 3 (Decouple CDN Upload from DB Transaction)**:
  - T1-03-01: Contract signing records DB state independently of CDN latency.
  - T1-03-02: Contract PDF buffer generation completes without active open DB lock.
  - T1-03-03: Failed CDN upload triggers graceful fallback URL without aborting tenancy commitment.
  - T1-03-04: Async background retry dispatches for missing Cloudinary contract documents.
  - T1-03-05: Transaction commits immediately after database row mutation.
- **Feature 4 (Direct SQL Aggregations for Landlord Analytics)**:
  - T1-04-01: Landlord occupancy rate is computed via direct SQL `COUNT`/`SUM` expressions in TiDB.
  - T1-04-02: Total revenue aggregates gross rental transactions via SQL `SUM(price)`.
  - T1-04-03: Balance metric correctly aggregates net landlord earnings (`gross - 3% commission - withdrawals`).
  - T1-04-04: Active tenant count matches distinct tenants with status `active`.
  - T1-04-05: Monthly revenue time-series aggregates correctly across billing periods.
- **Feature 5 (Atomic Withdrawal Refund Rollback)**:
  - T1-05-01: Admin withdrawal rejection restores landlord balance in an atomic transaction.
  - T1-05-02: Rejection transitions withdrawal status from `pending` to `rejected`.
  - T1-05-03: Audit log captures admin rejection reason and timestamp.
  - T1-05-04: Approved withdrawal marks status `completed` without balance refund.
  - T1-05-05: Multiple concurrent withdrawal rejections process cleanly with isolated transactional rollbacks.
- **Feature 6 (Non-Destructive Migrations)**:
  - T1-06-01: Schema migrations execute idempotent `ADD COLUMN IF NOT EXISTS` statements.
  - T1-06-02: Existing staging data in `rentals`, `rooms`, `users` remains intact after migration run.
  - T1-06-03: Composite indexes on foreign keys and lookup columns are verified.
  - T1-06-04: Migration runner skips already applied DDL statements without error.
  - T1-06-05: Re-running database initialization on populated DB causes zero schema drift or data loss.
- **Feature 7 (Integration Test Isolation & Mock Teardown)**:
  - T1-07-01: Test users and properties strictly utilize `test-*` identifiers.
  - T1-07-02: `afterEach` hooks clean up created test records in reverse foreign key order.
  - T1-07-03: Orphaned test records from failed tests are swept by teardown cleaner.
  - T1-07-04: Production and permanent seed rows (`prop-01`, `prop-02`, etc.) are never deleted or truncated.
  - T1-07-05: Concurrent test runs with different session UUID prefixes do not collide.
- **Feature 8 (Digital E-Contract Audit Trail)**:
  - T1-08-01: Persists SHA-256 contract hash matching the exact PDF binary buffer.
  - T1-08-02: Captures dual timestamps (UTC and WITA Central Indonesia Time).
  - T1-08-03: Persists signer IP address and User-Agent headers.
  - T1-08-04: Stores validated 16-digit Indonesian NIK or Passport identifier.
  - T1-08-05: Stores Base64 canvas vector signature data and affirmative consent flag.
- **Feature 9 (Zero-Disk Cloudinary PDF Streaming)**:
  - T1-09-01: PDFKit document renders into in-memory chunks without writing to local disk.
  - T1-09-02: Streams in-memory buffer to Cloudinary `kosmo/contracts/` via upload stream.
  - T1-09-03: `backend/uploads/` directory remains completely empty after PDF creation.
  - T1-09-04: Serverless deployment entry point (`api/index.js`) executes PDF generation with read-only root.
  - T1-09-05: PDF download endpoint streams directly from Cloudinary or memory to client.
- **Feature 10 (Legal Clauses & Inclusions)**:
  - T1-10-01: PDF document contains statutory citation of KUHPerdata Article 1320.
  - T1-10-02: Terms cite UU ITE No. 11/2008 jo. UU No. 1/2024 for electronic contract validity.
  - T1-10-03: Dispute resolution clause specifies exclusive jurisdiction of Denpasar / Badung District Court.
  - T1-10-04: Inclusions clause specifies WiFi 100 Mbps, PDAM water, cleaning, and smart lock.
  - T1-10-05: Electricity clause specifies 200 kWh monthly baseline quota with excess surcharge term.
- **Feature 11 (In-Memory Sharp/WebP Media Pipeline)**:
  - T1-11-01: Image upload generates Thumbnail WebP variant (400x300 px) in memory.
  - T1-11-02: Image upload generates High-Res Hero WebP variant (1200x800 px @ 80% quality) in memory.
  - T1-11-03: Zero temporary image files written to local file system.
  - T1-11-04: Converts uploaded JPEG/PNG/TIFF formats to WebP format.
  - T1-11-05: Exif orientation metadata is automatically normalized before compression.
- **Feature 12 (OWASP Strict Zod Mutation Validation)**:
  - T1-12-01: Validates rental booking request body with strict Zod schema rejecting unknown fields.
  - T1-12-02: Validates withdrawal request body rejecting negative amounts and non-numeric inputs.
  - T1-12-03: Rejects SQL injection payloads in property search parameters.
  - T1-12-04: Sanitizes and escapes XSS payloads in review text and property descriptions.
  - T1-12-05: Rejects missing mandatory fields with descriptive HTTP 400 validation error responses.
- **Feature 13 (API Latency Optimization < 200ms)**:
  - T1-13-01: `GET /api/properties` returns response within 200ms SLA under normal load.
  - T1-13-02: In-memory cache returns cached property lists in < 50ms.
  - T1-13-03: Mutation operations immediately invalidate relevant cache keys.
  - T1-13-04: `GET /api/rentals` query with joins executes within 200ms.
  - T1-13-05: Compression middleware applies gzip/deflate on payloads > 1KB.
- **Feature 14 (Manual Lease Renewal Lifecycle)**:
  - T1-14-01: Calculates `daysRemaining` accurately from rental start date and duration.
  - T1-14-02: Status badge transitions to "Menjelang Jatuh Tempo" when `<= 3` days remain.
  - T1-14-03: Tenant Dashboard renders "Bayar Sewa Bulan Berikutnya" action button when eligible.
  - T1-14-04: Action button remains hidden when lease has > 3 days remaining.
  - T1-14-05: Expired lease transitions status to "Selesai" after grace period.
- **Feature 15 (Renewal Token Endpoint & Midtrans Handler)**:
  - T1-15-01: `POST /api/rentals/:id/renew-token` generates Snap renewal payment token.
  - T1-15-02: Generates order ID prefixed with `RENEW-{rentalId}-{timestamp}`.
  - T1-15-03: Midtrans settlement webhook detects `RENEW-*` order prefix.
  - T1-15-04: Webhook increments `duration_months` without triggering 409 Single Active Tenancy conflict.
  - T1-15-05: Renewal settlement bypasses room occupancy increment since tenant already occupies unit.
- **Feature 16 (3-Tier Monetization Implementation)**:
  - T1-16-01: Tenant checkout includes flat Rp5,000 administrative & stamp fee.
  - T1-16-02: Midtrans payment settlement deducts 3% platform commission from landlord balance.
  - T1-16-03: Landlord balance credit equals `gross_amount - 3% - admin_fee`.
  - T1-16-04: Landlord Featured Listing slot purchase (Rp100,000–Rp150,000/mo) activates featured badge.
  - T1-16-05: Financial reports show itemized platform revenue breakdown.
- **Feature 17 (Hyperlocal Micro-PMS Badges)**:
  - T1-17-01: `KosCard.tsx` renders "Tandon Air Terjamin" badge when property feature is active.
  - T1-17-02: `KosCard.tsx` renders "Speedtest Wi-Fi Terverifikasi" badge with measured bandwidth.
  - T1-17-03: Property detail modal displays verification certificates and test dates.
  - T1-17-04: Search filter allows filtering properties with verified water tank and high-speed WiFi.
  - T1-17-05: Landlord dashboard allows uploading proof of water supply and speedtest screenshots.
- **Feature 18 (Landlord Billing Reminder Utilities)**:
  - T1-18-01: Landlord dashboard renders due-date countdown badge for each tenant.
  - T1-18-02: Generates one-click WhatsApp reminder link pre-filled with tenant name, room, and due date.
  - T1-18-03: Reminder link formats Indonesian currency and date accurately.
  - T1-18-04: Highlights overdue tenants with urgent visual styling.
  - T1-18-05: Landlord can record offline payment confirmations with audit note.
- **Feature 19 (Multi-Criteria Adaptive Recommendation Engine)**:
  - T1-19-01: Evaluates Simple Additive Weighting (SAW) score $R_i = \sum W_j S_{ij}$ across criteria.
  - T1-19-02: Cost criteria (price, distance) are normalized inversely ($min / x$).
  - T1-19-03: Benefit criteria (facilities, rating, room size) are normalized directly ($x / max$).
  - T1-19-04: Criteria weights sum to exactly 1.0 ($\sum W_j = 1$).
  - T1-19-05: `GET /api/properties/recommended` returns properties ranked in descending suitability order.
- **Feature 20 (Interaction Telemetry & Dynamic Preference Updating)**:
  - T1-20-01: Tracks 7 interaction event types (`view`, `like`, `bookmark`, `chat`, `booking`, `rating`, `filter`).
  - T1-20-02: `POST /api/tracking/interaction` records event timestamp, property, and user session.
  - T1-20-03: Updates user preference vector dynamically: $P_j' = \alpha P_j + (1 - \alpha) B_j$.
  - T1-20-04: High interaction with budget kos shifts preference weight toward price sensitivity.
  - T1-20-05: Unauthenticated anonymous sessions track interactions via persistent client device UUID.
- **Feature 21 (100% E2E Test Suite Pass — Tiers 1-4)**:
  - T1-21-01: Playwright runner launches with zero configuration errors.
  - T1-21-02: Web server hooks (backend port 5000, frontend port 5173) start reliably.
  - T1-21-03: All Tier 1 feature tests pass without intermittent flakiness.
  - T1-21-04: Test execution completes within configured timeout limits.
  - T1-21-05: All browser console errors and unhandled rejections are caught and asserted.
- **Feature 22 (Tier 5 Adversarial Coverage Hardening)**:
  - T1-22-01: Validates system behavior against rapid double-click booking attempts.
  - T1-22-02: Validates system behavior against malformed Midtrans webhook signatures.
  - T1-22-03: Validates SQL injection resilience on all query and filter endpoints.
  - T1-22-04: Validates payload size limits on photo and document uploads.
  - T1-22-05: Validates HTTP parameter pollution and CRLF header injection defenses.
- **Feature 23 (Deterministic 5-Gate Final Verification)**:
  - T1-23-01: Gate 1 (Backend TypeScript Strictness) exits code 0 with 0 errors.
  - T1-23-02: Gate 2 (Frontend & Backend Production Build) exits code 0.
  - T1-23-03: Gate 3 (Backend Test Suite) exits code 0 with 100% pass.
  - T1-23-04: Gate 4 (Frontend Component Unit Tests) exits code 0 with 100% pass.
  - T1-23-05: Gate 5 (Playwright E2E Test Suite) exits code 0 with 100% pass.

---

### Tier 2: Boundary & Corner Cases (Boundary Value Analysis — >= 5 tests per domain)
- **Domain A: Concurrency & Tenancy Guard Boundaries**:
  - Zero/negative duration months (e.g. 0, -1, -12) rejected with HTTP 400.
  - Maximum duration boundary (e.g. 24 months, 120 months) handled with proper clamping or validation.
  - Multiple rapid concurrent token requests from same tenant: exactly 1 succeeds or serializes cleanly.
  - Room occupancy boundary: booking the very last available room transitions available count to 0.
  - Overbooking race: simultaneous checkout for identical single available room rejects losing request with HTTP 409.
- **Domain B: Contract Audit Trail & Legal Boundaries**:
  - Indonesian NIK boundary: exactly 16 digits accepted; 15 digits or 17 digits rejected with validation error.
  - Passport string boundary: alphanumeric 6-12 chars; special characters rejected.
  - Empty or single-dot signature canvas rejected; requires minimum vector stroke density.
  - Unscrolled contract terms: consent checkbox disabled until user reaches bottom of terms container.
  - Missing Client-IP and User-Agent headers: fallback to socket address without throwing unhandled exception.
- **Domain C: Media Pipeline & OWASP Boundaries**:
  - Oversized image upload exceeding 10MB rejected with HTTP 413.
  - Non-image MIME type disguised as JPEG (e.g. executable script) rejected by file signature validator.
  - Zero-byte image upload rejected gracefully.
  - Extremely high aspect ratio (e.g. 10000x10 px panoramic) normalized without memory crash.
  - Malicious XSS vectors (`<script>`, `javascript:`, `onerror=`) in review comments sanitized before persistence.
- **Domain D: Lease Renewal & Monetization Boundaries**:
  - Due date exactly 3 days remaining (`daysRemaining === 3`) activates renewal CTA.
  - Due date 4 days remaining (`daysRemaining === 4`) keeps renewal CTA hidden.
  - Due date 0 days (today) and negative days (overdue) properly reflect status and calculate grace period.
  - Flat admin fee Rp5,000 invariant: remains exactly Rp5,000 regardless of lease price or duration.
  - 3% landlord platform commission calculation handles fractional rupiah via deterministic rounding.
- **Domain E: Recommendation Engine & Telemetry Boundaries**:
  - Zero interaction history: recommendation engine defaults cleanly to baseline distance & rating weights.
  - Uniform criteria weights ($W_j = 1/N$) verify normalized sum equals 1.0.
  - Coordinate distance boundary: extreme geographic coordinates outside Bali region handled gracefully.
  - Telemetry flooding: 100 rapid interaction events throttled or queued without database deadlock.
  - Unknown interaction event type rejected by strict Zod schema.

---

### Tier 3: Cross-Feature Combinations (Pairwise Permutations)
- **T3-PW-01 (F1 + F14 + F15: Tenancy Guard & Lease Renewal)**:
  - Tenant with active lease initiates renewal via `POST /api/rentals/:id/renew-token`.
  - System recognizes `RENEW-*` order format, bypasses Single Active Tenancy 409 conflict, and advances duration upon webhook settlement.
- **T3-PW-02 (F2 + F8 + F10: Pessimistic Room Lock + Contract Audit + Legal Clauses)**:
  - Contract signing acquires row lock on target room, persists SHA-256 hash, and generates PDF incorporating KUHPerdata 1320 and 200 kWh utility clauses.
- **T3-PW-03 (F4 + F5 + F16: SQL Aggregations + Withdrawal Rollback + Monetization)**:
  - Landlord balance reflects 3% commission deduction; when admin rejects withdrawal, exact net requested amount is atomically restored to landlord balance.
- **T3-PW-04 (F11 + F17 + F12: Sharp/WebP Pipeline + Micro-PMS Badges + Zod Validation)**:
  - Landlord uploads WiFi speedtest badge evidence; Sharp compresses to WebP in memory, and Zod validates metadata before Cloudinary streaming.
- **T3-PW-05 (F19 + F20 + F16: Recommendation Engine + Telemetry + Featured Listings)**:
  - Featured listing slot purchase boosts property score in recommendation ranking alongside adaptive interaction telemetry weights.
- **T3-PW-06 (F9 + F13 + F8: Zero-Disk Streaming + API Latency SLA + Audit Trail)**:
  - Contract generation streams directly to Cloudinary without disk I/O while maintaining API response time under 200ms and persisting SHA-256 checksum.
- **T3-PW-07 (F6 + F7 + F23: Non-Destructive Migrations + Test Isolation + 5-Gate Pipeline)**:
  - Test suites execute against shared staging TiDB using isolated `test-*` prefixes without mutating schema or dropping tables.

---

### Tier 4: Real-World Application Scenarios (5 Comprehensive Workloads)
- **T4-WL-01: End-to-End Bali Digital Nomad Tenancy Journey**:
  - Persona: Nomad searches Canggu/Seminyak kos with high-speed WiFi filter.
  - Inspects "Speedtest Wi-Fi Terverifikasi" and "Tandon Air Terjamin" badges.
  - Selects Room 101 on Floor 1, scrolls bilingual digital lease agreement, draws signature, enters NIK/Passport.
  - Completes payment via Midtrans Snap; redirected to Tenant Dashboard.
  - Observes active lease, downloads zero-disk PDF contract, verifies SHA-256 hash.
- **T4-WL-02: Landlord Property Onboarding & Micro-PMS Operation**:
  - Persona: Balinese landlord logs into Landlord Dashboard.
  - Adds 8 discrete rooms across 2 floors with custom room pricing.
  - Uploads categorized photos (bedroom, bathroom, exterior) processed into dual WebP variants.
  - Direct SQL analytics update occupancy and potential revenue in real time.
  - Sets Room 104 to maintenance; public catalog immediately disables Room 104 from booking.
- **T4-WL-03: High-Concurrency Double-Booking Contention**:
  - Persona: Two prospective tenants attempt to book the last remaining room at the same instant.
  - Both navigate to checkout simultaneously.
  - Pessimistic row locking (`SELECT ... FOR UPDATE`) serializes the transactions.
  - First tenant successfully acquires lease; second tenant receives deterministic HTTP 409 Conflict with descriptive message.
- **T4-WL-04: Tenancy Due Date & Manual Lease Renewal Cycle**:
  - Persona: Existing tenant reaches 3 days prior to monthly lease expiration.
  - Dashboard displays "Menjelang Jatuh Tempo" countdown badge and enables "Bayar Sewa Bulan Berikutnya".
  - Tenant clicks renewal CTA, receives `RENEW-*` payment token, completes renewal checkout.
  - Landlord dashboard updates billing schedule; WhatsApp billing reminder utility reflects updated due date.
- **T4-WL-05: 3-Tier Monetization & Payout Cycle with Rejection Recovery**:
  - Persona: Tenant pays Rp4,000,000 monthly rent + Rp5,000 admin fee.
  - Midtrans webhook verifies SHA-512 signature, settles payment.
  - Platform retains Rp5,000 admin fee and deducts 3% commission (Rp120,000).
  - Landlord balance credited with Rp3,880,000 net rent.
  - Landlord requests Rp2,000,000 withdrawal; admin rejects with reason; landlord balance restored atomically via transaction rollback.

---

## 4. Test Harness, Fixtures & Execution Guide

### Test Suite Directory Structure
```
tests/e2e/
├── auth_roles.spec.ts                     # Authentication & role-based dashboard routing
├── discrete_rooms_gallery.spec.ts         # Discrete room inventory & photo gallery (Tiers 1-4)
├── perf_webvitals.spec.ts                 # Core Web Vitals and frontend navigation performance
├── rental_flow.spec.ts                    # Real end-to-end rental booking & tenancy lifecycle
├── search_and_book.spec.ts                # Property search, filter, and booking flow
├── tier1_features_m1_m2.spec.ts           # Tier 1: Features 1-13 isolated coverage tests
├── tier1_features_m3_m5.spec.ts           # Tier 1: Features 14-23 isolated coverage tests
├── tier2_boundary_corner_cases.spec.ts    # Tier 2: Boundary Value Analysis & corner cases
├── tier3_cross_feature_combinations.spec.ts # Tier 3: Pairwise cross-feature combinations
└── tier4_real_world_scenarios.spec.ts     # Tier 4: Comprehensive real-world persona journeys
```

### Execution Commands
```bash
# Run the entire E2E test suite across all tiers:
npx playwright test

# Run specific tier specs:
npx playwright test tests/e2e/tier1_features_m1_m2.spec.ts tests/e2e/tier1_features_m3_m5.spec.ts
npx playwright test tests/e2e/tier2_boundary_corner_cases.spec.ts
npx playwright test tests/e2e/tier3_cross_feature_combinations.spec.ts
npx playwright test tests/e2e/tier4_real_world_scenarios.spec.ts

# Run with interactive UI debugger:
npx playwright test --ui

# Run full 5-gate deterministic verification pipeline:
powershell -ExecutionPolicy Bypass -File ./scripts/verify.ps1   # Windows
./scripts/verify.sh                                            # Linux / macOS / CI
```

### Deterministic Seed State
Prior to Gate 5 test execution, `npm run db:seed` is executed to restore the TiDB database to a pristine seed state with canonical accounts (`admin@kosmo.id`, `landlord@kosmo.id`, `tenant@kosmo.id`) and standard test properties (`prop-01`, `prop-02`).
