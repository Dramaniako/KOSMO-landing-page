## 2024-05-19 - Intl.NumberFormat instantiation in Render Loop
**Learning:** Instantiating `Intl.NumberFormat` inside React components (especially list items like `KosCard` or frequently updated components like `SearchFilterBar`) creates significant overhead, taking ~780ms for 10k calls vs ~9ms when cached. In a component rendered multiple times, this causes unnecessary main thread blocking during renders.
**Action:** Always move `Intl.NumberFormat` instances outside of the component body or cache them at the module level.
