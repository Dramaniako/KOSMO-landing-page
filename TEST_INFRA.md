# E2E Test Infra: KOSMO Digital Rental Agreement Pipeline

## Test Philosophy
- Opaque-box, requirement-driven. Direct verification of user workflows and statutory compliance.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory Mapping
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Non-destructive DB Schema | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | In-memory PDF Buffer & SHA-256 | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 3 | Cloudinary Raw Direct Streaming | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | Bilingual Terms & Utility Quotas | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Preview Contract API | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 6 | Transactional Signing & 409 Lock | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 7 | RBAC Contract Download API | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 8 | Scroll-to-Read Clickwrap UI | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 9 | HTML5 Canvas Signature Pad | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 10 | 16-digit NIK / Passport Validation | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 11 | Gated Checkout Flow | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 12 | Dashboard Contract Actions (FileText) | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |

## Test Architecture
- **Unit & Integration Test Runner**: Node.js built-in test runner (`tests/contract.test.ts`, `tests/db_integration.test.ts`, `tests/router.test.ts`)
- **Frontend Component Runner**: Vitest + React Testing Library (`frontend/src/components/__tests__/BookingModal.test.tsx`)
- **E2E Browser Runner**: Playwright (`tests/e2e/rental_flow.spec.ts`)
- **Deterministic Master Verification**: `scripts/verify.ps1` (Gates 1-5)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Standard Tenant Happy Path Booking: Search -> Modal -> Scroll Terms -> Draw Signature -> Enter NIK -> Sign Contract -> Midtrans Checkout -> Contract Stored | F1-F12 | High |
| 2 | Concurrent Tenancy Conflict: Two parallel signing requests for same tenant -> 1st succeeds, 2nd gets HTTP 409 Conflict | F1, F6, F7 | High |
| 3 | Unauthorized Contract Access Attempt: Non-party user attempts to download contract -> HTTP 403 Forbidden | F7 | Medium |
| 4 | Missing/Incomplete Audit Data Rejection: Missing consent or invalid 15-digit NIK -> HTTP 400 Bad Request | F6, F10 | Medium |
| 5 | Landlord & Tenant Dashboard Verification: Both parties view & download verified signed contract with FileText icons | F7, F12 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature (isolation happy paths)
- Tier 2: ≥5 per feature (boundaries, invalid NIKs, empty buffers, null values)
- Tier 3: Pairwise coverage of major feature interactions
- Tier 4: ≥5 realistic end-to-end application scenarios
