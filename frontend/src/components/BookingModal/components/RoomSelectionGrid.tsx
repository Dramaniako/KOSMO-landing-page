import React, { useState, useMemo } from 'react';
import { DoorOpen, CheckCircle, Lock, Wrench, Sparkles } from 'lucide-react';
import { Room } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';

export interface RoomSelectionGridProps {
  rooms: Room[];
  selectedRoom: Room | null;
  onSelectRoom: (room: Room) => void;
  basePrice: number;
  loading?: boolean;
}

export const RoomSelectionGrid: React.FC<RoomSelectionGridProps> = ({
  rooms,
  selectedRoom,
  onSelectRoom,
  basePrice,
  loading = false
}) => {
  // Extract unique floor numbers
  const uniqueFloors = useMemo(() => {
    const floorSet = new Set(rooms.map((r) => r.floor));
    return Array.from(floorSet).sort((a, b) => a - b);
  }, [rooms]);

  // Default active floor: Floor 1 if available, otherwise lowest floor, or 'all'
  const [activeFloor, setActiveFloor] = useState<string | number>(() => {
    if (uniqueFloors.includes(1)) return 1;
    return uniqueFloors.length > 0 ? uniqueFloors[0] : 'all';
  });

  // Calculate available rooms count per floor
  const floorCounts = useMemo(() => {
    const counts: Record<string | number, number> = {};
    for (const floor of uniqueFloors) {
      counts[floor] = rooms.filter((r) => r.floor === floor && r.status === 'available').length;
    }
    return counts;
  }, [rooms, uniqueFloors]);

  // Filter rooms based on active floor tab
  const displayedRooms = useMemo(() => {
    if (activeFloor === 'all') {
      return rooms;
    }
    return rooms.filter((r) => r.floor === Number(activeFloor));
  }, [rooms, activeFloor]);

  if (loading) {
    return (
      <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse flex items-center justify-center gap-2 text-slate-400 text-xs">
        <Sparkles size={16} className="animate-spin" /> Memuat daftar kamar...
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-center text-xs font-medium text-amber-800 dark:text-amber-300">
        Belum ada kamar yang tersedia saat ini.
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DoorOpen size={18} className="text-blue-600" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Pilih Unit Kamar
          </h4>
        </div>
        <span className="text-xs text-slate-500">
          {rooms.filter((r) => r.status === 'available').length} kamar tersedia
        </span>
      </div>

      {/* Floor Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          data-testid="floor-tab-all"
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeFloor === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          onClick={() => setActiveFloor('all')}
        >
          Semua Lantai
        </button>

        {uniqueFloors.map((floor) => {
          const availCount = floorCounts[floor] ?? 0;
          const label = floor === 0 ? 'Lantai 0 (Ground)' : `Lantai ${floor}`;
          const isSelected = activeFloor === floor;

          return (
            <button
              key={floor}
              type="button"
              data-testid={`floor-tab-${floor}`}
              data-floor={floor}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              onClick={() => setActiveFloor(floor)}
            >
              <span>{label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                ({availCount})
              </span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Room Card Grid */}
      <div
        data-testid="room-selection-grid"
        className="room-grid-container grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin"
      >
        {displayedRooms.map((room) => {
          const isSelected = selectedRoom?.id === room.id;
          const isAvailable = room.status === 'available';
          const isOccupied = room.status === 'occupied';
          const isMaintenance = room.status === 'maintenance';
          const effectivePrice =
            room.effectivePrice ?? (room.price ? room.price : basePrice);
          const hasCustomPrice =
            Boolean(room.price) && room.price !== basePrice;

          return (
            <button
              key={room.id}
              type="button"
              data-testid={`room-card-${room.roomNumber}`}
              data-status={room.status}
              disabled={!isAvailable}
              aria-disabled={!isAvailable}
              className={`room-card room-item text-left p-3 rounded-xl border transition-all relative flex flex-col justify-between ${
                isSelected
                  ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/30'
                  : isAvailable
                  ? 'border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-850 hover:border-blue-400 cursor-pointer shadow-sm hover:shadow'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60 opacity-60 cursor-not-allowed'
              }`}
              onClick={() => {
                if (isAvailable) {
                  onSelectRoom(room);
                }
              }}
            >
              {/* Header: Room Number & Status Badge */}
              <div className="flex items-start justify-between gap-1 mb-1">
                <div>
                  <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 block">
                    {room.roomNumber}
                  </span>
                  <span className="text-[11px] text-slate-500 block truncate">
                    {room.type || 'Standard'} &bull; Lt {room.floor}
                  </span>
                </div>

                {isAvailable && (
                  <span
                    data-status="available"
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    Tersedia
                  </span>
                )}
                {isOccupied && (
                  <span
                    data-status="occupied"
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-0.5"
                  >
                    <Lock size={9} /> Terisi
                  </span>
                )}
                {isMaintenance && (
                  <span
                    data-status="maintenance"
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-0.5"
                  >
                    <Wrench size={9} /> Pemeliharaan
                  </span>
                )}
              </div>

              {/* Pricing & Selection Indicator */}
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {formatRupiah(effectivePrice)}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-0.5">/bln</span>
                  {hasCustomPrice && (
                    <span className="ml-1 px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Kustom
                    </span>
                  )}
                </div>

                {isSelected && (
                  <CheckCircle size={15} className="text-blue-600 flex-shrink-0" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Room Notification Banner */}
      {selectedRoom && (
        <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-blue-600 flex-shrink-0" />
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Kamar Dipilih: Kamar {selectedRoom.roomNumber}
              </span>
              <span className="text-slate-500 ml-1">
                (Lantai {selectedRoom.floor} - {selectedRoom.type})
              </span>
            </div>
          </div>
          <span className="font-extrabold text-blue-600 dark:text-blue-400">
            {formatRupiah(selectedRoom.effectivePrice ?? (selectedRoom.price ? selectedRoom.price : basePrice))}/bln
          </span>
        </div>
      )}
    </div>
  );
};

export default RoomSelectionGrid;
