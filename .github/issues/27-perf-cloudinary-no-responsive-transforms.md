---
title: "perf(frontend): No Cloudinary responsive image transforms — full-resolution images served for thumbnails"
labels: ["performance", "frontend", "images", "high-priority"]
severity: "High (Excessive Bandwidth Usage on Gallery Thumbnails)"
affected_files:
  - "frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx:253-278"
  - "backend/services/cloudinary.ts:81-110"
---

## Summary

Images uploaded to Cloudinary are stored at full resolution and served back **without any width/quality transformation** in the `url` field stored in the database. The same `url` that serves the full-resolution hero image is also used verbatim for:

1. **Thumbnail filmstrip images** (64×56px visible area — serving a 800px+ wide original)
2. **`KosCard` property listings** (208px height — serving a full-resolution image)

The Cloudinary `upload_stream` configuration (lines 81–99, `cloudinary.ts`) only applies `fetch_format: 'auto'` and `quality: 'auto'` on upload, which affects the stored asset — but the `secure_url` returned is always the **full resolution canonical URL** like:
```
https://res.cloudinary.com/kosmo-bali/image/upload/v1/kosmo_properties/prop_xyz.webp
```

No responsive image parameters (`w_`, `h_`, `c_fill`, `dpr_auto`) are appended before storing in `property_photos.url`. This means the frontend always downloads the full-resolution image regardless of the display size.

For a 3MB full-resolution image displayed at 64×56px in a filmstrip, **99.9% of the downloaded bytes are discarded** by the browser's scaling algorithm.

## Severity

**High (Excessive Bandwidth Usage on Gallery Thumbnails)**

## Affected Files & Lines

- [`frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx:253–278`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx#L253-L278)
- [`backend/services/cloudinary.ts:81–110`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/backend/services/cloudinary.ts#L81-L110)

## Steps to Reproduce

1. Upload a high-resolution photo (≥1MB) to any property.
2. Open the Booking Modal for that property.
3. In DevTools → Network → Images, observe the thumbnail image request downloads the **same URL** and file size as the hero view.
4. Run Lighthouse → Performance → Opportunity: "Properly size images" — it will flag all thumbnails.

## Remediation / Proposed Approach

**Option A — Frontend URL transform** (zero backend changes):

Build a helper that appends Cloudinary transformation segments to the stored `url` for different contexts:

```typescript
function cloudinaryThumb(url: string, width = 128, height = 112): string {
  if (!url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`);
}

// In thumbnail filmstrip:
<img src={cloudinaryThumb(photo.url, 128, 112)} loading="lazy" decoding="async" />
```

**Option B — Store thumbnail variant URL** (backend change):

During upload, generate a second Cloudinary URL with thumbnail dimensions and store it as a separate `thumbnailUrl` column on `property_photos`.

Also add HTML `srcset` attribute for responsive DPR:

```tsx
<img
  src={cloudinaryThumb(photo.url, 128, 112)}
  srcSet={`${cloudinaryThumb(photo.url, 256, 224)} 2x`}
  loading="lazy"
  decoding="async"
/>
```
