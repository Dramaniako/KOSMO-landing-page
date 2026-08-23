# KOSMO Production Hardening & Bug Fix Master Backlog

Master backlog of engineering tickets generated from the technical audit report.

---

## Ticket Overview & Status

### Phase 1: Critical Security & Payment Risks (P0)
- [x] `TICKET-P0-001`: Payment Verification Bypass & Unbacked Landlord Balance Inflation (`backend/router.ts`, `frontend/src/pages/LandingPage.tsx`)
- [x] `TICKET-P0-002`: Broken Object-Level Authorization & Balance Drain in `/api/withdraw` (`backend/router.ts`)
- [x] `TICKET-P0-003`: Unauthenticated Administrative User Management Endpoints & Data Exposure (`backend/router.ts`)
- [x] `TICKET-P0-004`: Cryptographic Timing Attack & Placeholder Secret Fallback in Midtrans Webhook (`backend/router.ts`)
- [x] `TICKET-P0-005`: Hardcoded Insecure Fallback JWT Secret & Missing Algorithm Pinning (`backend/middleware/auth.ts`)
- [x] `TICKET-P0-006`: Unprotected Rental Contract PDF Access (PII Leak) & Rental Access Authorization (`backend/router.ts`)
- [x] `TICKET-P0-007`: IDOR in Property Updates & Cascading Tenant Eviction (`backend/router.ts`)
- [x] `TICKET-P0-008`: Standalone Node Server Refuses to Bind Port in Production Mode (`backend/server.ts`)

### Phase 2: Transactions, State Machines & Concurrency (P1)
- [x] `TICKET-P1-001`: Webhook vs Client Duplicate Key Crash (`ER_DUP_ENTRY`) & Idempotency (`backend/router.ts`)
- [x] `TICKET-P1-002`: Room Overbooking Concurrency Window (`occupiedRooms > totalRooms`) with `SELECT ... FOR UPDATE` (`backend/router.ts`)
- [x] `TICKET-P1-003`: Schema Definition Gap: Missing `'completed'` Status in Schema ENUM (`backend/db.ts`)
- [x] `TICKET-P1-004`: Negative Room Occupancy Drift on Terminating Inactive Leases (`backend/router.ts`)
- [x] `TICKET-P1-005`: Premature Financial Balance Inflation (`totalWithdrawn`) on Pending Withdrawals (`backend/router.ts`)
- [x] `TICKET-P1-006`: Unauthenticated Password Verification Oracle (`POST /api/auth/verify-password` in `backend/router.ts`)
- [x] `TICKET-P1-007`: Month-End Lease Anniversary Mutation Drift (Jan 31 -> Mar 3) & Due Status Order (`backend/router.ts`, `frontend/src/pages/TenantDashboard.tsx`)
- [x] `TICKET-P1-008`: Missing Cache Invalidation on Tenancy Lifecycle Events (`backend/router.ts`)

### Phase 3: UX Friction, Churn Bottlenecks & Client Flaws (P2)
- [x] `TICKET-P2-001`: SearchFilterBar Dual-Budget Reset Trap (Empty Catalog on Clear) (`frontend/src/components/SearchFilterBar.tsx`, `frontend/src/pages/LandingPage.tsx`)
- [x] `TICKET-P2-002`: Cumulative Layout Shift (CLS) on Mobile in KosCard vs Skeleton & Image `onError` Loop (`frontend/src/components/KosCard.tsx`, `frontend/src/components/KosCardSkeleton.tsx`)
- [x] `TICKET-P2-003`: Flash of Unstyled Content (FOUC) on Dark Mode Reloads (`frontend/index.html`, `frontend/src/context/ThemeContext.tsx`)
- [x] `TICKET-P2-004`: Hardcoded Inline Backgrounds Breaking Dark Mode Across Dashboards (`frontend/src/pages/TenantDashboard.tsx`, `frontend/src/pages/LandlordDashboard.tsx`, `frontend/src/pages/AdminDashboard.tsx`, `frontend/src/components/KosCard.tsx`)
- [x] `TICKET-P2-005`: Missing Zod Validation Schemas on State-Changing Endpoints (`backend/middleware/validation.ts`, `backend/router.ts`)

### Phase 4: Architectural Debt & Verification Gaps (P3)
- [x] `TICKET-P3-001`: Serverless Ephemeral PDF Storage & Static Route Parity (`backend/services/contract.ts`, `vercel.json`)
- [x] `TICKET-P3-002`: Database Pool Limit Override & Serverless Connection Tuning (`backend/db.ts`)
- [x] `TICKET-P3-003`: Verification Pipeline Gaps & Strict Type Checking (`scripts/verify.sh`, `tsconfig.json`)
- [x] `TICKET-P3-004`: Cloudinary Mock Fallback Guard & Test Isolation (`backend/services/cloudinary.ts`)
