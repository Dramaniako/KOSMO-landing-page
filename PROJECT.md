# Project: KOSMO Bali Co-Living Marketplace v2.0.0

## Architecture
- **Backend Architecture:** 3-tier Router -> Service -> Repository pattern in `backend/routes/`, `backend/services/`, `backend/repositories/`, `backend/router.ts`, running on Node.js / Express with TypeScript (`tsx`), Vercel serverless entry point at `api/index.js`.
- **Database:** TiDB Serverless Cloud (MySQL dialect via `mysql2/promise` connection pooling with SSL in `backend/db.ts`).
  - Domain tables: `users`, `properties`, `property_facilities`, `rooms`, `property_photos`, `reviews`, `withdrawals`, `visitor_tracking`, `rentals`.
- **Frontend Architecture:** React 19, TypeScript, Vite 5, Tailwind CSS, Lucide React, Leaflet OpenStreetMap in `frontend/src/`.
- **Authentication & Security:** Stateless JWT authentication (`Authorization: Bearer <token>` and `token=<jwt>` HttpOnly cookie), Bcrypt 10 rounds, password confirmation on destructive endpoints, OWASP strict Zod validation.
- **Media & Storage:** Cloudinary CDN streaming, PDFKit in-memory buffer generation with zero local disk writes.
- **Verification Infrastructure:** 5-gate deterministic pipeline (`scripts/verify.sh` & `scripts/verify.ps1`).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Single Active Tenancy Guard in Payment Token | Row-level locking (`SELECT ... FOR UPDATE`) in `POST /api/payment/token` with 409 Conflict check | M1 | ORIGINAL_REQUEST §R1.1 |
| 2 | Pessimistic Locking on Room Booking & Signing | Row-level locks in `POST /api/rentals` and `POST /api/rentals/contract/sign` | M1 | ORIGINAL_REQUEST §R1.1 |
| 3 | Decouple CDN Upload from DB Transaction | Move Cloudinary upload outside open database transaction in `contract.service.ts` | M1 | ORIGINAL_REQUEST §R1.1 |
| 4 | Direct SQL Aggregations for Landlord Analytics | Landlord dashboard metrics & revenue computed via direct SQL queries | M1 | ORIGINAL_REQUEST §R1.2 |
| 5 | Atomic Withdrawal Refund Rollback | Rejection of landlord withdrawal atomically restores user balance in transaction | M1 | ORIGINAL_REQUEST §R1.2 |
| 6 | Non-Destructive Migrations | Schema updates via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | M1 | ORIGINAL_REQUEST §R1.3 |
| 7 | Integration Test Isolation & Mock Teardown | `tests/db_integration.test.ts` uses `test-*` prefixes and atomic cleanup hooks | M1 | ORIGINAL_REQUEST §R1.3 |
| 8 | Digital E-Contract Audit Trail | Complete audit trail in `rentals` (`contract_url`, `contract_hash` SHA-256, timestamps, IP, UA, NIK, signature, admin fee) | M2 | ORIGINAL_REQUEST §R2.1 |
| 9 | Zero-Disk Cloudinary PDF Streaming | PDFKit buffers streamed directly to Cloudinary (`kosmo/contracts/`) with zero local disk writes | M2 | ORIGINAL_REQUEST §R2.2 |
| 10 | Legal Clauses & Inclusions | Bilingual terms citing KUHPerdata 1320, UU ITE, Denpasar/Badung jurisdiction, WiFi, water, smart lock, cleaning, 200 kWh electricity | M2 | ORIGINAL_REQUEST §R2.3 |
| 11 | In-Memory Sharp/WebP Media Pipeline | Dual WebP variants (Thumbnail 400x300, Hero 1200x800 @ 80%) without disk storage | M2 | ORIGINAL_REQUEST §R5.1 |
| 12 | OWASP Strict Zod Mutation Validation | Zod schema validation across all mutation endpoints (`rentals`, `withdrawals`, `properties`, `payment`) | M2 | ORIGINAL_REQUEST §R5.2 |
| 13 | API Latency Optimization (< 200ms) | Optimization and caching for `GET /api/rentals` to eliminate latency spikes | M2 | ORIGINAL_REQUEST §R5.2 |
| 14 | Manual Lease Renewal Lifecycle | `daysRemaining` due date tracking, status transition to "Menjelang Jatuh Tempo", "Bayar Sewa Bulan Berikutnya" button | M3 | ORIGINAL_REQUEST §R3.1 |
| 15 | Renewal Token Endpoint & Midtrans Handler | `POST /api/rentals/:id/renew-token` and Midtrans `RENEW-*` order handling without 409 conflict | M3 | ORIGINAL_REQUEST §R3.2 |
| 16 | 3-Tier Monetization Implementation | Flat Rp5,000 tenant admin fee, 3% landlord platform commission deduction, Featured Listing slots | M3 | ORIGINAL_REQUEST §R3.3 |
| 17 | Hyperlocal Micro-PMS Badges | "Tandon Air Terjamin" and "Speedtest Wi-Fi Terverifikasi" badges on `KosCard.tsx` and property details | M3 | ORIGINAL_REQUEST §R4.1 |
| 18 | Landlord Billing Reminder Utilities | Landlord tenant management reminders with WhatsApp link and countdown badge | M3 | ORIGINAL_REQUEST §R4.1 |
| 19 | Multi-Criteria Adaptive Recommendation Engine | SAW normalized suitability scoring $R_i = \sum W_j S_{ij}$ balancing cost vs. benefit | M4 | ORIGINAL_REQUEST §R4.2 |
| 20 | Interaction Telemetry & Dynamic Preference Adaptation | 7-event telemetry and weight updating $P_j' = \alpha P_j + (1 - \alpha) B_j$ | M4 | ORIGINAL_REQUEST §R4.2 |
| 21 | 100% E2E Test Suite Pass (Tiers 1-4) | Comprehensive opaque-box test suite passing across all user scenarios | M5 | ORIGINAL_REQUEST §R6 |
| 22 | Tier 5 Adversarial Coverage Hardening | White-box challenger gap analysis and stress tests | M5 | ORIGINAL_REQUEST §R6 |
| 23 | Deterministic 5-Gate Final Verification | Gates 1-5 passing at 100% exit code 0 | M5 | ORIGINAL_REQUEST §R6 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Concurrency & Storage Integrity | Concurrency locking in `payment.routes.ts`, Cloudinary decoupling in `contract.service.ts`, non-destructive migrations in `db.ts`, test isolation in `tests/db_integration.test.ts` | None | DONE (Gate passed, 10/10 suites pass) |
| M2 | Digital E-Contract & Media/OWASP Hardening | Audit trail completeness in `rentals.repository.ts`, zero-disk Cloudinary streaming (`kosmo/contracts/`), legal clauses, Sharp/WebP image pipeline, Zod validation on mutation endpoints, latency optimization | M1 | DONE (Gate passed, 357 backend tests, 65 E2E tests, clean forensic audit) |
| M3 | Lease Renewal Engine, Monetization & Micro-PMS | `POST /api/rentals/:id/renew-token`, Midtrans `RENEW-*` webhook settlement, 3% platform commission, Featured Listing slots, Micro-PMS badges, and UI action buttons | M1 | PLANNED |
| M4 | Adaptive Recommendation Engine & Telemetry | Simple Additive Weighting (SAW) service, interaction tracking endpoint, dynamic preference updating, recommended properties API | M1, M3 | PLANNED |
| M5 | E2E Test Suite Pass & Adversarial Hardening | Phase 1: Pass 100% E2E Test Suite (Tiers 1-4) + stabilize test assertions; Phase 2: Tier 5 Adversarial Coverage Hardening; Phase 3: Final 5-Gate Deterministic Verification | M2, M3, M4, E2E-Track | PLANNED |

*Note: In parallel with M1–M4, the **E2E Testing Track** designs and validates the comprehensive test suite (Tiers 1–4) and publishes `TEST_READY.md`.*

---

## Interface Contracts

### 1. Payment Token & Renewal (`backend/routes/payment.routes.ts` & `backend/routes/rentals.routes.ts`)
- `POST /api/payment/token`
  - Input: `{ propertyId: string, roomId?: string, durationMonths: number, customRentalId?: string }`
  - Headers: `Authorization: Bearer <token>`
  - Concurrency: `pool.getConnection()`, `beginTransaction()`, `SELECT ... FOR UPDATE` on `properties`, `rooms`, `rentals`.
  - Tenancy Check: If tenant has active rental and `customRentalId` does not match, return `409 Conflict`.
  - Output: `{ token: string, redirect_url: string, orderId: string, rentalId: string, grossAmount: number }`
- `POST /api/rentals/:id/renew-token`
  - Input: `{ months?: number }` (default: 1)
  - Headers: `Authorization: Bearer <token>`
  - Auth: Must be rental tenant or admin.
  - State Check: Rental must be `status === 'active'`.
  - Order ID format: `RENEW-${rental.id}-${monthYear}-${timestamp}`
  - Output: `{ token: string, redirect_url: string, orderId: string, rentalId: string, grossAmount: number }`

### 2. Midtrans Webhook Handler (`backend/routes/payment.routes.ts:settleRentalPayment`)
- Webhook Payload: Midtrans notification with `order_id`, `transaction_status`, `signature_key`, etc.
- Signature: SHA-512 verification (`order_id + status_code + gross_amount + server_key`).
- Routing:
  - Standard order (`rent-...`): Settle initial booking, increment occupied rooms, credit landlord net rent (`gross - 3%`).
  - Renewal order (`RENEW-...`): Extract base rental ID, advance `duration_months += 1`, credit landlord net rent (`gross - 3%`), do NOT increment occupied rooms.

### 3. Digital Contract Audit & Streaming (`backend/services/contract.service.ts`)
- `signContract(rentalId, tenantData, clientInfo)`
  - Input: `{ nikPassport: string, signatureData: string }`, Client: `{ ip: string, userAgent: string }`
  - Output: `{ success: true, contractUrl: string, contractHash: string, signedAt: string }`
  - Audit Trail Fields: `contract_url`, `contract_hash`, `contract_signed_at`, `signer_ip`, `signer_user_agent`, `tenant_nik_passport`, `tenant_signature_data`, `admin_fee_amount`.
  - Decoupled Streaming: Generates buffer and streams to Cloudinary outside DB transaction.

### 4. Recommendation Engine (`backend/services/recommendation.service.ts`)
- `POST /api/tracking/interaction`
  - Input: `{ propertyId: string, interactionType: 'view' | 'like' | 'bookmark' | 'chat' | 'booking' | 'rating' | 'filter', metadata?: Record<string, unknown> }`
  - Behavior: Updates dynamic weights $P_j' = \alpha P_j + (1 - \alpha) B_j$.
- `GET /api/properties/recommended`
  - Query: `?lat=&lng=&limit=10`
  - Output: `PropertySummary[]` with `suitabilityScore: number` sorted descending.

---

## Code Layout
```
backend/
├── db.ts                          # TiDB connection pool, non-destructive schema migrations
├── router.ts                      # Top-level API router
├── middleware/
│   ├── auth.ts                    # JWT authentication & role-based access control
│   └── validation.ts              # Strict Zod request body & query validation schemas
├── routes/
│   ├── auth.routes.ts             # Auth endpoints, verify-password
│   ├── properties.routes.ts       # Property listings, featured filtering, recommended
│   ├── rentals.routes.ts          # Rental management, renewal token
│   ├── payment.routes.ts          # Payment token, Midtrans webhook, settlement
│   ├── landlord.routes.ts         # Landlord metrics, direct SQL aggregations, withdrawals
│   └── photos.routes.ts           # Media upload, Sharp WebP processing, Cloudinary
├── services/
│   ├── contract.service.ts        # Contract signing, audit trail, decoupled streaming
│   ├── contract.ts                # PDFKit in-memory buffer generation, bilingual clauses
│   ├── rental.service.ts          # Rental lifecycle, due date schedules, booking
│   └── recommendation.service.ts  # SAW multi-criteria scoring, interaction adaptation
├── repositories/
│   ├── contracts.repository.ts    # Contract DB operations
│   ├── rentals.repository.ts      # Rental DB queries & state mutations
│   └── properties.repository.ts   # Property DB queries
└── uploads/                       # ZERO RUNTIME DISK WRITES (in-memory streaming only)

frontend/src/
├── components/
│   ├── KosCard.tsx                # Property card with badges (Water Tank, Wi-Fi, Featured)
│   ├── BookingModal.tsx           # Booking & contract modal
│   └── ContractSigningView.tsx    # KYC & HTML5 canvas signature
├── pages/
│   ├── TenantDashboard/           # Tenant active lease, "Bayar Sewa Bulan Berikutnya"
│   ├── LandlordDashboard/         # Landlord occupancy analytics, billing reminders
│   └── LandingPage.tsx            # Search, filter, recommended properties
└── types/                         # TypeScript domain contracts
```
