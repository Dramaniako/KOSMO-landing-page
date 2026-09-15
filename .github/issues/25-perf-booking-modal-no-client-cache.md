---
title: "perf(frontend): BookingModal fetches rooms and photos on every property card click with no client-side cache"
labels: ["performance", "frontend", "ux", "medium-priority"]
severity: "Medium (Repeated Network Requests Delay Modal Opening)"
affected_files:
  - "frontend/src/components/BookingModal.tsx:74-124"
---

## Summary

Every time a user clicks a property card in the landing page, `BookingModal` fires **two fresh fetch requests** in its `useEffect`:

```typescript
// BookingModal.tsx:89-91
const [photosRes, roomsRes] = await Promise.all([
  fetch(`${API_BASE}/properties/${property.id}/photos`).catch(() => null),
  fetch(`${API_BASE}/properties/${property.id}/rooms`).catch(() => null)
]);
```

There is **zero client-side caching** of the fetched photos or rooms data. If a user:
- Opens a modal → closes it → reopens the same property's modal

…two fresh HTTP requests are made again, even though the data did not change. The backend cache (`apiCache`, 30-second TTL) prevents the DB from being hit again, but the **full HTTP round-trip, JSON parsing, and React state update cycle** still occurs on every modal open.

Additionally, both `photosLoading` and `roomsLoading` are set to `true` simultaneously, causing the entire modal body to show loading spinners rather than revealing static property information (name, price, facilities, description) that is already available in the `property` prop before the fetches resolve.

## Severity

**Medium (Repeated Network Requests Delay Modal Opening)**

## Affected Files & Lines

- [`frontend/src/components/BookingModal.tsx:74–124`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/frontend/src/components/BookingModal.tsx#L74-L124)

## Steps to Reproduce

1. Open Chrome DevTools → Network tab.
2. Click on a property card to open the Booking Modal.
3. Close the modal by clicking the backdrop or "X" button.
4. Click the same property card again.
5. Observe two new HTTP requests (`/photos` and `/rooms`) fire even though the data was just fetched seconds ago.

## Remediation / Proposed Approach

Implement a module-level `Map` (or React Context) keyed by `propertyId` to serve as a short-lived client-side cache:

```typescript
const clientPhotoCache = new Map<string, PropertyPhoto[]>();
const clientRoomCache = new Map<string, Room[]>();

// Inside useEffect:
if (clientPhotoCache.has(property.id)) {
  setPhotos(clientPhotoCache.get(property.id)!);
} else {
  // fetch and then store: clientPhotoCache.set(property.id, data);
}
```

Also decouple `photosLoading` and `roomsLoading` states so static modal content (name, price, description, facilities) renders immediately, with only the gallery and room grid sections showing skeleton loaders.
