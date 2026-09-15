---
title: "perf(api): GET /rooms/:roomId endpoint has no in-memory caching — repeated single-room fetches re-hit the DB every time"
labels: ["performance", "backend", "caching", "medium-priority"]
severity: "Medium (Repeated DB Round-Trips on Room Detail)"
affected_files:
  - "backend/routes/rooms.routes.ts:172-214"
---

## Summary

`GET /api/rooms/:roomId` (the direct single-room lookup route) performs two sequential SQL queries (`rooms JOIN properties` + `property_photos`) on **every request without any cache layer**.

In contrast, `GET /api/properties/:id/rooms` (the parent-property room list) does use `apiCache` with a 30-second TTL (`cacheKey = \`properties:${id}:rooms:${statusQuery}\``). The single-room endpoint at line 172 was never wired up to the cache, which means:

- Opening the Landlord Dashboard room editor triggers an uncached fetch per room.
- Room-level polling or repeated modal opens each dispatch two DB queries.
- Any invalidation event that clears `properties` cache also fails to clear single-room entries (because they don't exist in the cache at all).

Additionally, `GET /api/rooms/:roomId` has no corresponding cache invalidation in `handleUpdateRoom` or `handleDeleteRoom`, so even if caching were added, it would require a coordinated invalidation strategy.

## Severity

**Medium (Repeated DB Round-Trips on Room Detail)**

## Affected Files & Lines

- [`backend/routes/rooms.routes.ts:172–214`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/rooms.routes.ts#L172-L214)

## Steps to Reproduce

1. Open two browser tabs pointing to the same property's Booking Modal.
2. In each tab, a `GET /api/rooms/:roomId` fires on selection.
3. Use MySQL's `SHOW PROCESSLIST` or add `console.time` around queries to confirm no cache hit occurs.
4. Observe in `apiCache.size()` that no `rooms:detail:*` keys are ever stored.

## Remediation / Proposed Approach

Add a short-TTL cache entry for single-room reads:

```typescript
const cacheKey = `rooms:detail:${roomId}`;
const cached = apiCache.get<Room>(cacheKey);
if (cached) return res.json(cached);

// ... existing queries ...

apiCache.set(cacheKey, formattedRoom, 30);
```

Ensure `apiCache.invalidatePattern('rooms:detail')` is called in `handleUpdateRoom`, `handleDeleteRoom`, and `handleToggleRoomStatus` handlers alongside the existing `apiCache.invalidatePattern('properties')` call.
