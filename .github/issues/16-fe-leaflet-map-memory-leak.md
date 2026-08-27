---
title: "perf(frontend): Leaflet Map Instance Memory Leak on Component Unmount & Repeated Modals"
labels: ["performance","frontend","memory-leak"]
severity: "High (Memory Leak)"
affected_files: ["frontend/src/pages/LandingPage.tsx:112-138","frontend/src/pages/LandlordDashboard.tsx:234-285"]
---

## Summary
Leaflet maps initialized in useEffect are not destroyed with mapInstance.remove() in the cleanup return function, causing detached DOM trees and tile listeners to leak heap memory.

## Severity
**High (Memory Leak)**

## Affected Files & Lines
- `frontend/src/pages/LandingPage.tsx:112-138`
- `frontend/src/pages/LandlordDashboard.tsx:234-285`

## Steps to Reproduce
1. Open and close property details modal 20 times.
2. Measure JavaScript heap memory; notice monotonic memory growth.

## Remediation / Proposed Patch
```typescript
return () => {
  clearTimeout(timer);
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
};
```
