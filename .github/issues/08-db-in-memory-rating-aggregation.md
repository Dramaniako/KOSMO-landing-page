---
title: "perf(db): In-Memory Review Aggregate Rating Calculation Causing Memory & Network Bloat"
labels: ["performance","database","medium-priority"]
severity: "Medium (Performance)"
affected_files: ["backend/router.ts:994-997","backend/router.ts:1042-1045","backend/router.ts:1083-1089"]
---

## Summary
When reviews are created, updated, or deleted, the router fetches all ratings for that property across the network and calculates the average using JavaScript Array.reduce(), causing memory bloat and connection latency as review volume grows.

## Severity
**Medium (Performance)**

## Affected Files & Lines
- `backend/router.ts:994-997`
- `backend/router.ts:1042-1045`
- `backend/router.ts:1083-1089`

## Steps to Reproduce
1. Inspect POST /api/reviews handler.
2. Notice SELECT rating FROM reviews WHERE propertyId = ? followed by JS array reduce.

## Remediation / Proposed Patch
```typescript
await connection.query(`
  UPDATE properties
  SET rating = COALESCE((
    SELECT ROUND(AVG(rating), 1)
    FROM reviews
    WHERE propertyId = ?
  ), 0.0)
  WHERE id = ?
`, [propertyId, propertyId]);
```
