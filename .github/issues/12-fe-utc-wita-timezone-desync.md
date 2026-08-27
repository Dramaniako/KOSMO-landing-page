---
title: "bug(frontend): Local Timezone Desynchronization in Date Picker (UTC vs WITA GMT+8)"
labels: ["bug","frontend","medium-priority"]
severity: "Medium (User Experience)"
affected_files: ["frontend/src/components/BookingModal.tsx:63-66"]
---

## Summary
startDate initializes using new Date().toISOString().split("T")[0]. In Bali (WITA / UTC+8), accessing the booking modal between 00:00 and 07:59 WITA causes toISOString() to return yesterday UTC date, causing backend validation rejection.

## Severity
**Medium (User Experience)**

## Affected Files & Lines
- `frontend/src/components/BookingModal.tsx:63-66`

## Steps to Reproduce
1. Set system clock to 2026-08-28 02:00:00 WITA (UTC+8).
2. Open booking modal.
3. Start date defaults to yesterday 2026-08-27 in UTC.

## Remediation / Proposed Patch
```typescript
const [startDate, setStartDate] = useState<string>(() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});
```
