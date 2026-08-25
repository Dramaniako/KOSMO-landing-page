## 2024-05-19 - Intl.NumberFormat instantiation in Render Loop
**Learning:** Instantiating `Intl.NumberFormat` inside React components (especially list items like `KosCard` or frequently updated components like `SearchFilterBar`) creates significant overhead, taking ~780ms for 10k calls vs ~9ms when cached. In a component rendered multiple times, this causes unnecessary main thread blocking during renders.
**Action:** Always move `Intl.NumberFormat` instances outside of the component body or cache them at the module level.

## 2026-08-25 - React.memo Optimization in SearchFilterBar
**Learning:** The `SearchFilterBar` component contains many input elements and dropdowns, making its rendering cost relatively high. Parent components like `LandingPage` often re-render due to state updates unrelated to the filter bar (e.g., typing in a completely different area), which causes `SearchFilterBar` to needlessly re-render. Wrapping it in `React.memo` prevents this overhead, which is especially noticeable during typing, saving main thread time and improving responsiveness.
**Action:** Use `React.memo` on complex form components or components with many DOM elements when their parent re-renders frequently due to unrelated state changes, provided their props are stable or shallow-comparable.
