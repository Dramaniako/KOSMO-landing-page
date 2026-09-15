---
title: "perf(api): GET /rooms/:roomId and PUT /rooms/:roomId use SELECT * on property_photos — unbounded column fetch"
labels: ["performance", "database", "backend", "medium-priority"]
severity: "Medium (Unnecessary Data Transfer on Room Detail & Update)"
affected_files:
  - "backend/routes/rooms.routes.ts:187-190"
  - "backend/routes/rooms.routes.ts:385-388"
  - "backend/routes/photos.routes.ts:96"
  - "backend/routes/photos.routes.ts:335"
---

## Summary

Four queries across `rooms.routes.ts` and `photos.routes.ts` use `SELECT * FROM property_photos`, fetching every column in the table including `caption VARCHAR(255)`, `publicId VARCHAR(255)`, and `createdAt DATETIME`. In the context of these reads, only `id`, `propertyId`, `roomId`, `url`, `publicId`, `category`, `caption`, `orderIndex`, and `createdAt` are used — but `SELECT *` will also select any future added columns and forces MySQL to build the full row projection.

More critically, the `property_photos` table has an `INDEX idx_photos_room (roomId, orderIndex)` and an `INDEX idx_photos_property (propertyId, orderIndex)` which enable **index-only** reads if explicit narrow column lists are used. With `SELECT *`, the engine must perform a full row lookup from the primary index even when the covering index already has the needed data (breaking ICP and covering index optimizations).

### Affected Queries

| File | Line | Query |
|---|---|---|
| `rooms.routes.ts` | 188 | `SELECT * FROM property_photos WHERE roomId = ? ORDER BY orderIndex ASC` |
| `rooms.routes.ts` | 386 | `SELECT * FROM property_photos WHERE roomId = ? ORDER BY orderIndex ASC` |
| `photos.routes.ts` | 96 | `SELECT * FROM property_photos WHERE propertyId = ?` |
| `photos.routes.ts` | 335 | `SELECT * FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC, createdAt ASC` |

## Severity

**Medium (Unnecessary Data Transfer on Room Detail & Update)**

## Affected Files & Lines

- [`backend/routes/rooms.routes.ts:187–190`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/rooms.routes.ts#L187-L190)
- [`backend/routes/rooms.routes.ts:385–388`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/rooms.routes.ts#L385-L388)
- [`backend/routes/photos.routes.ts:96`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/photos.routes.ts#L96)
- [`backend/routes/photos.routes.ts:335`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/photos.routes.ts#L335)

## Steps to Reproduce

1. Run `EXPLAIN SELECT * FROM property_photos WHERE roomId = 'room-xyz' ORDER BY orderIndex ASC` on the production DB.
2. Compare with `EXPLAIN SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt FROM property_photos WHERE roomId = 'room-xyz' ORDER BY orderIndex ASC`.
3. The `SELECT *` query shows `type: ref` with a separate row-level lookup (key_len + extra table access); the narrow projection can use `Using index` on the covering index.

## Remediation / Proposed Approach

Replace all four `SELECT *` occurrences with explicit column lists matching `PropertyPhotoRow`:

```sql
SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt
FROM property_photos
WHERE roomId = ? ORDER BY orderIndex ASC
```

This enables covering index usage on `idx_photos_room(roomId, orderIndex)` and eliminates unnecessary row-lookups.
