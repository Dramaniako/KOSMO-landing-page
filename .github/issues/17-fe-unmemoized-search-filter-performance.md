---
title: "perf(frontend): Unmemoized Filter Component and Handlers Triggering Heavy Re-Renders"
labels: ["performance","frontend"]
severity: "Medium (Performance)"
affected_files: ["frontend/src/components/SearchFilterBar.tsx:25-56","frontend/src/pages/LandingPage.tsx:140-191"]
---

## Summary
SearchFilterBar is not wrapped in React.memo and filter toggle callbacks in LandingPage are not wrapped in useCallback, causing redundant child component re-renders on price keystrokes.

## Severity
**Medium (Performance)**

## Affected Files & Lines
- `frontend/src/components/SearchFilterBar.tsx:25-56`
- `frontend/src/pages/LandingPage.tsx:140-191`

## Steps to Reproduce
1. Profile React component rendering in React DevTools.
2. Type in price input; notice SearchFilterBar and all facility buttons re-rendering on every character.

## Remediation / Proposed Patch
```typescript
Wrap SearchFilterBar in React.memo and memoize handlers with useCallback in LandingPage.tsx.
```
