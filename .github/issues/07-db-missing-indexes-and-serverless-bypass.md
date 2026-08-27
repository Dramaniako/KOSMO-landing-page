---
title: "perf(db): ensureIndexes Disabled in Vercel Environment & Missing DDL Secondary Indexes"
labels: ["performance","database","high-priority"]
severity: "High (System-wide Query Latency)"
affected_files: ["backend/db.ts:96-119","backend/db.ts:121-252","api/index.js"]
---

## Summary
ensureIndexes() in db.ts contains "if (process.env.VERCEL) return;" and table DDL statements in createSchemaTables() omit secondary indexes inline. Cloud deployments run without indexes, causing all filtered queries on rentals, properties, and reviews to degrade into full table scans.

## Severity
**High (System-wide Query Latency)**

## Affected Files & Lines
- `backend/db.ts:96-119`
- `backend/db.ts:121-252`
- `api/index.js`

## Steps to Reproduce
1. Deploy to Vercel or cloud TiDB/MySQL.
2. Run EXPLAIN SELECT * FROM properties WHERE district = "Canggu" AND price <= 5000000.
3. Query execution plan reports type: ALL (full table scan).

## Remediation / Proposed Patch
```typescript
// Add inline INDEX definitions in CREATE TABLE in db.ts and remove VERCEL index bypass
```
