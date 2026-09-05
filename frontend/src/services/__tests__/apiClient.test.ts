import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request, requestBlob, ApiError } from '../apiClient';
import { roomsApi } from '../roomsApi';
import { photosApi } from '../photosApi';

describe('Shared API Client Layer Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('injects Bearer authorization header when token is in localStorage', async () => {
    localStorage.setItem('token', 'test-token-jwt-123');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' })
    });
    global.fetch = mockFetch;

    const result = await request<{ data: string }>('/test-endpoint');

    expect(result).toEqual({ data: 'ok' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledHeaders = mockFetch.mock.calls[0][1].headers;
    expect(calledHeaders.get('Authorization')).toBe('Bearer test-token-jwt-123');
  });

  it('throws ApiError with server error message on non-200 responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Invalid room floor parameter' })
    });
    global.fetch = mockFetch;

    await expect(request('/rooms')).rejects.toThrow('Invalid room floor parameter');
  });

  it('roomsApi.getRooms issues GET request with correct filter query params', async () => {
    const mockRooms = [
      { id: 'room-1', propertyId: 'prop-1', roomNumber: '101', floor: 1, status: 'available' }
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRooms)
    });
    global.fetch = mockFetch;

    const res = await roomsApi.getRooms('prop-1', 'available');
    expect(res).toEqual(mockRooms);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/properties/prop-1/rooms?status=available'),
      expect.anything()
    );
  });

  it('photosApi.getPhotos passes category and roomId query params', async () => {
    const mockPhotos = [
      { id: 'photo-1', propertyId: 'prop-1', photoUrl: 'https://example.com/p.jpg', category: 'bedroom', isCover: true, displayOrder: 0 }
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPhotos)
    });
    global.fetch = mockFetch;

    const res = await photosApi.getPhotos('prop-1', 'bedroom', 'room-1');
    expect(res).toEqual(mockPhotos);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/properties/prop-1/photos?category=bedroom&roomId=room-1'),
      expect.anything()
    );
  });

  it('requestBlob parses X-Contract-Hash and Content-Disposition headers', async () => {
    const mockBlob = new Blob(['pdf-data'], { type: 'application/pdf' });
    const mockHeaders = new Headers({
      'X-Contract-Hash': 'sha256-hash-abc',
      'Content-Disposition': 'attachment; filename="contract_test.pdf"'
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: mockHeaders,
      blob: () => Promise.resolve(mockBlob)
    });

    const result = await requestBlob('/rentals/rent-1/contract?download=true');
    expect(result.contractHash).toBe('sha256-hash-abc');
    expect(result.filename).toBe('contract_test.pdf');
    expect(result.blob).toBe(mockBlob);
  });
});
