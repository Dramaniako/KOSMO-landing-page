---
title: "fix(security): Missing Authentication & IDOR on GET /api/stats and /api/landlord/stats"
labels: ["security","high-priority","backend","vulnerability"]
severity: "High (CVSS 7.5)"
affected_files: ["backend/router.ts:1143-1206","api/index.js"]
---

## Summary
The `GET /api/stats` and `GET /api/landlord/stats` endpoints accept an arbitrary `landlordId` query parameter without requiring JWT authentication (`authenticateToken`) or role authorization (`requireRole(['admin', 'landlord', 'owner'])`). Any unauthenticated caller can query these endpoints and leak sensitive landlord financial data (account balance, total revenue, payout history, active tenants, and property occupancy statistics).

## Severity
**High (CVSS 7.5)**

## Affected Files & Lines
- `backend/router.ts:1143-1206`
- `api/index.js`

## Steps to Reproduce
1. Send an unauthenticated HTTP request: `curl http://localhost:5000/api/landlord/stats?landlordId=user-landlord`
2. Observe the complete financial balance, total revenue, payout history, and property statistics returned in the JSON response without any authentication header.

## Remediation / Proposed Patch
1. Add `authenticateToken` middleware and `requireRole(['admin', 'landlord', 'owner'])` to `/stats` and `/landlord/stats`.
2. Restrict non-admin queries to the authenticated caller's own ID (`req.user?.id`).
