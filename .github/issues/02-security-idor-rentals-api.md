---
title: "fix(security): Horizontal Privilege Escalation & IDOR on GET /api/rentals"
labels: ["security","high-priority","backend","vulnerability"]
severity: "High (CVSS 7.5)"
affected_files: ["backend/router.ts:1921-1957","api/index.js"]
---

## Summary
GET /api/rentals allows any authenticated user to supply arbitrary tenantId query parameters or omit tenantId entirely. Omitting tenantId returns all tenancy records in the system including tenant names, contract links, dates, and amounts.

## Severity
**High (CVSS 7.5)**

## Affected Files & Lines
- `backend/router.ts:1921-1957`
- `api/index.js`

## Steps to Reproduce
1. Authenticate as any tenant.
2. Send GET /api/rentals.
3. Full tenancy records of all platform users are returned.

## Remediation / Proposed Patch
```typescript
// backend/router.ts
router.get('/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) return res.status(401).json({ message: "Otentikasi diperlukan." });

  try {
    let sql = 'SELECT * FROM rentals WHERE 1=1';
    const params: (string | number)[] = [];

    if (authUser.role === 'tenant') {
      sql += ' AND tenantId = ?';
      params.push(authUser.id);
    } else if (authUser.role === 'landlord') {
      sql += ' AND propertyId IN (SELECT id FROM properties WHERE ownerId = ?)';
      params.push(authUser.id);
    } else if (authUser.role === 'admin' && req.query.tenantId) {
      sql += ' AND tenantId = ?';
      params.push(String(req.query.tenantId));
    }
    sql += ' ORDER BY id DESC LIMIT 50';
    const [rows] = await pool.query<RentalRow[]>(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data sewa." });
  }
});
```
