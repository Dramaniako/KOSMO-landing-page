---
title: "fix(frontend): Missing JWT Authorization Headers on Administrative & Landlord Requests"
labels: ["bug","frontend","security","critical-priority"]
severity: "Critical (Authentication)"
affected_files: ["frontend/src/pages/AdminDashboard.tsx:284-358","frontend/src/pages/LandlordDashboard.tsx:302-315"]
---

## Summary
Multiple fetch calls in AdminDashboard.tsx and LandlordDashboard.tsx omit the Authorization: Bearer <token> header, causing authenticated routes to fail or rely on insecure fallbacks.

## Severity
**Critical (Authentication)**

## Affected Files & Lines
- `frontend/src/pages/AdminDashboard.tsx:284-358`
- `frontend/src/pages/LandlordDashboard.tsx:302-315`

## Steps to Reproduce
1. Inspect network tab on AdminDashboard data fetching.
2. Requests to /admin/withdrawals lack Authorization header.

## Remediation / Proposed Patch
```typescript
Attach Authorization: Bearer ${token} headers to all administrative and landlord API requests.
```
