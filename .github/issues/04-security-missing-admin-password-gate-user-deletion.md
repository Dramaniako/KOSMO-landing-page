---
title: "fix(security): Missing Administrator Password Verification Gate on DELETE /api/users/:id"
labels: ["security","medium-priority","backend"]
severity: "Medium (CVSS 5.8)"
affected_files: ["backend/router.ts:600-612","api/index.js"]
---

## Summary
DELETE /api/properties/:id and POST /api/rentals/:id/terminate require caller password verification with bcrypt.compareSync. However, DELETE /api/users/:id deletes user accounts without requiring admin password confirmation.

## Severity
**Medium (CVSS 5.8)**

## Affected Files & Lines
- `backend/router.ts:600-612`
- `api/index.js`

## Steps to Reproduce
1. Obtain admin session token.
2. Send DELETE /api/users/user-landlord without body password.
3. User account is immediately deleted.

## Remediation / Proposed Patch
```typescript
// backend/router.ts
router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { password } = req.body as { password?: string };
  const authUser = req.user;

  if (!password) {
    return res.status(400).json({ message: "Password konfirmasi administrator diperlukan." });
  }

  const [adminRows] = await pool.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [authUser?.id]);
  const admin = adminRows[0];
  if (!admin || !admin.password || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ message: "Password administrator salah." });
  }

  await pool.query('DELETE FROM users WHERE id = ?', [id]);
  res.json({ message: "User berhasil dihapus!" });
});
```
