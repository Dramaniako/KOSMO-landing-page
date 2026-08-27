---
title: "fix(tenant): Payment Resumption Modal Lingering Behind Midtrans Snap & State Sync"
labels: ["bug","ui","frontend","tenant-dashboard","payment"]
severity: "Medium"
affected_files: ["frontend/src/pages/TenantDashboard.tsx"]
---

## Summary
When resuming payment from the Tenant Dashboard ("Riwayat & Transaksi Sewa" -> "Bayar Sekarang"), the KOSMO payment confirmation modal remained active in the background when the Midtrans Snap modal opened. After finishing payment, the user had to manually close the info modal before the active lease status updated in "Hunian Aktif Saya".

## Severity
**Medium (UX / State Synchronization)**

## Affected Files & Lines
- `frontend/src/pages/TenantDashboard.tsx:165-225`

## Steps to Reproduce
1. Sign a digital rental contract and leave the initial payment popup uncompleted.
2. Go to Tenant Dashboard -> "Kos Saya (Sewa)".
3. Click "Bayar Sekarang" on the pending rental.
4. Click "Bayar Sekarang" inside the confirmation modal.
5. Complete payment in Midtrans Snap.
6. Notice the confirmation modal remained open over the dashboard instead of automatically closing and immediately rendering the active room in "Hunian Aktif Saya".

## Remediation / Proposed Patch
1. Dismiss `showPendingPaymentModal` immediately upon launching `window.snap.pay`.
2. On `onSuccess`, invoke `POST /api/payment/finish` and refresh `fetchMyRentals` so the active tenancy transitions instantly without requiring manual modal dismissal.
