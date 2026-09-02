## 2024-05-19 - Intl.NumberFormat instantiation in Render Loop
**Learning:** Instantiating `Intl.NumberFormat` inside React components (especially list items like `KosCard` or frequently updated components like `SearchFilterBar`) creates significant overhead, taking ~780ms for 10k calls vs ~9ms when cached. In a component rendered multiple times, this causes unnecessary main thread blocking during renders.
**Action:** Always move `Intl.NumberFormat` instances outside of the component body or cache them at the module level.
## 2024-05-19 - Missing Index on property_facilities.propertyId
**Learning:** The `GET /api/properties` endpoint performs a `LEFT JOIN` and `GROUP_CONCAT` on `property_facilities` using `propertyId`. A missing index on this foreign key causes slow full table scans as the facilities table grows, impacting search and filter performance.
**Action:** Always ensure foreign keys used in joins and aggregations (like `propertyId`) are indexed in the database setup script (`backend/db.ts`).
