## 2024-05-18 - [Frontend Render Optimization]
**Learning:** `KosCard` re-renders frequently during typing in search filters. Wrapping components with `React.memo` is only effective if the prop references are stable.
**Action:** Use `useCallback` for props that are functions in parent components (like `LandingPage`) when wrapping children components (like `KosCard`) with `React.memo`. Do not modify dependency lock files unnecessarily while exploring.
