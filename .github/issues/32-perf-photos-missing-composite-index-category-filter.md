---
title: "perf(api): GET /properties/:id/photos uses in-memory JS filter for facility/category after full DB scan — not pushed to SQL WHERE"
labels: ["performance", "database", "backend", "low-priority"]
severity: "Low (Unnecessary Full Table Scan Before JS Filtering)"
affected_files:
  - "backend/routes/photos.routes.ts:99-111"
---

## Summary

`GET /api/properties/:id/photos` supports two optional query filters: `?category=bedroom` and `?roomId=null`. While `category` is correctly pushed down to SQL via `AND category = ?`, the **`roomId` filter does not consistently use the DB index**:

```typescript
// photos.routes.ts:104-111
if (roomIdQuery !== undefined) {
  if (roomIdQuery.toLowerCase() === 'null' || roomIdQuery.toLowerCase() === 'property') {
    sql += ' AND (roomId IS NULL OR roomId = "")';  // Can't use idx_photos_room
  } else {
    sql += ' AND roomId = ?';                        // Uses idx_photos_room
    params.push(roomIdQuery);
  }
}
```

The `roomId IS NULL OR roomId = ""` predicate **cannot use the `idx_photos_room (roomId, orderIndex)` index** because MySQL does not include `NULL` values in B-tree index entries by default. This causes a full scan of all photos for the property when `?roomId=null` (property-level photos only) is requested.

Additionally, the `property_photos.category` column has its own index `idx_photos_category (category)`, but the combined filter `WHERE propertyId = ? AND category = ?` cannot use both `idx_photos_property` and `idx_photos_category` simultaneously — MySQL chooses one. There is no composite `(propertyId, category, orderIndex)` index to enable an index-only scan for the common `GET /photos?category=bedroom` request pattern.

## Severity

**Low (Unnecessary Full Table Scan for Property-Level Photo Filter)**

## Affected Files & Lines

- [`backend/routes/photos.routes.ts:99–111`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/photos.routes.ts#L99-L111)

## Steps to Reproduce

1. Upload photos for a property — some to rooms, some as property-level (no roomId).
2. Run: `EXPLAIN SELECT id, url FROM property_photos WHERE propertyId = ? AND (roomId IS NULL OR roomId = '') ORDER BY orderIndex ASC`.
3. Observe `type: ref` with `key: idx_photos_property` — but the `roomId IS NULL` predicate causes extra filtering at the storage engine level, not index level.

## Remediation / Proposed Approach

1. Add a composite index to cover the most frequent combined filter:

```sql
ALTER TABLE property_photos
  ADD INDEX idx_photos_property_category (propertyId, category, orderIndex);
```

2. Replace `roomId IS NULL OR roomId = ""` with a nullable-aware index-friendly approach by storing `NULL` consistently (never `""`) and using `IS NULL` only:

```sql
-- Enforce NULL consistency in INSERT/UPDATE:
-- Use NULL (not '') when there is no room association.
```

3. The `ensureIndexes()` function in `db.ts` should be extended with the new composite index and **the `if (process.env.VERCEL) return;` bypass in `ensureIndexes()` must be removed** (see issue #07) so the index is applied in production.
