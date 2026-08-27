---
title: "bug(db): Permanent Room Allocation Leak on Tenant User Deletion (ON DELETE CASCADE)"
labels: ["bug","database","high-priority"]
severity: "High (Data Integrity)"
affected_files: ["backend/db.ts:248","backend/router.ts:600-612"]
---

## Summary
The rentals table defines FOREIGN KEY (tenantId) REFERENCES users(id) ON DELETE CASCADE. When an admin deletes a tenant user, MySQL cascades and deletes their rentals, but properties.occupiedRooms is not decremented, permanently locking available inventory.

## Severity
**High (Data Integrity)**

## Affected Files & Lines
- `backend/db.ts:248`
- `backend/router.ts:600-612`

## Steps to Reproduce
1. Rent a room in a property.
2. Delete the tenant account via admin panel.
3. Notice occupiedRooms on the property remains incremented permanently.

## Remediation / Proposed Patch
```typescript
// Guard DELETE /users/:id to prevent deleting tenants with active leases, and decrement rooms when removing tenancies
```
