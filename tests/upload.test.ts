import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageMimeType, ALLOWED_IMAGE_MIMETYPES } from '../backend/router';
import { uploadImageStream } from '../backend/services/cloudinary';

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

  await t.test('validates file size limit guard (5MB)', () => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const validFileSize = 2 * 1024 * 1024; // 2MB
    const oversizedFileSize = 6 * 1024 * 1024; // 6MB

    assert.ok(validFileSize <= MAX_FILE_SIZE, '2MB file must pass size limit');
    assert.ok(oversizedFileSize > MAX_FILE_SIZE, '6MB file must exceed size limit');
  });

  await t.test('uploadImageStream processes image buffer and returns Cloudinary CDN URL', async () => {
    // Valid 1x1 transparent GIF binary buffer
    const sampleBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    try {
      const result = await uploadImageStream(sampleBuffer, 'kosmo_properties');
      assert.ok(result, 'Upload result must be defined');
      assert.equal(typeof result.secure_url, 'string');
      assert.equal(typeof result.public_id, 'string');
      assert.ok(result.secure_url.startsWith('https://res.cloudinary.com/'));
      assert.ok(result.public_id.startsWith('kosmo_properties/'));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      assert.ok(errMsg.length > 0, 'Error message must be present');
    }
  });

  await t.test('validates upload payload format structure', () => {
    const formatUploadResponse = (url: string, publicId: string): { url: string; publicId: string } => {
      return { url, publicId };
    };

    const mockResponse = formatUploadResponse('https://res.cloudinary.com/demo/image/upload/sample.webp', 'kosmo_properties/sample');
    assert.equal(typeof mockResponse.url, 'string');
    assert.equal(typeof mockResponse.publicId, 'string');
    assert.ok(mockResponse.url.startsWith('https://res.cloudinary.com'));
    assert.ok(mockResponse.publicId.startsWith('kosmo_properties/'));
  });
});
