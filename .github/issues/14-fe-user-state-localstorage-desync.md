---
title: "bug(frontend): User Profile & Preferences Desynchronization across Components & localStorage"
labels: ["bug","frontend","medium-priority"]
severity: "Medium (State Management)"
affected_files: ["frontend/src/pages/TenantDashboard.tsx:787-826","frontend/src/context/LanguageContext.tsx:424-442"]
---

## Summary
When a tenant updates notification settings or language in TenantDashboard, PUT /api/users/profile/:id is called but local currentUser state and localStorage.getItem("user") are not synchronized with the server response.

## Severity
**Medium (State Management)**

## Affected Files & Lines
- `frontend/src/pages/TenantDashboard.tsx:787-826`
- `frontend/src/context/LanguageContext.tsx:424-442`

## Steps to Reproduce
1. Toggle notifications in TenantDashboard.
2. Switch tabs to rentals and back.
3. Checkbox reverts because currentUser was not updated.

## Remediation / Proposed Patch
```typescript
Synchronize currentUser and localStorage with the returned updated user object upon successful PUT.
```
