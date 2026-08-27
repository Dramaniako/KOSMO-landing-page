# Project: KOSMO Digital Rental Agreement Pipeline

## Architecture
The KOSMO Digital Rental Agreement Pipeline provides an end-to-end legally binding, audit-trailed electronic contract system for Bali co-living rentals, fully compliant with Indonesian Civil Code (KUHPerdata Art. 1320) and UU ITE No. 11/2008 jo. UU No. 1/2024.

### System Architecture Overview
- **Database (MySQL / TiDB)**: `rentals` table extended with 8 non-destructive audit and cryptographic columns (`contract_url`, `contract_hash`, `contract_signed_at`, `signer_ip`, `signer_user_agent`, `tenant_nik_passport`, `tenant_signature_data`, `admin_fee_amount`).
- **In-Memory PDF Generation**: PDFKit streams PDF binary buffers entirely in memory (RAM). Computes SHA-256 cryptographic digest over the buffer.
- **Cloud Storage Streaming**: In-memory PDF buffer is piped directly to Cloudinary (`uploadContractStream` to `kosmo_contracts/` folder with `resource_type: 'raw'` / `auto`) with zero local disk file writes (`backend/uploads/` untouched).
- **Backend API & Concurrency Guards**: 
  - `POST /api/rentals/contract/preview`: Generates draft contract metadata and in-memory PDF preview without creating tenancy.
  - `POST /api/rentals/contract/sign`: Atomic transactional signing using `SELECT ... FOR UPDATE` row locks, enforcing Single Active Tenancy covenant (returns HTTP 409 Conflict on duplicate active lease).
  - `GET /api/rentals/:id/contract`: Role-based access control (RBAC) permitting only the tenant, property landlord, or admin.
- **Frontend Evidentiary UI**:
  - `BookingModal.tsx`: Scroll-to-read clickwrap container (checkbox disabled until scrolled to bottom), HTML5 Canvas digital signature pad (draw/clear/confirm to PNG Base64), 16-digit NIK / Passport input validation, full bilingual terms, flat Rp 5,000 admin fee, utility quotas (electricity token, PDAM water, 100 Mbps WiFi, security, waste), and Pengadilan Negeri Denpasar / Badung jurisdiction.
  - `LandingPage.tsx`: Midtrans Snap payment token generation gated strictly behind signed contract state.
  - `TenantDashboard.tsx` & `LandlordDashboard.tsx`: Authenticated contract view/download handlers with Lucide `FileText` icons.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Non-Destructive Database Schema | Idempotent `ALTER TABLE rentals ADD COLUMN IF NOT EXISTS ...` adding 8 audit/contract columns | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Migration Auto-Execution Fix | Fix `initDb()` in `backend/db.ts` to ensure table migrations always run on existing tables | M1 | survey |
| 3 | In-Memory PDF Generator | High-fidelity bilingual (ID/EN) lease agreement via PDFKit streamed in-memory (`Buffer`) | M2 | ORIGINAL_REQUEST §R2 |
| 4 | SHA-256 Checksum Calculation | Cryptographic SHA-256 digest computed on generated PDF buffer and embedded in DB | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Cloudinary Direct Buffer Streaming | Direct buffer stream upload to Cloudinary `kosmo_contracts/` without writing to local disk | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Statutory Contract Clauses | Statutory terms: party IDs, Bali address, utility quotas, Rp 5.000 fee, single tenancy, Denpasar/Badung jurisdiction | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Contract Preview Endpoint | `POST /api/rentals/contract/preview` generates preview data without persisting tenancy | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Transactional Signing Endpoint | `POST /api/rentals/contract/sign` with `SELECT ... FOR UPDATE` and HTTP 409 Single Tenancy guard | M3 | ORIGINAL_REQUEST §R3 |
| 9 | Audit Trail Capture | Records remote IP (`req.ip`/`x-forwarded-for`), User-Agent, UTC & WITA timestamps, user claims | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Contract Access RBAC | `GET /api/rentals/:id/contract` strictly allowing tenant, landlord, or admin access | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Strict Zod & Type Validation | Zod request schemas and TypeScript interfaces with zero `any` | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Scroll-to-Read Clickwrap | Affirmative consent checkbox disabled until user scrolls contract terms container to bottom | M4 | ORIGINAL_REQUEST §R4 |
| 13 | HTML5 Canvas Signature Pad | Interactive canvas drawing with clear and confirm capabilities, exporting PNG Base64 | M4 | ORIGINAL_REQUEST §R4 |
| 14 | NIK / Passport Input Validation | Real-time validation for 16-digit numeric NIK or valid international passport format | M4 | ORIGINAL_REQUEST §R4 |
| 15 | Gated Checkout Flow | Midtrans Snap payment token generation in `LandingPage.tsx` gated behind signed contract | M4 | ORIGINAL_REQUEST §R4 |
| 16 | Dashboard FileText Actions | `TenantDashboard.tsx` & `LandlordDashboard.tsx` authenticated contract view/download with `FileText` icons | M4 | ORIGINAL_REQUEST §R4 |
| 17 | E2E & Automated Test Suite | Unit tests (`tests/contract.test.ts`), DB tests (`tests/db_integration.test.ts`), Vitest (`BookingModal.test.tsx`), E2E Playwright (`rental_flow.spec.ts`), all 5 gates in `scripts/verify.ps1` passing | M5 | ORIGINAL_REQUEST §Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | R1: Database Schema & Migrations | `backend/db.ts`, `backend/types/index.ts` | None | DONE |
| M2 | R2: In-Memory PDF & Cloudinary Streaming | `backend/services/contract.ts`, `backend/services/cloudinary.ts` | M1 | DONE |
| M3 | R3: Backend Endpoints, Audit & Concurrency | `backend/router.ts`, `backend/types/index.ts`, `backend/middleware/validation.ts` | M1, M2 | DONE |
| M4 | R4: Frontend Evidentiary UI & Dashboards | `frontend/src/components/BookingModal.tsx`, `frontend/src/pages/LandingPage.tsx`, `frontend/src/pages/TenantDashboard.tsx`, `frontend/src/pages/LandlordDashboard.tsx`, `frontend/src/types/index.ts`, `frontend/src/contexts/LanguageContext.tsx` | M2, M3 | DONE |
| M5 | E2E Testing & Verification Gates | `tests/contract.test.ts`, `tests/db_integration.test.ts`, `tests/router.test.ts`, `frontend/src/components/__tests__/BookingModal.test.tsx`, `tests/e2e/rental_flow.spec.ts`, `scripts/verify.ps1` | M1, M2, M3, M4 | DONE |

---

## Interface Contracts

### 1. Database Schema (`rentals` table columns)
```sql
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_url VARCHAR(500);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_hash VARCHAR(64);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_signed_at DATETIME;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS signer_ip VARCHAR(50);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS signer_user_agent VARCHAR(255);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS tenant_nik_passport VARCHAR(50);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS tenant_signature_data LONGTEXT;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS admin_fee_amount DECIMAL(10,2) DEFAULT 5000.00;
```

### 2. Contract Service Interface (`backend/services/contract.ts`)
```ts
export interface RentalContractData {
  rentalId?: string;
  propertyName: string;
  propertyAddress: string;
  landlordName: string;
  landlordEmail?: string;
  landlordPhone?: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  tenantNikPassport: string;
  startDate: string;
  durationMonths: number;
  monthlyPrice: number;
  totalPrice: number;
  adminFee: number; // Flat 5000
  signatureBase64?: string;
  signerIp?: string;
  signerUserAgent?: string;
  signedAt?: string;
  utilityQuotas?: {
    electricityKwh?: number | string;
    water?: string;
    wifiMbps?: number | string;
    security?: string;
    waste?: string;
  };
}

export interface GeneratedContractResult {
  pdfBuffer: Buffer;
  contractHash: string; // SHA-256
  cloudinaryUrl?: string;
}

export function generateRentalContractBuffer(data: RentalContractData): Promise<Buffer>;
export function computeContractHash(buffer: Buffer): string;
export function generateAndUploadContract(data: RentalContractData): Promise<GeneratedContractResult>;
```

### 3. Cloudinary Streaming Interface (`backend/services/cloudinary.ts`)
```ts
export function uploadContractStream(
  buffer: Buffer,
  filename: string,
  folder?: string
): Promise<{ secure_url: string; public_id: string }>;
```

### 4. REST Endpoints (`backend/router.ts`)
- **`POST /api/rentals/contract/preview`**
  - Input: `{ propertyId: string, durationMonths: number, startDate?: string, tenantNikPassport?: string, signatureBase64?: string }` (Auth required)
  - Output: `{ success: true, contractData: RentalContractData, contractHash: string, previewUrl?: string }`
- **`POST /api/rentals/contract/sign`**
  - Input: `{ propertyId: string, durationMonths: number, startDate: string, tenantNikPassport: string, signatureBase64: string, affirmativeConsent: boolean }` (Auth required)
  - Output: `{ success: true, rentalId: string, contractUrl: string, contractHash: string, adminFee: number, totalAmount: number }`
  - Error: HTTP 409 Conflict if tenant already has active rental or property unavailable.
- **`GET /api/rentals/:id/contract`**
  - Auth required. RBAC: Caller must be rental tenant, property landlord/owner, or admin.
  - Output: Streams PDF buffer with headers (`Content-Type: application/pdf`, `Content-Disposition: inline; filename="kontrak_sewa_<id>.pdf"`, `X-Contract-Hash: <hash>`).

---

## Code Layout
- `backend/db.ts`: Database pool, schema definition, and `applyTableMigrations()`
- `backend/services/contract.ts`: In-memory PDF generator, bilingual statutory clauses, SHA-256 hash
- `backend/services/cloudinary.ts`: Direct buffer upload stream for raw PDF contracts
- `backend/router.ts`: Express router with `/contract/preview`, `/contract/sign`, `/contract` endpoints
- `backend/types/index.ts`: Strict TypeScript interfaces
- `backend/middleware/validation.ts`: Zod validation middleware
- `frontend/src/components/BookingModal.tsx`: Clickwrap scroll-to-read, canvas signature pad, NIK validation
- `frontend/src/pages/LandingPage.tsx`: Midtrans Snap gated booking payment flow
- `frontend/src/pages/TenantDashboard.tsx`: Authenticated contract view/download with FileText icon
- `frontend/src/pages/LandlordDashboard.tsx`: Authenticated contract view/download with FileText icon
- `frontend/src/types/index.ts`: Frontend TypeScript interfaces
- `tests/contract.test.ts`: PDF generation & hash unit tests
- `tests/db_integration.test.ts`: DB transactional signing & concurrency tests
- `frontend/src/components/__tests__/BookingModal.test.tsx`: Vitest component tests
- `tests/e2e/rental_flow.spec.ts`: Playwright E2E full agreement flow tests
- `scripts/verify.ps1`: 5-gate project verification script
