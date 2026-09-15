---
title: "perf(frontend): Active rental check fires an unawaited fetch on every property card click — blocks modal responsiveness"
labels: ["performance", "frontend", "ux", "medium-priority"]
severity: "Medium (Delayed Modal UX — Unrelated Fetch on Card Click)"
affected_files:
  - "frontend/src/pages/LandingPage.tsx:206-238"
---

## Summary

`handleOpenDetail` in `LandingPage.tsx` is triggered every time a user clicks any property card. Inside it, a **`fetch` to `/api/rentals?tenantId=...`** is dispatched unconditionally for every logged-in tenant:

```typescript
// LandingPage.tsx:218-234
fetch(`${API_BASE}/rentals?tenantId=${encodeURIComponent(currentUser.id)}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {}
})
  .then(async (res) => { ... })
  .then((data: unknown) => {
    const hasActive = data.some((r) => r.status === 'active');
    setHasActiveRental(hasActive);
  })
  .catch(console.error);
```

Problems with this pattern:

1. **Every card click triggers a new fetch** — if a tenant clicks 5 different properties, 5 identical `GET /api/rentals?tenantId=X` requests are dispatched.
2. **There is no abort controller** — if the modal is closed and reopened quickly, multiple inflight requests compete and the last response wins, potentially causing stale state.
3. **The rental list is fetched on every open** even though the active rental status is extremely unlikely to change between two card clicks in the same session.
4. **The result is ephemeral** — it is stored in `hasActiveRental` React state that resets to `false` when the modal closes, requiring a fresh fetch on every reopen.

This results in unnecessary API load and delays the settling of the `isBookDisabled` button state in the modal.

## Severity

**Medium (Delayed Modal UX — Unrelated Fetch on Card Click)**

## Affected Files & Lines

- [`frontend/src/pages/LandingPage.tsx:206–238`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/frontend/src/pages/LandingPage.tsx#L206-L238)

## Steps to Reproduce

1. Log in as a tenant with an active rental.
2. Open Chrome DevTools → Network tab.
3. Click three different property cards in quick succession.
4. Observe three separate `GET /api/rentals?tenantId=...` requests fire within seconds.
5. There are no deduplication, debounce, or caching mechanisms between them.

## Remediation / Proposed Approach

Cache the rental status result in a module-level variable or `useRef` with a short TTL (e.g., 60 seconds) to avoid repeat fetches:

```typescript
let rentalStatusCache: { hasActive: boolean; fetchedAt: number } | null = null;
const RENTAL_CACHE_TTL_MS = 60_000;

// Inside handleOpenDetail:
const now = Date.now();
if (rentalStatusCache && now - rentalStatusCache.fetchedAt < RENTAL_CACHE_TTL_MS) {
  setHasActiveRental(rentalStatusCache.hasActive);
} else {
  // Fetch and then: rentalStatusCache = { hasActive, fetchedAt: Date.now() };
}
```

Also add an `AbortController` to cancel inflight requests when the modal is closed before the fetch resolves:

```typescript
const controller = new AbortController();
fetch(url, { signal: controller.signal, headers });
// cleanup: controller.abort();
```
