---
title: "fix(security): Unauthenticated File Upload & CDN Quota Abuse on POST /api/upload"
labels: ["security","medium-priority","backend"]
severity: "Medium (CVSS 5.3)"
affected_files: ["backend/router.ts:128-149","api/index.js"]
---

## Summary
POST /api/upload lacks authenticateToken middleware. Anyone on the internet can POST multipart image files to upload to the Cloudinary CDN, exhausting storage quotas and bandwidth.

## Severity
**Medium (CVSS 5.3)**

## Affected Files & Lines
- `backend/router.ts:128-149`
- `api/index.js`

## Steps to Reproduce
1. Send unauthenticated POST /api/upload with image payload.
2. Cloudinary CDN uploads the asset and returns a valid public URL without auth.

## Remediation / Proposed Patch
```typescript
// backend/router.ts
router.post('/upload', authenticateToken, upload.single('image'), async (req: MulterRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Tidak ada file yang diunggah.' });
  }
  // proceed with image upload...
});
```
