---
title: "bug(frontend): Silent Failure & Missing Error Alert when Midtrans Snap Script Fails to Load"
labels: ["bug","frontend","high-priority"]
severity: "High (User Experience)"
affected_files: ["frontend/src/pages/LandingPage.tsx:347-357"]
---

## Summary
In handleProcessPayment, if window.snap is undefined (e.g. script blocked by browser extension), the application silently redirects the user to /tenant without error feedback, leaving the booking unpaid.

## Severity
**High (User Experience)**

## Affected Files & Lines
- `frontend/src/pages/LandingPage.tsx:347-357`

## Steps to Reproduce
1. Block external Midtrans Snap script.
2. Click "Bayar" on checkout.
3. Notice silent redirect with no error feedback.

## Remediation / Proposed Patch
```typescript
if (typeof window === 'undefined' || !window.snap) {
  setActiveRentalError(
    t('modal.paymentGatewayUnavailable') ||
    'Gateway pembayaran Midtrans tidak dapat dimuat. Harap matikan ad-blocker atau muat ulang halaman.'
  );
  setPaymentProcessing(false);
  return;
}
```
