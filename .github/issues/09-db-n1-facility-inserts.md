---
title: "perf(db): Serial N+1 Loop Inserts on Property Facilities in Property Creation & Updates"
labels: ["performance","database","medium-priority"]
severity: "Medium (Performance)"
affected_files: ["backend/router.ts:756-763","backend/router.ts:821-825"]
---

## Summary
POST /properties and PUT /properties/:id iterate over facilities in a JS for loop executing sequential single INSERT queries, holding transaction row locks unnecessarily long.

## Severity
**Medium (Performance)**

## Affected Files & Lines
- `backend/router.ts:756-763`
- `backend/router.ts:821-825`

## Steps to Reproduce
1. Create a property with 8 facilities.
2. Observe 8 individual sequential INSERT INTO property_facilities round-trips inside transaction.

## Remediation / Proposed Patch
```typescript
if (facilities && facilities.length > 0) {
  const values = facilities.map(fac => [propId, fac]);
  await connection.query(
    'INSERT INTO property_facilities (propertyId, facility) VALUES ?',
    [values]
  );
}
```
