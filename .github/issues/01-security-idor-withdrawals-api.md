---
title: "fix(security): Broken Object Level Authorization (IDOR) on GET /api/withdrawals"
labels: ["security","high-priority","backend","vulnerability"]
severity: "High (CVSS 7.5)"
affected_files: ["backend/router.ts:1275-1290","api/index.js"]
---

## Summary
The GET /api/withdrawals endpoint accepts an optional userId query parameter. If a non-admin user queries GET /api/withdrawals without supplying userId, the SQL executes SELECT * FROM withdrawals WHERE 1=1 without scoping to the authenticated caller, leaking all bank accounts, amounts, and landlord payout history.

## Severity
**High (CVSS 7.5)**

## Affected Files & Lines
- `backend/router.ts:1275-1290`
- `api/index.js`

## Steps to Reproduce
1. Log in as tenant or landlord.
2. Send GET /api/withdrawals.
3. Observe all platform bank accounts, account holders, and payout amounts returned in response.

## Remediation / Proposed Patch
```typescript
// backend/router.ts
router.get('/withdrawals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const authUser = req.user;
  if (!authUser) return res.status(401).json({ message: "Otentikasi diperlukan." });

  const targetUserId = authUser.role === 'admin'
    ? (req.query.userId ? String(req.query.userId) : null)
    : authUser.id;

  try {
    let sql = 'SELECT * FROM withdrawals WHERE 1=1';
    const params: string[] = [];
    if (targetUserId) {
      sql += ' AND userId = ?';
      params.push(targetUserId);
    }
    sql += ' ORDER BY id DESC LIMIT 50';
    const [rows] = await pool.query<WithdrawalRow[]>(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data penarikan." });
  }
});
```
