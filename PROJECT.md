# Project: KOSMO Full-Stack Architecture Refactoring & Modularization

## Architecture
Comprehensive architectural decomposition and modularization of the KOSMO full-stack platform, separating concerns between routing, controller business logic, presentational UI, and state management hooks while strictly preserving all existing API contracts, database transaction concurrency invariants, and automated test gates.

### 1. Backend Modular Router Architecture
- **Central Router Facade (`backend/router.ts`)**: Streamlined root router (~70 lines) mounting domain routes and re-exporting all public contracts, rate limiters, auth utilities, and payment helpers.
- **Route Registration Pattern**: Domain modules export `register<Domain>Routes(router: Router): void` ensuring flat registration on `router.stack` to preserve exact reflection compatibility with `tests/router.test.ts`.
- **Domain Route Modules (`backend/routes/*.routes.ts`)**:
  - `system.routes.ts`: `/health`, `/upload` (~120 lines)
  - `auth.routes.ts`: `/auth/login`, `/auth/register`, `/auth/me`, `/users/profile/:id`, `/auth/profile`, `/auth/verify-password`, `formatSafeUser` (~320 lines)
  - `users.routes.ts`: `/users`, `/admin/users`, `/users/:id` CRUD (~150 lines)
  - `properties.routes.ts`: `/properties`, `/properties/:id` CRUD with TTL caching and transaction locks (~320 lines)
  - `reviews.routes.ts`: `/reviews`, `/reviews/:id` CRUD with rating recalculation transactions (~210 lines)
  - `landlord.routes.ts`: `/stats`, `/landlord/stats`, `/landlord/financials`, `/withdrawals`, `/withdraw`, `/admin/withdrawals/*` (~380 lines)
  - `tracking.routes.ts`: `/tracking/visit`, `/admin/stats`, `/admin/tracking-history`, Excel report generators (~310 lines)
  - `contracts.routes.ts`: `/rentals/contract/preview`, `/rentals/contract/sign`, `/rentals/:id/contract` (~440 lines)
  - `rentals.routes.ts`: `/rentals`, `/tenant/rentals`, `/rentals/:id/terminate`, `computePaymentSchedule` (~390 lines)
  - `payment.routes.ts`: `/payment/token`, `/payment/webhook`, `/payment/notification`, `/payment/finish`, `settleRentalPayment` (~390 lines)
- **Shared Utilities (`backend/utils/id.ts`)**: Cryptographically secure ID generator (`generateId(prefix)`).
- **Concurrency & Transaction Invariants**: 13 transactional blocks with `SELECT ... FOR UPDATE` row locks preserved identically.

### 2. Frontend Modular Component Architecture
- **Facade Orchestrators**: Root files remain as clean coordinators (<250 lines each), preserving public export contracts (including `export interface Props` in `BookingModal.tsx`):
  - `LandlordDashboard.tsx` (~180 lines facade)
  - `AdminDashboard.tsx` (~220 lines facade)
  - `TenantDashboard.tsx` (~250 lines facade)
  - `BookingModal.tsx` (~200 lines facade)
- **Subcomponent & Hook Modularization**:
  - `LandlordDashboard/components/` (9 subcomponents) & `hooks/` (5 custom hooks)
  - `AdminDashboard/components/` (11 subcomponents, including SVG `VisitorChart`) & `hooks/` (5 custom hooks)
  - `TenantDashboard/components/` (13 subcomponents) & `hooks/` (6 custom hooks)
  - `BookingModal/components/` (5 subcomponents) & `hooks/` (4 custom hooks)

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Central Router Re-Export Facade | Streamlined `backend/router.ts` maintaining all 19 public exports and type contracts | M1 | Survey Backend |
| 2 | System & Upload Domain Router | `backend/routes/system.routes.ts` handling health checks and Cloudinary image upload streaming | M1 | Survey Backend |
| 3 | Auth & Profile Domain Router | `backend/routes/auth.routes.ts` handling auth, KYC completeness checks, and password verification | M1 | Survey Backend |
| 4 | Admin User Management Router | `backend/routes/users.routes.ts` handling user CRUD, password confirmation, role enforcement | M1 | Survey Backend |
| 5 | Property CRUD & Caching Router | `backend/routes/properties.routes.ts` handling property listings, caching, and transactional edits | M1 | Survey Backend |
| 6 | Review CRUD & Rating Recalculation Router | `backend/routes/reviews.routes.ts` handling review lifecycle and atomic rating updates | M1 | Survey Backend |
| 7 | Landlord Financials & Withdrawal Router | `backend/routes/landlord.routes.ts` handling revenue aggregation and balance row-locks | M1 | Survey Backend |
| 8 | Visitor Tracking & Excel Reporting Router | `backend/routes/tracking.routes.ts` handling visitor metrics, admin stats, and multi-sheet Excel reports | M1 | Survey Backend |
| 9 | Legal Contract & E-Signing Router | `backend/routes/contracts.routes.ts` handling digital contract preview, signing, and PDF streaming | M1 | Survey Backend |
| 10 | Tenancy Lifecycle & Schedule Router | `backend/routes/rentals.routes.ts` handling rental queries, termination, and payment schedules | M1 | Survey Backend |
| 11 | Payment Settlement & Webhook Router | `backend/routes/payment.routes.ts` handling Midtrans Snap tokens, signature verification, settlement | M1 | Survey Backend |
| 12 | Cryptographic ID Generator Utility | `backend/utils/id.ts` providing secure random ID generation across domains | M1 | Survey Backend |
| 13 | Landlord Dashboard Modularization | Decompose `LandlordDashboard.tsx` into 9 subcomponents, 5 hooks, and clean facade | M2 | Survey Frontend |
| 14 | Admin Dashboard Modularization | Decompose `AdminDashboard.tsx` into 11 subcomponents (including SVG chart), 5 hooks, and clean facade | M2 | Survey Frontend |
| 15 | Tenant Dashboard Modularization | Decompose `TenantDashboard.tsx` into 13 subcomponents, 6 hooks, and clean facade | M2 | Survey Frontend |
| 16 | Booking Modal Modularization | Decompose `BookingModal.tsx` into 5 subcomponents, 4 hooks, and clean facade (preserving `Props` export) | M2 | Survey Frontend |
| 17 | Strict TypeScript Zero-Any Audit | Eliminate any implicit/explicit `any`, remove dead imports, enforce zero compiler suppressions | M3 | ORIGINAL_REQUEST §R3 |
| 18 | Verification Pipeline Execution | Verify all 7 gates: tsc, frontend type-check, builds, backend tests (204), vitest (65), playwright (11), verify.ps1 | M4 | ORIGINAL_REQUEST §Acceptance |
| 19 | Challenger Adversarial Hardening | Concurrency stress testing, RBAC boundary validation, and router reflection audit | M4 | Verification Survey |
| 20 | Forensic Integrity Audit | Systematic check for authentic implementations without mock shortcuts or bypasses | M4 | Verification Survey |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Survey & Architectural Mapping | Codebase survey, endpoint mapping, component sizing, test cataloging | none | DONE |
| M1 | Backend Router Domain Modularization | `backend/routes/*.routes.ts`, `backend/utils/id.ts`, `backend/router.ts` | M0 | DONE |
| M2 | Frontend Mega-Component Modularization | `LandlordDashboard/`, `AdminDashboard/`, `TenantDashboard/`, `BookingModal/` | M0 | DONE |
| M3 | Type Safety, Clean Interfaces & Dead Code Removal | Zero-any enforcement, type unification, dead code cleanup across stack | M1, M2 | DONE |
| M4 | Full-Stack Verification & Adversarial Gating | 7 verification gates, Challenger stress tests, Forensic Auditor verdict | M1, M2, M3 | DONE |

---

## Interface Contracts

### 1. Route Registration Contract
```typescript
import type { Router } from 'express';

export function registerSystemRoutes(router: Router): void;
export function registerAuthRoutes(router: Router): void;
export function registerUserRoutes(router: Router): void;
export function registerPropertyRoutes(router: Router): void;
export function registerReviewRoutes(router: Router): void;
export function registerLandlordRoutes(router: Router): void;
export function registerTrackingRoutes(router: Router): void;
export function registerContractRoutes(router: Router): void;
export function registerRentalRoutes(router: Router): void;
export function registerPaymentRoutes(router: Router): void;
```

### 2. Central Router Public Re-Exports (`backend/router.ts`)
```typescript
export {
  generateJwtToken,
  verifyJwtToken,
  authenticateToken,
  requireRole
} from './middleware/auth';
export type { JWTPayload, AuthenticatedRequest } from './middleware/auth';

export {
  authLimiter,
  uploadLimiter,
  trackingLimiter,
  ALLOWED_IMAGE_MIMETYPES,
  validateImageMimeType,
  formatSafeUser,
  PaymentSchedule,
  computePaymentSchedule,
  isMidtransConfigured,
  snap,
  verifyMidtransSignature,
  settleRentalPayment
};
```

### 3. Frontend BookingModal Contract (`frontend/src/components/BookingModal.tsx`)
```typescript
export interface Props {
  property: Property | null;
  showContract: boolean;
  setShowContract: (show: boolean) => void;
  contractSigned: boolean;
  handleSignContract?: () => void;
  onSignContract?: (payload: ContractSignPayload) => Promise<boolean>;
  signedContractData?: SignedContractData | null;
  isSigning?: boolean;
  showPayment: boolean;
  setShowPayment: (show: boolean) => void;
  paymentProcessing: boolean;
  handleProcessPayment: () => void;
  showMap: boolean;
  setShowMap: (show: boolean) => void;
  onClose: () => void;
  currentUser: User | null;
  onNavigateToLogin: () => void;
  renderFacilityIcon: (fac: string) => React.ReactNode;
  hasActiveRental?: boolean;
  activeRentalError?: string | null;
}
export default function BookingModal(props: Props): React.ReactElement | null;
```

---

## Code Layout
- `backend/router.ts`: Root Express router (<70 lines) mounting domain registration functions and re-exporting public contracts
- `backend/utils/id.ts`: `generateId(prefix)`
- `backend/routes/system.routes.ts`: Health and upload routes
- `backend/routes/auth.routes.ts`: Authentication and user profile routes
- `backend/routes/users.routes.ts`: Admin user management routes
- `backend/routes/properties.routes.ts`: Property listings, detail, CRUD, and caching
- `backend/routes/reviews.routes.ts`: Review CRUD and average rating recalculations
- `backend/routes/landlord.routes.ts`: Landlord stats, revenue, bank accounts, and withdrawals
- `backend/routes/tracking.routes.ts`: Visitor tracking, admin dashboard metrics, and Excel generators
- `backend/routes/contracts.routes.ts`: In-memory PDF preview, signing, and contract download streaming
- `backend/routes/rentals.routes.ts`: Rental lifecycle, payment schedule calculation, and lease termination
- `backend/routes/payment.routes.ts`: Midtrans Snap tokens, signature verification, webhooks, settlement
- `frontend/src/pages/LandlordDashboard.tsx`: Landlord dashboard facade (<200 lines)
- `frontend/src/pages/LandlordDashboard/components/`: Subcomponents (9 files)
- `frontend/src/pages/LandlordDashboard/hooks/`: Custom hooks (5 files)
- `frontend/src/pages/AdminDashboard.tsx`: Admin dashboard facade (<250 lines)
- `frontend/src/pages/AdminDashboard/components/`: Subcomponents (11 files, including VisitorChart)
- `frontend/src/pages/AdminDashboard/hooks/`: Custom hooks (5 files)
- `frontend/src/pages/TenantDashboard.tsx`: Tenant dashboard facade (<250 lines)
- `frontend/src/pages/TenantDashboard/components/`: Subcomponents (13 files)
- `frontend/src/pages/TenantDashboard/hooks/`: Custom hooks (6 files)
- `frontend/src/components/BookingModal.tsx`: Booking modal facade (<250 lines, exports Props)
- `frontend/src/components/BookingModal/components/`: Subcomponents (5 files)
- `frontend/src/components/BookingModal/hooks/`: Custom hooks (4 files)
