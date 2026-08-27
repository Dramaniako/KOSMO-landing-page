---
title: "fix(security): Unrestricted Landlord Financial Report Export IDOR on /reports/landlord/excel"
labels: ["security","high-priority","backend","vulnerability"]
severity: "High (CVSS 7.5)"
affected_files: ["backend/router.ts:1778-1792","api/index.js"]
---

## Summary
In GET /reports/landlord/excel, any user with landlord role can pass any ?landlordId=target-id to download an Excel workbook containing full banking records, monthly revenue breakdown, and rental transaction history of competing landlords.

## Severity
**High (CVSS 7.5)**

## Affected Files & Lines
- `backend/router.ts:1778-1792`
- `api/index.js`

## Steps to Reproduce
1. Log in as landlord A.
2. Request GET /api/reports/landlord/excel?landlordId=landlord-B.
3. Download spreadsheet with landlord B financial data.

## Remediation / Proposed Patch
```typescript
// backend/router.ts
router.get('/reports/landlord/excel', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) return res.status(401).json({ message: "Otentikasi diperlukan." });

  const landlordId = authUser.role === 'admin' && req.query.landlordId
    ? String(req.query.landlordId)
    : authUser.id;
  // proceed with Excel generation for landlordId...
});
```
