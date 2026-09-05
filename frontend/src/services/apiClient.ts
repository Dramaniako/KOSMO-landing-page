export class ApiError extends Error {
  constructor(
    public override message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('token') || localStorage.getItem('kosmo_token');
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Only set Content-Type if not FormData (browser automatically sets multipart boundary)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (!res.ok) {
    let errorData: unknown;
    try {
      errorData = await res.json();
    } catch {
      errorData = await res.text().catch(() => null);
    }
    const message = (errorData && typeof errorData === 'object' && 'message' in errorData)
      ? String((errorData as { message: unknown }).message)
      : `HTTP ${res.status}: ${res.statusText}`;
    throw new ApiError(message, res.status, errorData);
  }

  return (await res.json()) as T;
}

export async function requestBlob(endpoint: string, options: RequestInit = {}): Promise<{ blob: Blob; filename?: string; contractHash?: string }> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    throw new ApiError(`Gagal mengunduh dokumen (HTTP ${res.status})`, res.status);
  }

  const contractHash = res.headers.get('X-Contract-Hash') || undefined;
  const contentDisposition = res.headers.get('Content-Disposition') || '';
  const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch ? filenameMatch[1] : undefined;
  const blob = await res.blob();

  return { blob, filename, contractHash };
}
