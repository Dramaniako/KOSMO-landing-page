---
title: "perf(frontend): RoomSelectionGrid renders all room cards with no virtualization — DOM bloat with large room inventories"
labels: ["performance", "frontend", "rendering", "low-priority"]
severity: "Low (DOM Bloat on Large Room Inventories)"
affected_files:
  - "frontend/src/components/BookingModal/components/RoomSelectionGrid.tsx:128-222"
---

## Summary

`RoomSelectionGrid` renders **all room cards for the active floor tab into the DOM at once** without any virtualization or windowing. The grid container has a fixed height with `overflow-y: auto` scroll (`max-h-64`), but all `<button>` room cards outside the visible scroll area are still fully rendered in the DOM:

```tsx
// RoomSelectionGrid.tsx:128-222
<div
  data-testid="room-selection-grid"
  className="room-grid-container grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin"
>
  {displayedRooms.map((room) => {
    // All rooms rendered, including those below the fold
    return <button key={room.id} ...>...</button>;
  })}
</div>
```

For properties with 20+ rooms on a single floor (e.g., `totalRooms = 30`, floor tab shows 30 cards), this creates 30 fully-rendered DOM nodes inside a 256px-tall scroll container that shows only ~6 cards at a time. Each card contains multiple child elements, status badges, and price formatting.

While `useMemo` is used for floor filtering, **there is no `React.memo` on individual room cards**, so switching the floor tab re-renders every visible card unconditionally. The `rooms` array is a new reference on each parent render, triggering the `useMemo` to recompute.

At 50+ rooms, React's reconciliation of 150+ DOM nodes on a 60fps scroll inside a modal becomes a measurable jank source.

## Severity

**Low (DOM Bloat on Large Room Inventories)**

## Affected Files & Lines

- [`frontend/src/components/BookingModal/components/RoomSelectionGrid.tsx:128–222`](file:///d:/Project/KOSMO_WEB_MOBILE/KOSMO-landing-page/frontend/src/components/BookingModal/components/RoomSelectionGrid.tsx#L128-L222)

## Steps to Reproduce

1. Use a property with 30+ rooms across a single floor (modify DB or use the landlord dashboard to add rooms).
2. Open the Booking Modal for that property.
3. Use React DevTools → Profiler to record a floor tab switch.
4. Observe all 30 room card components re-rendering on tab switch even if their individual props did not change.
5. Check DOM Inspector: all 30 `<button>` elements are in the DOM even though only ~6 are visible.

## Remediation / Proposed Approach

1. **Wrap individual room card render in `React.memo`** (or extract to a named `RoomCard` component wrapped in `memo`) to prevent re-renders when `selectedRoom`, `activeFloor`, and room data haven't changed for a given card.

2. **Add a `LIMIT` to the floor-filtered list** for initial render (e.g., show 18 rooms, add "Show more" pagination) to cap the initial DOM count.

3. For large inventories (50+ rooms), integrate a lightweight virtual list library like `react-window` or implement intersection-observer-based lazy rendering within the fixed-height container.
