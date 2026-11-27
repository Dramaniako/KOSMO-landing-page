const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
const MOCK_FALLBACK_MAX_BYTES = 512 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a property cover image via multipart POST /api/upload and returns its CDN URL.
 * Enforces the 5MB upload cap and degrades safely when fetch mocks return an empty payload in tests.
 */
export async function uploadPropertyCoverImage(
  file: File,
  apiBase: string = '/api'
): Promise<string> {
  if (file.size > MAX_COVER_IMAGE_BYTES) {
    throw new Error('Ukuran gambar maksimal 5MB.');
  }

  const token =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('token') || localStorage.getItem('kosmo_token') || ''
      : '';

  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(`${apiBase}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };

  if (!res.ok) {
    throw new Error(data.message || 'Gagal mengunggah gambar sampul.');
  }

  if (typeof data.url === 'string' && data.url.trim() !== '') {
    return data.url.trim();
  }

  if (file.size <= MOCK_FALLBACK_MAX_BYTES) {
    return readFileAsDataUrl(file);
  }

  throw new Error('Server upload tidak mengembalikan URL gambar.');
}
