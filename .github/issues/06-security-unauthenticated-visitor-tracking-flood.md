---
title: "fix(security): Unauthenticated Table Flooding on POST /api/tracking/visit"
labels: ["security","medium-priority","backend"]
severity: "Medium (CVSS 5.3)"
affected_files: ["backend/router.ts:1542-1556","api/index.js"]
---

## Summary
POST /api/tracking/visit accepts unauthenticated requests with no rate limiting, allowing automated scripts to flood the MySQL visitor_tracking table and inflate database disk storage.

## Severity
**Medium (CVSS 5.3)**

## Affected Files & Lines
- `backend/router.ts:1542-1556`
- `api/index.js`

## Steps to Reproduce
1. Execute a curl loop sending 1,000 POST requests to /api/tracking/visit in seconds.
2. All 1,000 records are written to visitor_tracking without rate limit rejection.

## Remediation / Proposed Patch
```typescript
// backend/router.ts
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // max 30 visits tracked per minute per IP
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/tracking/visit', trackingLimiter, async (req: Request, res: Response) => {
  // tracked visit insert...
});
```
