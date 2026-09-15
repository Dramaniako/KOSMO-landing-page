---
title: "perf(db): property_photos table missing updatedAt column — forces clients to re-download unchanged photos on every open"
labels: ["performance", "database", "caching", "low-priority"]
severity: "Low (Prevents HTTP 304 Conditional Caching for Photos)"
affected_files:
  - "backend/db.ts:320-337"
  - "backend/routes/photos.routes.ts:39-63"
---

## Summary

The `property_photos` table schema (defined in `db.ts:320-337`) only has a `createdAt DATETIME` column — **there is no `updatedAt` column**:

```sql
CREATE TABLE IF NOT EXISTS property_photos (
  id VARCHAR(50) PRIMARY KEY,
  propertyId VARCHAR(50) NOT NULL,
  roomId VARCHAR(50) NULL,
  url VARCHAR(500) NOT NULL,
  publicId VARCHAR(255) NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'other',
  caption VARCHAR(255) DEFAULT '',
  orderIndex INT NOT NULL DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_photos_property (propertyId, orderIndex),
  ...
```

The `formatPhotoResponse` function in `photos.routes.ts:39-63` exposes a `updatedAt` field in the response, but falls back to `createdAt` when `updatedAt` is absent from the row:

```typescript
// rooms.routes.ts:150
updatedAt: p.updatedAt || p.createdAt
```

This means:
1. **HTTP conditional caching (`ETag`, `Last-Modified`) cannot be implemented** on the photo endpoint because there is no reliable `updatedAt` timestamp to use as a `Last-Modified` value. Without this, every request must return a full 200 response; clients cannot send `If-None-Match` to get a 304.
2. **The in-memory API cache** (30-second TTL) is the only cache layer — if a user reopens the modal after 30 seconds, the full photo payload is re-fetched and re-transferred from DB even if no photos changed.
3. **Caption and orderIndex edits** have no timestamp, so clients cannot detect that only metadata changed vs. the photo URL itself.

## Severity

**Low (Prevents HTTP 304 Conditional Caching for Photos)**

## Affected Files & Lines

- [`backend/db.ts:320–337`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/db.ts#L320-L337)
- [`backend/routes/photos.routes.ts:39–63`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/photos.routes.ts#L39-L63)

## Steps to Reproduce

1. Upload a photo and note `createdAt`.
2. Edit the photo's caption via `PUT /api/properties/:id/photos/reorder` or any metadata update.
3. Query `SELECT id, createdAt, updatedAt FROM property_photos WHERE propertyId = ?`.
4. Observe: `updatedAt` column does not exist; there is no way to detect that caption/order changed.

## Remediation / Proposed Approach

Add `updatedAt` to the DDL:

```sql
CREATE TABLE IF NOT EXISTS property_photos (
  ...
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ...
```

Then use `updatedAt` as the `Last-Modified` response header in `GET /api/properties/:id/photos` to enable HTTP conditional caching:

```typescript
const latestUpdate = Math.max(...photos.map(p => new Date(p.updatedAt || p.createdAt).getTime()));
res.setHeader('Last-Modified', new Date(latestUpdate).toUTCString());
res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
```
