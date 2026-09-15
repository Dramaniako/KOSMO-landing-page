---
title: "perf(api): GET /properties/:id/photos has no server-side pagination — returns unlimited photos per request"
labels: ["performance", "backend", "api", "medium-priority"]
severity: "Medium (Unbounded Payload Size on Photo Gallery Load)"
affected_files:
  - "backend/routes/photos.routes.ts:69-125"
---

## Summary

`GET /api/properties/:id/photos` returns **all photos for a property in a single response** with no `LIMIT`, `OFFSET`, or cursor-based pagination. The endpoint fetches all rows from `property_photos` matching `propertyId = ?` without any upper bound.

A landlord who uploads the maximum 10 photos per batch across multiple sessions can accumulate dozens of photos. At 500 bytes per row (url VARCHAR(500) + publicId VARCHAR(255) + caption VARCHAR(255) + other fields), a property with 50 photos could return a 25KB JSON payload — and more importantly, the query scans and transfers all rows across the network on every modal open.

There is no `LIMIT` clause anywhere in the photo fetch path:
- `photos.routes.ts:96`: `SELECT * FROM property_photos WHERE propertyId = ?`
- The cache TTL is 30 seconds — so if a user opens the same modal 5 times in 30 seconds only 1 DB query fires, but each subsequent open still transfers the full unbounded payload from the in-memory cache.

The frontend `PropertyPhotoGallery` renders all returned photos at once in the thumbnail filmstrip with no virtualization, compounding the rendering cost.

## Severity

**Medium (Unbounded Payload Size on Photo Gallery Load)**

## Affected Files & Lines

- [`backend/routes/photos.routes.ts:69–125`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/photos.routes.ts#L69-L125)

## Steps to Reproduce

1. Upload the maximum 10 photos per batch several times to one property.
2. Open the property Booking Modal.
3. Capture the network response for `GET /api/properties/:id/photos` in DevTools.
4. Observe the full payload is returned even when only the first 3–5 photos are visible in the initial viewport.

## Remediation / Proposed Approach

Add optional `limit` and `offset` query parameters (default `limit=20`) and add `LIMIT ?` to the SQL:

```typescript
const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 50);
const offset = parseInt(req.query.offset as string || '0', 10);
sql += ' LIMIT ? OFFSET ?';
params.push(limit, offset);
```

Return `{ photos, total, limit, offset }` envelope to allow the frontend to implement infinite-scroll or "load more" pagination in the gallery.
