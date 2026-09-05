# E2E Test Infra: KOSMO Discrete Room Inventory & Multi-Photo Gallery System

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: Direct verification of user-facing workflows, contracts, and business invariants derived strictly from `ORIGINAL_REQUEST.md` (§Follow-up — 2026-09-04T10:52:01Z) and `PROJECT.md`.
- **Methodology**: 4-Tier Test Suite Architecture combining:
  1. **Category-Partitioning** (Tier 1: Feature Isolation Coverage)
  2. **Boundary Value Analysis (BVA)** (Tier 2: Edge & Corner Cases)
  3. **Pairwise Combinatorial Testing** (Tier 3: Cross-Feature Interactions)
  4. **Real-World Application Workloads** (Tier 4: Persona Journeys & Concurrency Battles)

---

## Feature Inventory Mapping
| # | Feature Domain | Source (Requirement) | Tier 1 Tests | Tier 2 Boundary | Tier 3 Pairwise | Tier 4 Workloads |
|---|----------------|----------------------|:------------:|:---------------:|:---------------:|:----------------:|
| 1 | Discrete Room Listing | ORIGINAL_REQUEST §R1, PROJECT §2 | 5 | 2 | 1 | 2 |
| 2 | Room Selection & Validation | ORIGINAL_REQUEST §R2, PROJECT §8 | 5 | 2 | 2 | 3 |
| 3 | Floor Navigation & Filtering | ORIGINAL_REQUEST §R1, PROJECT §14 | 5 | 1 | 1 | 2 |
| 4 | Interactive Photo Gallery Viewing | ORIGINAL_REQUEST §R3, PROJECT §13 | 5 | 1 | 1 | 2 |
| 5 | Photo Category Perspectives | ORIGINAL_REQUEST §R3, PROJECT §12 | 5 | 1 | 1 | 2 |
| 6 | Landlord Room Toggle & Management | ORIGINAL_REQUEST §R4, PROJECT §16 | 5 | 1 | 1 | 2 |
| 7 | Landlord Photo Upload & Reorder | ORIGINAL_REQUEST §R3, PROJECT §17 | 5 | 1 | 1 | 1 |

---

## 4-Tier Architecture Details

### Tier 1: Feature Coverage (Isolation Happy Paths)
Minimum 5 tests per feature covering representative happy-path inputs in isolation:
1. **Room Listing**:
   - T1-RL-01: Renders discrete rooms with identifiers, floor numbers, types, and base pricing.
   - T1-RL-02: Displays room availability status indicators (`available`, `occupied`, `maintenance`).
   - T1-RL-03: Displays customized price overrides distinct from base property price.
   - T1-RL-04: Displays multi-floor layouts (e.g. Floor 1, Floor 2, Floor 3).
   - T1-RL-05: Displays room capacity status and total count parity.
2. **Room Selection**:
   - T1-RS-01: Selecting an available room highlights room card and enables booking progression.
   - T1-RS-02: Occupied room card is rendered in disabled state and prevents selection.
   - T1-RS-03: Maintenance room card displays maintenance badge and blocks selection.
   - T1-RS-04: Switching selection between available rooms dynamically updates selected room state and price.
   - T1-RS-05: Selected room details persist through booking modal progression to contract step.
3. **Floor Navigation**:
   - T1-FN-01: Defaults to Floor 1 rooms on modal load.
   - T1-FN-02: Clicking Floor 2 tab switches room view to Floor 2 inventory.
   - T1-FN-03: Floor tabs display room availability badges per floor.
   - T1-FN-04: "Semua Lantai" (All Floors) tab displays full inventory across floors.
   - T1-FN-05: Floor switching maintains previously selected room state.
4. **Photo Gallery Viewing**:
   - T1-PG-01: Renders interactive hero image gallery with thumbnail filmstrip.
   - T1-PG-02: Previous and Next navigation arrows cycle through property photos.
   - T1-PG-03: Clicking a thumbnail switches active main view image.
   - T1-PG-04: Fullscreen lightbox opens upon clicking active photo and closes cleanly.
   - T1-PG-05: Displays active photo caption and category badge overlay.
5. **Category Filtering**:
   - T1-CF-01: "Semua" tab displays all property images across categories.
   - T1-CF-02: "Kamar Tidur" (Bedroom) tab filters to bedroom photos only.
   - T1-CF-03: "Kamar Mandi" (Bathroom) tab filters to bathroom photos only.
   - T1-CF-04: "Fasilitas Komunal" (Living / Pool / Kitchen) tab filters to amenities.
   - T1-CF-05: "WiFi Speedtest" tab displays verified bandwidth test screenshot.
6. **Landlord Room Toggle**:
   - T1-LT-01: Landlord toggles room status from `available` to `maintenance`.
   - T1-LT-02: Landlord toggles room status from `maintenance` back to `available`.
   - T1-LT-03: Room status change immediately updates landlord inventory table.
   - T1-LT-04: Landlord edits room details (price override, room type) and saves.
   - T1-LT-05: Landlord adds new discrete room with number, floor, and pricing.
7. **Photo Upload/Reorder**:
   - T1-PU-01: Landlord uploads new photo with category tag.
   - T1-PU-02: Landlord sets uploaded photo as primary cover thumbnail.
   - T1-PU-03: Landlord reorders photos and verifies updated display index.
   - T1-PU-04: Landlord deletes photo and verifies removal from gallery.
   - T1-PU-05: Landlord uploads batch photos with diverse category assignments.

### Tier 2: Boundary & Corner Cases (BVA)
1. **T2-BVA-01**: Empty room inventory (property with 0 rooms renders empty state and disables booking).
2. **T2-BVA-02**: Max rooms stress (50+ rooms render cleanly with smooth grid scrolling without UI break).
3. **T2-BVA-03**: Non-standard floor numbers (Ground floor / Basement / Floor 0, high floor Floor 10+).
4. **T2-BVA-04**: Booking the very last available room (transitions property available count to 0 and marks property "Penuh / Full").
5. **T2-BVA-05**: Concurrency lock battle: competing requests for same `roomId` return `HTTP 409 Conflict`.
6. **T2-BVA-06**: Photo gallery without photos (displays fallback cover placeholder gracefully).
7. **T2-BVA-07**: Invalid photo category payload handling (graceful fallback or validation rejection).
8. **T2-BVA-08**: Photo upload boundary limit (exceeding max photos limit triggers validation).

### Tier 3: Cross-Feature Combinations (Pairwise)
1. **T3-PW-01**: Room custom price override combined with multi-month lease calculation (room price * 12 months + admin fee).
2. **T3-PW-02**: Room status toggle to maintenance during active booking attempt (in-flight booking rejection).
3. **T3-PW-03**: Photo deletion when deleted photo was the primary cover thumbnail (promotes next photo).
4. **T3-PW-04**: Floor navigation while room on another floor is selected (preserves selection).
5. **T3-PW-05**: Category filter active in gallery while viewing room-specific photo subsets.

### Tier 4: Real-World Application Workloads
1. **T4-WL-01**: Complete Tenant Bali Kos Journey: Search -> District Filter -> Gallery inspection (bedroom, bathroom, pool, WiFi test) -> Select Room 102 (Floor 1) -> Sign Digital Contract -> Pay -> Tenant Dashboard displays Room 102 -> PDF Download.
2. **T4-WL-02**: Landlord Onboarding & Room Maintenance Workflow: Landlord adds 10 rooms -> Uploads 5 categorized photos -> Sets Room 105 to maintenance -> Public catalog reflects parity -> Booking modal disables Room 105.
3. **T4-WL-03**: Concurrent Booking Battle: Two tenants concurrently submit booking for Room 101 -> One succeeds, competing tenant receives HTTP 409 Conflict.
4. **T4-WL-04**: Tenancy Room Allocation & Release Lifecycle: Tenant books Room 201 -> Occupancy updates -> Rental terminated -> Room 201 returns to `available` -> Parity restored.
5. **T4-WL-05**: Multi-Floor Tiered Pricing & WiFi Speedtest Verification: Landlord configures penthouse rooms on Floor 3 with premium pricing -> Tenant inspects WiFi speedtest -> Selects Floor 3 room -> Checkout calculates premium rate.

---

## Test Architecture & Runners
- **E2E Playwright Browser Suite**: `tests/e2e/discrete_rooms_gallery.spec.ts`
  - Engine: Playwright Chromium headless runner.
  - Port Configuration: Frontend `http://localhost:5173`, Backend API `http://localhost:5000`.
- **Backend Unit & Integration Suite**: `npm test`
  - `tests/rooms.test.ts`: Room CRUD, auto-backfill, and parity sync.
  - `tests/gallery.test.ts`: Photo upload, categories, reordering, and Cloudinary streaming.
  - `tests/room_concurrency.test.ts`: `SELECT ... FOR UPDATE` row-locking concurrency tests.
- **Frontend Component Suite**: `npm --prefix frontend test -- --run`
  - `PropertyPhotoGallery.test.tsx`, `RoomSelectionGrid.test.tsx`.
- **Deterministic 5-Gate Verification**:
  - Windows: `powershell -ExecutionPolicy Bypass -File ./scripts/verify.ps1`
  - Unix/Linux: `./scripts/verify.sh`

---

## How to Run E2E Test Suite
```bash
# Run the discrete rooms and multi-photo gallery E2E test suite:
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts

# Run with interactive UI mode:
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts --ui

# Run specific tier:
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts -g "Tier 1"
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts -g "Tier 2"
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts -g "Tier 3"
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts -g "Tier 4"
```
