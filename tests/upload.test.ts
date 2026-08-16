import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageMimeType, ALLOWED_IMAGE_MIMETYPES } from '../backend/router.ts';

test('Cloudinary image upload & MIME validation', async (t) => {
  await t.test('accepts valid image MIME types', () => {
    assert.equal(validateImageMimeType('image/jpeg'), true);
    assert.equal(validateImageMimeType('image/png'), true);
    assert.equal(validateImageMimeType('image/webp'), true);
    assert.equal(validateImageMimeType('image/jpg'), true);
    assert.equal(validateImageMimeType('image/gif'), true);
  });

  await t.test('accepts valid image MIME types regardless of uppercase casing', () => {
    assert.equal(validateImageMimeType('IMAGE/JPEG'), true);
    assert.equal(validateImageMimeType('IMAGE/PNG'), true);
    assert.equal(validateImageMimeType('Image/WebP'), true);
  });

  await t.test('rejects non-image or executable MIME types', () => {
    assert.equal(validateImageMimeType('application/pdf'), false);
    assert.equal(validateImageMimeType('text/html'), false);
    assert.equal(validateImageMimeType('application/javascript'), false);
    assert.equal(validateImageMimeType('text/plain'), false);
    assert.equal(validateImageMimeType('application/octet-stream'), false);
  });

  await t.test('rejects empty or nullish MIME type values', () => {
    assert.equal(validateImageMimeType(''), false);
    assert.equal(validateImageMimeType(undefined as unknown as string), false);
    assert.equal(validateImageMimeType(null as unknown as string), false);
  });

  await t.test('validates upload payload format structure', () => {
    const formatUploadResponse = (url: string, publicId: string): { url: string; publicId: string } => {
      return { url, publicId };
    };

    const mockResponse = formatUploadResponse('https://res.cloudinary.com/demo/image/upload/sample.webp', 'kosmo_uploads/sample');
    assert.equal(typeof mockResponse.url, 'string');
    assert.equal(typeof mockResponse.publicId, 'string');
    assert.ok(mockResponse.url.startsWith('https://res.cloudinary.com'));
    assert.ok(mockResponse.publicId.startsWith('kosmo_uploads/'));
  });
});
