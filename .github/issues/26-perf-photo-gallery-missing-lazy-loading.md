---
title: "perf(frontend): PropertyPhotoGallery hero image and all thumbnails lack loading=\"lazy\" and decoding=\"async\" — blocks initial paint"
labels: ["performance", "frontend", "images", "high-priority"]
severity: "High (Blocks LCP — Largest Contentful Paint)"
affected_files:
  - "frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx:186-193"
  - "frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx:253-278"
---

## Summary

The `PropertyPhotoGallery` component renders the **hero image and all thumbnail filmstrip images as eager, synchronously decoded `<img>` tags** — no `loading="lazy"`, no `decoding="async"`, no `fetchpriority` hints.

**Hero image (line 187–193):**
```tsx
<img
  src={currentPhoto.url}
  alt={currentPhoto.caption || currentPhoto.category}
  className="w-full h-full object-cover ..."
  onClick={() => setLightboxOpen(true)}
/>
```
No `loading` attribute → browser defaults to `eager`, which **blocks the main thread** while the full-resolution Cloudinary image downloads. At 1–3MB per image (JPEG from Cloudinary before WebP transformation hits), this is a significant LCP blocker inside the modal.

**Thumbnail filmstrip (lines 253–278):**
```tsx
<img
  src={photo.url}
  alt={photo.caption || `Thumbnail ${idx + 1}`}
  className="w-full h-full object-cover"
/>
```
All thumbnails are loaded eagerly and without `decoding="async"`, even thumbnails 5–20 that are off-screen in the horizontal scroll area. This means the browser fetches all full-resolution Cloudinary URLs simultaneously, creating a waterfall of 10–20 competing image requests when the modal opens.

In contrast, `KosCard.tsx` correctly uses `loading="lazy"` and `decoding="async"` on its property card thumbnail.

## Severity

**High (Blocks LCP — Largest Contentful Paint)**

## Affected Files & Lines

- [`frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx:186–193`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx#L186-L193)
- [`frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx:253–278`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/frontend/src/components/BookingModal/components/PropertyPhotoGallery.tsx#L253-L278)

## Steps to Reproduce

1. Open Chrome DevTools → Network tab (set throttling to Fast 3G).
2. Click any property card to open the Booking Modal.
3. Observe the Network waterfall — all photo URLs fire simultaneously as the modal opens.
4. Lighthouse performance audit will show LCP ≥ 3s when the modal includes a high-resolution hero photo.

## Remediation / Proposed Approach

Add `loading`, `decoding`, and `fetchpriority` attributes:

```tsx
{/* Hero — should load with high priority */}
<img
  src={currentPhoto.url}
  alt={currentPhoto.caption || currentPhoto.category}
  className="w-full h-full object-cover ..."
  loading="eager"
  decoding="async"
  fetchPriority="high"
/>

{/* Thumbnails — should be lazy */}
<img
  src={photo.url}
  alt={photo.caption || `Thumbnail ${idx + 1}`}
  className="w-full h-full object-cover"
  loading="lazy"
  decoding="async"
/>
```

Additionally, consider using Cloudinary's URL transformation API to serve correctly-sized thumbnails (e.g., `w_128,h_112,c_fill,q_auto,f_auto`) instead of full-resolution images for the filmstrip.
