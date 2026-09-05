# TEST_READY: KOSMO Discrete Room Inventory & Multi-Photo Gallery

## Status: READY FOR VERIFICATION
The comprehensive, opaque-box, requirement-driven 4-tier E2E test suite has been designed, authored, and validated against TypeScript typecheck and Playwright test discovery.

- **Test Specification File**: `tests/e2e/discrete_rooms_gallery.spec.ts`
- **Test Infrastructure Documentation**: `TEST_INFRA.md`
- **Total Tests Authored**: 53 test cases
- **TypeScript Compilation**: 0 errors in test suite (`npx tsc --noEmit`)
- **Authoritative Requirements**:
  - `ORIGINAL_REQUEST.md` (§Follow-up — 2026-09-04T10:52:01Z: R1, R2, R3, R4, R5)
  - `PROJECT.md` (§Interface Contracts, §Code Layout, Features 1-19)

---

## How to Run the Test Suite

### Run Entire 4-Tier E2E Suite
```bash
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts
```

### Run by Specific Tier
```bash
# Tier 1 - Feature Coverage (35 tests)
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts -g "Tier 1"

# Tier 2 - Boundary & Corner Cases (8 tests)
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts -g "Tier 2"

# Tier 3 - Cross-Feature Combinations (5 tests)
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts -g "Tier 3"

# Tier 4 - Real-World Application Workloads (5 tests)
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts -g "Tier 4"
```

### Run with Interactive UI Mode
```bash
npx playwright test tests/e2e/discrete_rooms_gallery.spec.ts --ui
```

---

## Test Coverage Summary Table

| Tier | Category / Scope | Test Count | Methodology | Target Component / API | Status |
|:---:|---|:---:|---|---|:---:|
| **Tier 1** | Feature 1: Discrete Room Listing | 5 | Category-Partition | `RoomSelectionGrid`, `/api/properties/:id/rooms` | **READY** |
| **Tier 1** | Feature 2: Room Selection & Locking | 5 | Category-Partition | `RoomSelectionGrid`, `BookingModal` | **READY** |
| **Tier 1** | Feature 3: Floor Navigation & Filtering | 5 | Category-Partition | `RoomSelectionGrid` Floor Tabs | **READY** |
| **Tier 1** | Feature 4: Interactive Photo Gallery Viewing | 5 | Category-Partition | `PropertyPhotoGallery`, Lightbox | **READY** |
| **Tier 1** | Feature 5: Category Perspectives Filtering | 5 | Category-Partition | `PropertyPhotoGallery` Tabs | **READY** |
| **Tier 1** | Feature 6: Landlord Room Toggle & Management | 5 | Category-Partition | `RoomInventoryModal`, `/api/properties/:id/rooms` | **READY** |
| **Tier 1** | Feature 7: Photo Upload & Reorder | 5 | Category-Partition | `PhotoGalleryManager`, `/api/properties/:id/photos` | **READY** |
| **Tier 2** | Boundary Value Analysis (BVA) & Corner Cases | 8 | BVA & Stress | Empty inventory, 60 rooms stress, Floor 0/10, Last room, 409 conflict, No photos, Invalid category, 10 photos limit | **READY** |
| **Tier 3** | Cross-Feature Interactions (Pairwise) | 5 | Combinatorial Pairwise | Price override + 12mo duration, In-flight maintenance toggle, Cover deletion fallback, Cross-floor selection retention, Room-specific gallery | **READY** |
| **Tier 4** | Real-World Application Workloads | 5 | Persona Journeys | Full Tenant Bali journey, Landlord onboarding & parity, Concurrent booking battle, Rental lifecycle release, Penthouse pricing & speedtest | **READY** |
| **TOTAL** | **Comprehensive Suite** | **53** | **4-Tier Opaque-Box** | **Full Full-Stack Inventory & Media Lifecycle** | **READY** |

---

## Detailed Test Mapping Matrix

### Tier 1: Feature Coverage (35 tests)
- `T1-RL-01`: Renders discrete rooms with identifiers, floor numbers, types, and base pricing (`#101`, `#102`, etc.)
- `T1-RL-02`: Renders visual status badges for `available`, `occupied`, and `maintenance` rooms
- `T1-RL-03`: Renders custom price overrides distinct from base property price (e.g. Rp 4.200.000 vs Rp 3.500.000)
- `T1-RL-04`: Renders floor groupings and tab headers for multi-story properties
- `T1-RL-05`: Verifies room count parity between aggregate counter and discrete room inventory
- `T1-RS-01`: Selecting an available room highlights card and enables booking progression
- `T1-RS-02`: Occupied room is rendered in disabled state and prevents selection
- `T1-RS-03`: Maintenance room card displays maintenance badge and blocks selection
- `T1-RS-04`: Switching selection between rooms updates selected `roomId` and summary price
- `T1-RS-05`: Selected room details persist through booking modal progression to contract step
- `T1-FN-01`: Defaults to displaying Floor 1 rooms on modal load
- `T1-FN-02`: Clicking Floor 2 tab switches room view to Floor 2 inventory
- `T1-FN-03`: Floor tabs display count of available rooms per floor
- `T1-FN-04`: "Semua Lantai" tab displays complete inventory across all floors
- `T1-FN-05`: Floor navigation preserves previously selected room state
- `T1-PG-01`: Renders hero media viewer with thumbnail filmstrip
- `T1-PG-02`: Navigation arrows cycle through property photos in order
- `T1-PG-03`: Clicking thumbnail switches active hero image
- `T1-PG-04`: Clicking active photo opens fullscreen lightbox modal and closes on close button
- `T1-PG-05`: Active photo displays category badge and caption overlay
- `T1-CF-01`: "Semua" tab displays all property photos
- `T1-CF-02`: "Kamar Tidur" category tab filters to bedroom photos
- `T1-CF-03`: "Kamar Mandi" category tab filters to bathroom photos
- `T1-CF-04`: "Fasilitas Komunal" / "Kolam" category tab filters to communal photos
- `T1-CF-05`: "WiFi Speedtest" tab displays verified bandwidth screenshot and metric badge
- `T1-LT-01`: Landlord toggles room status from `available` to `maintenance` in `RoomInventoryModal`
- `T1-LT-02`: Landlord toggles room status from `maintenance` back to `available`
- `T1-LT-03`: Room status toggle immediately updates room inventory summary table
- `T1-LT-04`: Landlord edits room details (price override and room type) and saves
- `T1-LT-05`: Landlord adds a new discrete room with number, floor, and pricing
- `T1-PU-01`: Landlord uploads photo with selected category tag
- `T1-PU-02`: Landlord sets uploaded photo as primary cover thumbnail
- `T1-PU-03`: Landlord reorders photos in gallery updating order index
- `T1-PU-04`: Landlord deletes a gallery photo and confirms removal
- `T1-PU-05`: Landlord uploads multiple categorized photos in batch

### Tier 2: Boundary & Corner Cases (8 tests)
- `T2-BVA-01`: Empty room inventory renders graceful empty state and disables booking
- `T2-BVA-02`: Max rooms stress test (50+ rooms render cleanly without layout breaks)
- `T2-BVA-03`: Non-standard floor numbers (Floor 0 / Ground Floor and Floor 10 Penthouse)
- `T2-BVA-04`: Booking the very last available room transitions property to "Penuh / Full"
- `T2-BVA-05`: Double-booking race condition rejection returns HTTP 409 Conflict
- `T2-BVA-06`: Photo gallery without photos displays fallback cover image gracefully
- `T2-BVA-07`: Invalid photo category payload handling defaults gracefully or rejects
- `T2-BVA-08`: Maximum photo limit boundary enforcement (10 photos limit)

### Tier 3: Cross-Feature Combinations (5 tests)
- `T3-PW-01`: Room custom price override combined with multi-month lease calculation
- `T3-PW-02`: Room status toggle to maintenance during active booking attempt
- `T3-PW-03`: Multi-photo upload and delete with simultaneous thumbnail selection
- `T3-PW-04`: Floor filter navigation while room on another floor is currently selected
- `T3-PW-05`: Category filter active in gallery while viewing room-specific photos

### Tier 4: Real-World Application Workloads (5 tests)
- `T4-WL-01`: Complete Tenant Bali Kos Journey: search -> filter -> inspect gallery -> select room 102 -> contract -> pay -> dashboard -> PDF
- `T4-WL-02`: Landlord property & room inventory management workflow
- `T4-WL-03`: Concurrent booking battle between two tenants attempting to book identical room
- `T4-WL-04`: Tenancy room allocation & lifecycle release
- `T4-WL-05`: Landlord multi-floor tiered pricing & tenant verification

---

## Authoritative Output Derivation References
1. **Room Entities & Backfill**: `ORIGINAL_REQUEST.md` §R1, `PROJECT.md` §2, §5
2. **Room-Level Selection & ACID 409 Guard**: `ORIGINAL_REQUEST.md` §R2, `PROJECT.md` §8, §9, §10
3. **Multi-Photo Gallery & Categorized Media**: `ORIGINAL_REQUEST.md` §R3, `PROJECT.md` §11, §12
4. **UI Workflows (Catalog, Tenant & Landlord Dashboards)**: `ORIGINAL_REQUEST.md` §R4, `PROJECT.md` §13, §14, §15, §16, §17
5. **Quality & Zero-Any Standards**: `PROJECT.md` §R5, `rules/workspace-rules.md`
