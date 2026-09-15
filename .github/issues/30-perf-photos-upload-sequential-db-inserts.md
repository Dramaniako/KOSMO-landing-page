---
title: "perf(api): Photo upload to Cloudinary is sequential per file — 10-file upload takes 10x single-file upload time"
labels: ["performance", "backend", "api", "medium-priority"]
severity: "Medium (O(N) Cloudinary Upload Latency for Multi-Photo Upload)"
affected_files:
  - "backend/routes/photos.routes.ts:194-201"
  - "backend/routes/photos.routes.ts:216-242"
---

## Summary

`POST /api/properties/:id/photos` allows uploading up to 10 files in a single request. The Cloudinary upload step correctly uses `Promise.all` to upload all files concurrently:

```typescript
// photos.routes.ts:195-201 ✅ Uploads are parallel
uploadResults = await Promise.all(
  files.map((file) => uploadImageStream(file.buffer, 'kosmo_properties'))
);
```

However, the **database INSERT loop immediately after** (lines 216–242) inserts each photo **sequentially** with individual `await connection.query(INSERT ...)` calls inside a `for` loop:

```typescript
// photos.routes.ts:216-242 ❌ Sequential INSERTs
for (let i = 0; i < uploadResults.length; i++) {
  await connection.query(
    `INSERT INTO property_photos (...) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [...]
  );
  nextOrder++;
}
```

For 10 photos, this dispatches **10 sequential `await` INSERT queries** inside the transaction, adding ~100–200ms of unnecessary serial latency on top of the already-parallel Cloudinary uploads. With each DB round-trip at ~10–20ms on a remote TiDB connection, a 10-photo upload takes 100–200ms in DB writes alone after Cloudinary completes.

## Severity

**Medium (O(N) DB INSERT Latency for Multi-Photo Upload)**

## Affected Files & Lines

- [`backend/routes/photos.routes.ts:194–201`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/photos.routes.ts#L194-L201)
- [`backend/routes/photos.routes.ts:216–242`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/routes/photos.routes.ts#L216-L242)

## Steps to Reproduce

1. Go to the Landlord Dashboard photo management section.
2. Select 10 photos and upload simultaneously.
3. Observe the `POST /api/properties/:id/photos` request duration.
4. With query logging, count 10 individual INSERT statements that fire sequentially inside the transaction.

## Remediation / Proposed Approach

Use a **single `INSERT ... VALUES` multi-row statement** to insert all photos in one query:

```typescript
// Build parameterized multi-row values
const valuePlaceholders = uploadResults.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, NOW())').join(', ');
const flatParams = uploadResults.flatMap((uploadRes, i) => [
  generateId('photo'),   // photoId
  propertyId,
  rawRoomId,
  uploadRes.secure_url,
  uploadRes.public_id,
  targetCategory,
  caption,
  nextOrder + i
]);

await connection.query(
  `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt) 
   VALUES ${valuePlaceholders}`,
  flatParams
);
```

This collapses N INSERTs into a single query, reducing DB round-trips from O(N) to O(1) for the INSERT phase.
