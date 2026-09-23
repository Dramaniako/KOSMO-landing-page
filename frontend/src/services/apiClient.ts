/**
 * KOSMO Resilient API Client Layer
 * Standardized API client with structured error mapping, retry resilience, and correlation tracking.
 */

export class ApiError extends Error {
  public code?: string;
  public details?: unknown;
  public requestId?: string;
  public timestamp?: string;

  constructor(
    public override message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';

    // Parse structured RFC 7807 / KOSMO error attributes
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (typeof record.code === 'string') {
        this.code = record.code;
      }
      if (typeof record.requestId === 'string') {
        this.requestId = record.requestId;
      }
      if (typeof record.timestamp === 'string') {
        this.timestamp = record.timestamp;
      }
      if (record.details !== undefined) {
        this.details = record.details;
      } else if (record.errors !== undefined) {
        this.details = record.errors;
      }
    }
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('token') || localStorage.getItem('kosmo_token');
}

/**
 * Type guard for ApiError
 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Extracts human-readable message from any error, with safe fallback.
 */
export function getErrorMessage(error: unknown, fallback = 'Terjadi kesalahan sistem.'): string {
  if (isApiError(error)) {
    return error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

/**
 * Checks if error is a network or connectivity error.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return true;
  }
  if (isApiError(error) && (error.status === 0 || error.status === 503 || error.status === 504)) {
    return true;
  }
  return false;
}

/**
 * Checks if error is an authentication error (401 / 403).
 */
export function isAuthError(error: unknown): boolean {
  if (isApiError(error)) {
    return error.status === 401 || error.status === 403;
  }
  return false;
}

/**
 * Executes an HTTP fetch request with timeout, correlation ID, and error normalization.
 */
export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
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

  let abortController: AbortController | undefined;
  let timeoutId: NodeJS.Timeout | undefined;

  if (options.timeoutMs && options.timeoutMs > 0) {
    abortController = new AbortController();
    timeoutId = setTimeout(() => abortController?.abort(), options.timeoutMs);
  }

  try {
    const fetchOptions: RequestInit = {
      ...options,
      headers,
      signal: abortController ? abortController.signal : options.signal
    };

    const res = await fetch(url, fetchOptions);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

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
  } catch (err: unknown) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(`Permintaan waktu habis (${options.timeoutMs}ms).`, 408);
    }
    throw err;
  }
}

/**
 * Executes a request with automatic exponential-backoff retry for idempotent requests on network blips.
 */
export async function requestWithRetry<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelay = options.retryDelayMs ?? 500;
  const isIdempotent = !options.method || options.method.toUpperCase() === 'GET';

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await request<T>(endpoint, options);
    } catch (err) {
      lastError = err;
      if (!isIdempotent || attempt === retries || !isNetworkError(err)) {
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function requestBlob(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ blob: Blob; filename?: string; contractHash?: string }> {
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
