---
title: "perf(api): GET /properties/:id/rooms executes 3 sequential SQL queries with no parallel execution"
labels: ["performance", "database", "backend", "high-priority"]
severity: "High (Increased Latency on Room Loading)"
affected_files:
  - "backend/routes/rooms.routes.ts:85-167"
---

## Summary

`GET /api/properties/:id/rooms` runs **three sequential `await pool.query()` calls** in series:
1. Property existence check (`SELECT id, price FROM properties WHERE id = ?`)
2. Room list query (`SELECT ... FROM rooms WHERE propertyId = ?`)
3. Photo bulk fetch (`SELECT ... FROM property_photos WHERE propertyId = ? AND roomId IS NOT NULL`)

Each query waits for the previous to complete before the next is dispatched. Because the room query and the photo query are **fully independent** (no data dependency between them once the property is confirmed to exist), the total response time is `T(property) + T(rooms) + T(photos)` instead of `T(property) + max(T(rooms), T(photos))`.

At median MySQL/TiDB round-trip latency of ~10–20ms per query, this adds 10–20ms of unnecessary serial overhead on every modal open.

## Severity

**High (Increased Latency on Room Loading)**

## Affected Files & Lines

- [`backend/routes/rooms.routes.ts:85–167`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/rooms.routes.ts#L85-L167)

## Steps to Reproduce

1. Open the KOSMO landing page and click on any property card.
2. The Booking Modal opens and triggers `GET /api/properties/:id/rooms`.
3. Add query-level logging or use `SHOW PROCESSLIST` to observe that queries fire sequentially.
4. On a remote DB connection (TiDB Cloud), each query round-trip is ~15ms → total ~45ms just for this endpoint.

## Remediation / Proposed Approach

After the initial property existence check resolves, dispatch the rooms and photos queries concurrently using `Promise.all`:

```typescript
// After property check resolves:
const [roomRows, photoRows] = await Promise.all([
  pool.query<RoomRow[]>(sqlRooms, roomParams),
  pool.query<PropertyPhotoRow[]>(sqlPhotos, [id])
]);
```

This reduces total query time from `T_prop + T_rooms + T_photos` to `T_prop + max(T_rooms, T_photos)`.
