---
title: "bug(db): Indonesian Date Format String Mismatch in Revenue Analytics (STR_TO_DATE)"
labels: ["bug","database","high-priority"]
severity: "High (Data Integrity / Analytics)"
affected_files: ["backend/router.ts:1227-1234","backend/router.ts:2423","backend/db.ts:236"]
---

## Summary
In POST /rentals, startDate is stored in Indonesian locale format ("15 Jun 2026"). In GET /landlord/financials, aggregation executes STR_TO_DATE(r.startDate, "%Y-%m-%d"), which returns NULL for Indonesian date strings, silently dropping rental earnings from analytics.

## Severity
**High (Data Integrity / Analytics)**

## Affected Files & Lines
- `backend/router.ts:1227-1234`
- `backend/router.ts:2423`
- `backend/db.ts:236`

## Steps to Reproduce
1. Create a rental.
2. Call GET /api/landlord/financials.
3. Monthly revenue charts return empty or NULL month entries.

## Remediation / Proposed Patch
```typescript
Standardize startDate storage to standard ISO format (YYYY-MM-DD) across all rental creation endpoints.
```
