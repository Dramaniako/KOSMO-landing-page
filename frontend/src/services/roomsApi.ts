import { request } from './apiClient';
import { Room, DiscreteRoomStatus } from '../types/index';

export interface CreateRoomDto {
  roomNumber: string;
  floor: number;
  type?: string;
  price?: number | null;
  status?: DiscreteRoomStatus;
}

export interface UpdateRoomDto {
  roomNumber?: string;
  floor?: number;
  type?: string;
  price?: number | null;
  status?: DiscreteRoomStatus;
}

export const roomsApi = {
  getRooms: (propertyId: string, status: 'all' | 'available' | 'occupied' | 'maintenance' = 'all') =>
    request<Room[]>(`/properties/${propertyId}/rooms?status=${status}`),

  getRoom: (roomId: string) =>
    request<Room>(`/rooms/${roomId}`),

  createRoom: (propertyId: string, data: CreateRoomDto) =>
    request<Room>(`/properties/${propertyId}/rooms`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  updateRoom: (propertyId: string, roomId: string, data: UpdateRoomDto) =>
    request<Room>(`/properties/${propertyId}/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  updateRoomStatus: (propertyId: string, roomId: string, status: 'available' | 'maintenance') =>
    request<Room>(`/properties/${propertyId}/rooms/${roomId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    }),

  deleteRoom: (propertyId: string, roomId: string, password?: string) =>
    request<{ success: boolean; message: string }>(`/properties/${propertyId}/rooms/${roomId}`, {
      method: 'DELETE',
      body: JSON.stringify({ password })
    })
};
