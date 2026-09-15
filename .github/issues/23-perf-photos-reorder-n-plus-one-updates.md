---
title: "perf(api): Photo reorder endpoint issues N individual UPDATE queries in a loop instead of a bulk UPDATE"
labels: ["performance", "database", "backend", "medium-priority"]
severity: "Medium (O(N) DB Round-Trips on Photo Reorder)"
affected_files:
  - "backend/routes/photos.routes.ts:315-332"
---

## Summary

`PUT /api/properties/:id/photos/reorder` issues **one `UPDATE` query per photo** inside a `for` loop inside a transaction:

```typescript
// lines 315-332 — photos.routes.ts
for (let i = 0; i < photoIds.length; i++) {
  await connection.query(
    'UPDATE property_photos SET orderIndex = ? WHERE id = ? AND propertyId = ?',
    [i, photoIds[i], propertyId]
  );
}

// Additional loop for remaining photos (lines 327-332)
for (let j = 0; j < remaining.length; j++) {
  await connection.query(
    'UPDATE property_photos SET orderIndex = ? WHERE id = ? AND propertyId = ?',
    [photoIds.length + j, remaining[j].id, propertyId]
  );
}
```

If a property has 10 photos, this dispatches **10–20 sequential `await` UPDATE queries** inside one transaction. At 10ms per round-trip, reordering 10 photos costs ~100–200ms in query time alone before commit overhead. The endpoint allows up to 10 photos per upload batch (×10 properties = up to 100 writes in theory).

This is an **N+1 write pattern** — a well-known performance anti-pattern.

## Severity

**Medium (O(N) DB Round-Trips on Photo Reorder)**

## Affected Files & Lines

- [`backend/routes/photos.routes.ts:315–332`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/photos.routes.ts#L315-L332)

## Steps to Reproduce

1. Upload 10 photos to a property.
2. Drag-reorder all 10 photos in the Landlord Dashboard.
3. Observe the HTTP request duration for `PUT /api/properties/:id/photos/reorder`.
4. With `SHOW PROCESSLIST` or query logging, count 10+ individual UPDATE statements per reorder operation.

## Remediation / Proposed Approach

Use a **bulk `CASE ... WHEN` UPDATE** or MySQL `INSERT ... ON DUPLICATE KEY UPDATE` to collapse all updates into one round-trip:

```sql
UPDATE property_photos
SET orderIndex = CASE id
  WHEN 'photo-1' THEN 0
  WHEN 'photo-2' THEN 1
  ...
END
WHERE id IN ('photo-1', 'photo-2', ...) AND propertyId = ?
```

Alternatively, use a temporary table approach or `VALUES ROW()` in MySQL 8.0+ for parameterized bulk updates.
