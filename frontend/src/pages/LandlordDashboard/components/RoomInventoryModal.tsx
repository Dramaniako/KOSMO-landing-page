import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Edit, Trash2, Check, AlertCircle, Wrench, BedDouble, Lock } from 'lucide-react';
import { Property, Room, DiscreteRoomStatus } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';
import { shimmerStyle } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export interface RoomInventoryModalProps {
  property: Property;
  onClose: () => void;
  onRoomUpdated: () => void;
}

interface NewRoomForm {
  roomNumber: string;
  floor: string;
  type: string;
  price: string;
  status: DiscreteRoomStatus;
}

export default function RoomInventoryModal({ property, onClose, onRoomUpdated }: RoomInventoryModalProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Floor filter
  const [selectedFloor, setSelectedFloor] = useState<string>('all');

  // Add Room form toggle & state
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [addForm, setAddForm] = useState<NewRoomForm>({
    roomNumber: '',
    floor: '1',
    type: 'Standard',
    price: '',
    status: 'available'
  });
  const [submittingAdd, setSubmittingAdd] = useState<boolean>(false);

  // Edit Room state
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NewRoomForm>({
    roomNumber: '',
    floor: '1',
    type: 'Standard',
    price: '',
    status: 'available'
  });
  const [submittingEdit, setSubmittingEdit] = useState<boolean>(false);

  // Delete Room password confirmation modal state
  const [deletingRoom, setDeletingRoom] = useState<Room | null>(null);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [submittingDelete, setSubmittingDelete] = useState<boolean>(false);

  // Toggling status loading tracker
  const [togglingRoomId, setTogglingRoomId] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/properties/${property.id}/rooms`);
      if (!res.ok) {
        throw new Error('Gagal memuat inventaris kamar.');
      }
      const data = (await res.json()) as Room[];
      setRooms(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memuat data kamar.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, [property.id]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Toggle Room Status between available and maintenance
  const handleToggleStatus = async (room: Room) => {
    if (room.status === 'occupied') {
      setErrorMsg('Kamar sedang terisi sewa aktif dan tidak dapat diubah statusnya.');
      return;
    }
    const nextStatus: DiscreteRoomStatus = room.status === 'available' ? 'maintenance' : 'available';
    setTogglingRoomId(room.id);
    setErrorMsg('');
    setSuccessMsg('');

    // Optimistic update
    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, status: nextStatus } : r)));

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/properties/${property.id}/rooms/${room.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status: nextStatus })
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message || 'Gagal mengubah status kamar.');
      }

      setSuccessMsg(`Status kamar ${room.roomNumber} diubah ke ${nextStatus === 'maintenance' ? 'Pemeliharaan' : 'Tersedia'}.`);
      onRoomUpdated();
    } catch (err: unknown) {
      // Revert optimistic update
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, status: room.status } : r)));
      const message = err instanceof Error ? err.message : 'Gagal mengubah status kamar.';
      setErrorMsg(message);
    } finally {
      setTogglingRoomId(null);
    }
  };

  // Add Room submit
  const handleAddRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.roomNumber.trim()) return;

    setSubmittingAdd(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const payload = {
        roomNumber: addForm.roomNumber.trim(),
        floor: parseInt(addForm.floor, 10) || 1,
        type: addForm.type.trim() || 'Standard',
        price: addForm.price ? parseFloat(addForm.price) : null,
        status: addForm.status
      };

      const res = await fetch(`${API_BASE}/properties/${property.id}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || 'Gagal menambahkan kamar baru.');
      }

      setSuccessMsg(`Kamar ${payload.roomNumber} berhasil ditambahkan!`);
      setShowAddForm(false);
      setAddForm({ roomNumber: '', floor: '1', type: 'Standard', price: '', status: 'available' });
      fetchRooms();
      onRoomUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menambahkan kamar.';
      setErrorMsg(message);
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Start edit room
  const handleStartEdit = (room: Room) => {
    setEditingRoomId(room.id);
    setEditForm({
      roomNumber: room.roomNumber,
      floor: String(room.floor),
      type: room.type,
      price: room.price !== null && room.price !== undefined ? String(room.price) : '',
      status: room.status
    });
  };

  // Save edit room
  const handleSaveEdit = async (roomId: string) => {
    setSubmittingEdit(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const payload = {
        roomNumber: editForm.roomNumber.trim(),
        floor: parseInt(editForm.floor, 10) || 1,
        type: editForm.type.trim() || 'Standard',
        price: editForm.price ? parseFloat(editForm.price) : null,
        status: editForm.status
      };

      const res = await fetch(`${API_BASE}/properties/${property.id}/rooms/${roomId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || 'Gagal menyimpan perubahan kamar.');
      }

      setSuccessMsg(`Kamar ${payload.roomNumber} berhasil diperbarui!`);
      setEditingRoomId(null);
      fetchRooms();
      onRoomUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal memperbarui kamar.';
      setErrorMsg(message);
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Delete room confirmation submit
  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingRoom || !deletePassword) return;

    setSubmittingDelete(true);
    setErrorMsg('');

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/properties/${property.id}/rooms/${deletingRoom.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ password: deletePassword })
      });

      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message || 'Gagal menghapus kamar.');
      }

      setSuccessMsg(`Kamar ${deletingRoom.roomNumber} berhasil dihapus.`);
      setDeletingRoom(null);
      setDeletePassword('');
      fetchRooms();
      onRoomUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus kamar.';
      setErrorMsg(message);
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Stats calculation
  const totalRoomsCount = rooms.length;
  const availableCount = rooms.filter((r) => r.status === 'available').length;
  const occupiedCount = rooms.filter((r) => r.status === 'occupied').length;
  const maintenanceCount = rooms.filter((r) => r.status === 'maintenance').length;

  // Available floors for filtering
  const floors = Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b);
  const filteredRooms =
    selectedFloor === 'all'
      ? rooms
      : rooms.filter((r) => String(r.floor) === selectedFloor);

  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }}>
      <div
        className="modal-container modal-content"
        data-testid="room-inventory-modal"
        style={{ maxWidth: '920px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <button className="modal-close" onClick={onClose} aria-label="Tutup Modal">
          <X size={18} />
        </button>

        <div style={{ padding: '28px' }}>
          {/* Header */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '22px', marginBottom: '4px' }}>
              Inventaris Kamar - {property.name}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {property.address} &bull; Harga Dasar Properti: <strong>{formatRupiah(property.price)}</strong> / bulan
            </p>
          </div>

          {/* Feedback Banners */}
          {errorMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#fef2f2', color: 'var(--danger)', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: 'var(--success)', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Summary Metric Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Total Kamar</span>
              <strong style={{ fontSize: '18px', color: 'var(--dark)' }}>{totalRoomsCount}</strong>
            </div>
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#ecfdf5', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--success)', display: 'block' }}>Tersedia</span>
              <strong style={{ fontSize: '18px', color: 'var(--success)' }}>{availableCount}</strong>
            </div>
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#eff6ff', border: '1px solid rgba(37, 99, 235, 0.2)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--primary)', display: 'block' }}>Terisi (Occupied)</span>
              <strong style={{ fontSize: '18px', color: 'var(--primary)' }}>{occupiedCount}</strong>
            </div>
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid rgba(245, 158, 11, 0.2)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--warning)', display: 'block' }}>Pemeliharaan</span>
              <strong style={{ fontSize: '18px', color: 'var(--warning)' }}>{maintenanceCount}</strong>
            </div>
          </div>

          {/* Controls Bar: Floor Filter + Add Room Button */}
          <div className="flex-between" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Filter Lantai:</span>
              <select
                className="form-select"
                style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
              >
                <option value="all">Semua Lantai ({rooms.length})</option>
                {floors.map((fl) => (
                  <option key={fl} value={String(fl)}>
                    Lantai {fl} ({rooms.filter((r) => r.floor === fl).length} Kamar)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              data-testid="add-room-btn"
              onClick={() => setShowAddForm(!showAddForm)}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              <Plus size={15} />
              {showAddForm ? 'Tutup Formulir' : 'Tambah Kamar'}
            </button>
          </div>

          {/* Add Room Collapsible Form */}
          {showAddForm && (
            <form onSubmit={handleAddRoomSubmit} style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '15px', marginBottom: '12px', color: 'var(--dark)' }}>Tambah Unit Kamar Baru</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Nomor Kamar</label>
                  <input
                    type="text"
                    name="roomNumber"
                    id="room-number-input"
                    className="form-input"
                    placeholder="Contoh: 101, 301"
                    value={addForm.roomNumber}
                    onChange={(e) => setAddForm({ ...addForm, roomNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Lantai</label>
                  <input
                    type="number"
                    name="floor"
                    id="room-floor-input"
                    className="form-input"
                    min="0"
                    value={addForm.floor}
                    onChange={(e) => setAddForm({ ...addForm, floor: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Tipe Kamar</label>
                  <input
                    type="text"
                    name="type"
                    id="room-type-input"
                    className="form-input"
                    placeholder="Contoh: Deluxe, Studio"
                    value={addForm.type}
                    onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>Harga Khusus (Opsional)</label>
                  <input
                    type="number"
                    name="price"
                    id="room-price-input"
                    className="form-input"
                    placeholder={`Dasar: ${property.price}`}
                    value={addForm.price}
                    onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-outline" style={{ padding: '6px 14px' }} onClick={() => setShowAddForm(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: '6px 16px' }} disabled={submittingAdd}>
                  {submittingAdd ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          )}

          {/* Rooms Inventory Table */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: '60px', ...shimmerStyle }} />
              ))}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <BedDouble size={36} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <p style={{ fontSize: '14px' }}>Belum ada kamar yang terdaftar pada lantai ini.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 12px' }}>Kamar</th>
                    <th style={{ padding: '10px 12px' }}>Lantai</th>
                    <th style={{ padding: '10px 12px' }}>Tipe</th>
                    <th style={{ padding: '10px 12px' }}>Harga Sewa</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRooms.map((room) => {
                    const isEditing = editingRoomId === room.id;
                    const isOccupied = room.status === 'occupied';
                    const isMaintenance = room.status === 'maintenance';
                    const effectivePrice = room.effectivePrice || (room.price ? room.price : property.price);

                    return (
                      <tr key={room.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        {isEditing ? (
                          <>
                            <td style={{ padding: '10px 12px' }}>
                              <input
                                type="text"
                                name="roomNumber"
                                id="room-number-input"
                                className="form-input"
                                style={{ padding: '6px 10px', fontSize: '13px' }}
                                value={editForm.roomNumber}
                                onChange={(e) => setEditForm({ ...editForm, roomNumber: e.target.value })}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <input
                                type="number"
                                name="floor"
                                id="room-floor-input"
                                className="form-input"
                                style={{ width: '60px', padding: '6px 10px', fontSize: '13px' }}
                                value={editForm.floor}
                                onChange={(e) => setEditForm({ ...editForm, floor: e.target.value })}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <input
                                type="text"
                                name="type"
                                id="room-type-input"
                                className="form-input"
                                style={{ padding: '6px 10px', fontSize: '13px' }}
                                value={editForm.type}
                                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <input
                                type="number"
                                name="price"
                                id="room-price-input"
                                className="form-input"
                                style={{ padding: '6px 10px', fontSize: '13px' }}
                                value={editForm.price}
                                onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                                placeholder={`Dasar: ${property.price}`}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span className={`badge ${room.status === 'available' ? 'badge-success' : room.status === 'occupied' ? 'badge-primary' : 'badge-warning'}`}>
                                {room.status === 'available' ? 'Tersedia' : room.status === 'occupied' ? 'Terisi' : 'Pemeliharaan'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ padding: '4px 10px', fontSize: '12px' }}
                                  onClick={() => handleSaveEdit(room.id)}
                                  disabled={submittingEdit}
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  style={{ padding: '4px 10px', fontSize: '12px' }}
                                  onClick={() => setEditingRoomId(null)}
                                >
                                  Batal
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '12px' }}>
                              <strong style={{ fontSize: '14px', color: 'var(--dark)' }}>{room.roomNumber}</strong>
                            </td>
                            <td style={{ padding: '12px' }}>Lantai {room.floor}</td>
                            <td style={{ padding: '12px' }}>{room.type}</td>
                            <td style={{ padding: '12px', fontWeight: 600, color: 'var(--primary)' }}>
                              {formatRupiah(effectivePrice)}
                              {room.price && room.price !== property.price && (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                                  (Kustom)
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {room.status === 'available' && (
                                <span className="badge badge-success">Tersedia</span>
                              )}
                              {room.status === 'occupied' && (
                                <span className="badge badge-primary">
                                  <Lock size={11} style={{ marginRight: '2px' }} />
                                  Terisi
                                </span>
                              )}
                              {room.status === 'maintenance' && (
                                <span className="badge badge-warning">
                                  <Wrench size={11} style={{ marginRight: '2px' }} />
                                  Pemeliharaan
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                {/* Toggle Status Button */}
                                {!isOccupied ? (
                                  <button
                                    type="button"
                                    className="btn btn-outline"
                                    data-testid={`toggle-status-room-${room.roomNumber}`}
                                    style={{ padding: '5px 10px', fontSize: '12px' }}
                                    onClick={() => handleToggleStatus(room)}
                                    disabled={togglingRoomId === room.id}
                                    title={isMaintenance ? 'Ubah status ke Tersedia' : 'Ubah status ke Pemeliharaan'}
                                  >
                                    {isMaintenance ? 'Tersedia' : 'Pemeliharaan'}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '5px 8px' }}>
                                    Tersewa
                                  </span>
                                )}

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  className="btn btn-outline"
                                  data-testid={`edit-room-${room.roomNumber}`}
                                  style={{ padding: '5px 8px' }}
                                  onClick={() => handleStartEdit(room)}
                                  title="Edit Kamar"
                                >
                                  <Edit size={13} />
                                </button>

                                {/* Delete Button */}
                                {!isOccupied && (
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    data-testid={`delete-room-${room.roomNumber}`}
                                    style={{ padding: '5px 8px' }}
                                    onClick={() => setDeletingRoom(room)}
                                    title="Hapus Kamar"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete Room Password Gate Modal */}
      {deletingRoom && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-container" style={{ maxWidth: '400px', padding: '24px' }}>
            <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>
              Hapus Kamar {deletingRoom.roomNumber}
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Tindakan ini permanen. Masukkan password akun Anda untuk mengonfirmasi penghapusan kamar.
            </p>
            <form onSubmit={handleDeleteSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Password akun"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex-between">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setDeletingRoom(null);
                    setDeletePassword('');
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={submittingDelete}
                >
                  {submittingDelete ? 'Menghapus...' : 'Ya, Hapus Kamar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
