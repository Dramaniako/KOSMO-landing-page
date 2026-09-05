# Project: KOSMO Discrete Room Inventory & Multi-Photo Gallery System

## Architecture
- **Backend Architecture**: Node.js, Express, TypeScript (`backend/`). Modular domain routes in `backend/routes/` mounted through central router (`backend/routes/index.ts`). Database access via `mysql2/promise` connection pooling in `backend/db.ts`.
- **Database Schema**: MySQL/InnoDB with ACID transaction isolation. Domain tables: `properties`, `rooms` (discrete room entities), `property_photos` (multi-photo gallery with categorized perspectives), `rentals` (extended with `roomId`), `users`, `property_facilities`, `reviews`, `withdrawals`.
- **Concurrency & Locking Model**: Row-level locking via `SELECT ... FROM rooms WHERE id = ? AND propertyId = ? FOR UPDATE` following strict hierarchical lock order (`users` -> `properties` -> `rooms`) to serialize concurrent booking requests and eliminate deadlocks.
- **Frontend Architecture**: React 19, TypeScript, Vite, Tailwind CSS, Lucide React (`frontend/src/`). Modular components in `components/`, subcomponents in `BookingModal/`, `TenantDashboard/`, `LandlordDashboard/`.
- **Testing & Verification Pipeline**: 5-gate deterministic pipeline enforced by `./scripts/verify.sh` and `./scripts/verify.ps1`:
  1. Backend TypeScript check (`npx tsc --noEmit`)
  2. Frontend & Backend builds (`npm --prefix frontend run build && npm run build:backend`)
  3. Backend test suite (`npm test`)
  4. Frontend Vitest suite (`npm --prefix frontend test -- --run`)
  5. Playwright E2E browser suite (`npx playwright test`)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Baseline Compilation Fix | Fix missing `document` property on `rawPropertyRow` in `scripts/benchmark_all_functions.ts` to unblock Gate 1 | M1 | Survey 3 |
| 2 | Discrete Room Data Model | Create `rooms` table (`id`, `propertyId`, `roomNumber`, `floor`, `type`, `price`, `status`, timestamps, unique key on property+roomNumber) | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Multi-Photo Gallery Data Model | Create `property_photos` table (`id`, `propertyId`, `roomId`, `url`, `publicId`, `category`, `caption`, `orderIndex`, timestamps) | M1 | ORIGINAL_REQUEST §R3 |
| 4 | Rental Schema Extension | Add `roomId VARCHAR(50)` and index `idx_rentals_room` to `rentals` table | M1 | ORIGINAL_REQUEST §R2 |
| 5 | Idempotent Auto-Backfill | `backfillDiscreteRooms()` seeds discrete rooms (101, 102...) for existing properties with `totalRooms > 0`, setting first `occupiedRooms` to 'occupied' and remainder to 'available', links active rentals | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Room Count Parity Sync | `syncPropertyRoomCounts(executor, propertyId)` atomically recalculates and updates `properties.totalRooms` and `properties.occupiedRooms` from `rooms` table | M1 | ORIGINAL_REQUEST §R1 |
| 7 | Discrete Rooms API Endpoints | `GET /api/properties/:id/rooms`, `POST /api/properties/:id/rooms`, `PUT /api/properties/:id/rooms/:roomId`, `PATCH /api/properties/:id/rooms/:roomId/status`, `DELETE /api/properties/:id/rooms/:roomId` | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Room-Level Selection & Binding | Booking and contract signing require and record valid `roomId` in `rentals`; backward compatible auto-assignment if omitted | M2 | ORIGINAL_REQUEST §R2 |
| 9 | ACID Concurrency Guard | `SELECT ... FROM rooms WHERE id = ? FOR UPDATE` prevents double-booking; returns HTTP 409 Conflict for competing requests | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Rental Lifecycle Room Release | Rental termination or cancellation atomically frees assigned room back to 'available' and recalculates occupancy | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Multi-Photo Gallery API | `GET /api/properties/:id/photos`, `POST /api/properties/:id/photos`, `PUT /api/properties/:id/photos/reorder`, `DELETE /api/properties/:id/photos/:photoId` with Cloudinary streaming | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Categorized Perspectives | Support categories: `thumbnail`, `bedroom`, `bathroom`, `kitchen`, `pool`, `living_room`, `wifi_speedtest`, `exterior`, `other` | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Interactive Photo Gallery UI | `PropertyPhotoGallery.tsx` in `BookingModal`: category filter tabs, carousel navigation, thumbnail strip, fullscreen lightbox | M4 | ORIGINAL_REQUEST §R3, §R4 |
| 14 | Room Selection Grid UI | `RoomSelectionGrid.tsx` in `BookingModal`: floor tabs, status badges, price override tags, selection state, gating "Sewa Sekarang" | M4 | ORIGINAL_REQUEST §R2, §R4 |
| 15 | Tenant Room Details UI | Render assigned room number, floor, and room specs in `TenantDashboard` (`ActiveRentalSection`, `RentalHistorySection`) | M4 | ORIGINAL_REQUEST §R4 |
| 16 | Landlord Room Inventory UI | `RoomInventoryModal.tsx` in `LandlordDashboard`: manage discrete rooms, toggle status (available <-> maintenance), add/edit rooms | M4 | ORIGINAL_REQUEST §R4 |
| 17 | Landlord Photo Gallery Manager UI | `PhotoGalleryManager.tsx` in `LandlordDashboard`: upload multiple categorized photos, set cover photo, reorder, delete | M4 | ORIGINAL_REQUEST §R3, §R4 |
| 18 | E2E Testing Suite (Tiers 1-4) | Opaque-box requirement-driven E2E tests: Tier 1 (Feature), Tier 2 (Boundary), Tier 3 (Cross-Feature), Tier 4 (Workloads) | E2E Track | Dual Track Mandate |
| 19 | 100% E2E Pass & Tier 5 Hardening | Pass 100% E2E test suite followed by white-box adversarial coverage hardening and full `./scripts/verify.sh` pass | M5 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven test suite (Tiers 1-4), harness, and `TEST_READY.md` publication | none | DONE |
| M1 | Database Schema & Auto-Backfill | `rooms` and `property_photos` tables, `rentals.roomId`, `backfillDiscreteRooms`, `syncPropertyRoomCounts`, baseline TS fix | none | DONE |
| M2 | Backend Room Inventory & Concurrency Guard | Discrete room endpoints, room-level booking, `SELECT ... FOR UPDATE` double-booking guard, lifecycle release | M1 | DONE |
| M3 | Multi-Photo Gallery API | Gallery photo CRUD endpoints, categorized perspectives validation, Cloudinary streaming, reordering | M1 | DONE |
| M4 | Frontend UI Workflows | `PropertyPhotoGallery`, `RoomSelectionGrid`, `BookingModal` wiring, `TenantDashboard` room details, `LandlordDashboard` management | M2, M3 | PLANNED |
| M5 | Final Milestone: 100% E2E Pass & Hardening | Verify all E2E test tiers pass, Tier 5 adversarial hardening, `./scripts/verify.sh` exit code 0 | M4, E2E | PLANNED |

## Interface Contracts

### Backend Database ↔ Services (`backend/db.ts`)
- `backfillDiscreteRooms(executor?: QueryExecutor): Promise<void>`: Idempotent backfill of discrete rooms and initial thumbnails.
- `syncPropertyRoomCounts(executor: QueryExecutor, propertyId: string): Promise<{ totalRooms: number; occupiedRooms: number }>`: Atomically synchronizes property aggregate counters.

### Backend Rooms API ↔ Frontend Client (`/api/properties/:id/rooms`)
- `GET /api/properties/:id/rooms?status=all|available|occupied|maintenance`: Returns `Room[]` with effective pricing and status.
- `POST /api/properties/:id/rooms`: Body `{ roomNumber: string, floor: number, type: string, price?: number, status?: RoomStatus }`. Returns `201 Created` with `Room`.
- `PUT /api/properties/:id/rooms/:roomId`: Body `{ roomNumber?: string, floor?: number, type?: string, price?: number, status?: RoomStatus }`. Returns `200 OK`.
- `PATCH /api/properties/:id/rooms/:roomId/status`: Body `{ status: 'available' | 'maintenance' }`. Returns `200 OK`.
- `DELETE /api/properties/:id/rooms/:roomId`: Returns `200 OK`. Rejects with `400` if room is occupied.

### Backend Photos API ↔ Frontend Client (`/api/properties/:id/photos`)
- `GET /api/properties/:id/photos?category=&roomId=`: Returns `PropertyPhoto[]` sorted by `orderIndex`.
- `POST /api/properties/:id/photos`: Multipart form data `images` (1-10 files), `category`, `roomId?`, `caption?`. Returns `201 Created` with uploaded `PropertyPhoto[]`.
- `PUT /api/properties/:id/photos/reorder`: Body `{ photoIds: string[] }`. Returns `200 OK`.
- `DELETE /api/properties/:id/photos/:photoId`: Returns `200 OK`.

### Concurrency Lock Contract (`backend/routes/contracts.routes.ts`, `backend/routes/payment.routes.ts`, `backend/routes/rentals.routes.ts`)
- Strict lock order: `SELECT ... FROM users WHERE id = ? FOR UPDATE` -> `SELECT ... FROM properties WHERE id = ? FOR UPDATE` -> `SELECT ... FROM rooms WHERE id = ? FOR UPDATE`.
- Competing concurrent transactions for same `roomId` will block until lock release; subsequent transaction sees `room.status === 'occupied'` and returns `HTTP 409 Conflict` `{ message: 'Kamar sudah terisi atau tidak tersedia.' }`.

## Code Layout
- `backend/db.ts`: Tables creation, migrations, seed, `backfillDiscreteRooms`, `syncPropertyRoomCounts`.
- `backend/types/index.ts`: `Room`, `DiscreteRoomStatus`, `PropertyPhoto`, `PhotoCategory`.
- `backend/routes/rooms.routes.ts`: Discrete rooms CRUD & status management.
- `backend/routes/photos.routes.ts`: Multi-photo gallery & categorized media management.
- `backend/routes/contracts.routes.ts`: `roomId` integration, contract signing concurrency lock.
- `backend/routes/payment.routes.ts`: Payment settlement, room status transition to 'occupied'.
- `backend/routes/rentals.routes.ts`: Rental creation, termination freeing room to 'available'.
- `frontend/src/types/index.ts`: Frontend domain interfaces.
- `frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx`: Interactive gallery.
- `frontend/src/components/BookingModal/components/RoomSelectionGrid.tsx`: Discrete room selection.
- `frontend/src/pages/TenantDashboard/components/ActiveRentalSection.tsx`: Room number badge.
- `frontend/src/pages/LandlordDashboard/components/RoomInventoryModal.tsx`: Landlord room inventory.
- `frontend/src/pages/LandlordDashboard/components/PhotoGalleryManager.tsx`: Landlord photo manager.
- `tests/rooms.test.ts`: Backend room schema, backfill, and API tests.
- `tests/gallery.test.ts`: Backend photo gallery API tests.
- `tests/room_concurrency.test.ts`: High-concurrency storm testing double-booking rejection.
