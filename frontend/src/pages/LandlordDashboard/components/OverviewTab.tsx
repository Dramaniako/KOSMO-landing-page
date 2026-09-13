import React from 'react';
import { DollarSign, ArrowUpRight, CreditCard, Percent, Landmark, Plus, Building2, Home, BedDouble, TrendingUp } from 'lucide-react';
import { User, LandlordStats } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';
import { shimmerStyle } from '../types';

export interface OverviewTabProps {
  stats: LandlordStats;
  landlordUser: User | null;
  loading: boolean;
  onOpenWithdraw: () => void;
  onOpenAddProperty: () => void;
}

export default function OverviewTab({
  stats,
  landlordUser,
  loading,
  onOpenWithdraw,
  onOpenAddProperty
}: OverviewTabProps) {
  if (loading) {
    return (
      <div>
        <div className="stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: '110px', ...shimmerStyle }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '40px' }}>
          <div style={{ width: '180px', height: '42px', ...shimmerStyle }} />
          <div style={{ width: '180px', height: '42px', ...shimmerStyle }} />
        </div>
        <div className="grid-2">
          <div className="card" style={{ height: '240px', ...shimmerStyle }} />
          <div className="card" style={{ height: '240px', ...shimmerStyle }} />
        </div>
      </div>
    );
  }

  // Occupancy chart points (Mockup Screen 10: Des, Jan, Feb, Mar, Apr, Mei)
  const chartData = [
    { month: 'Des', rate: 60 },
    { month: 'Jan', rate: 52 },
    { month: 'Feb', rate: 64 },
    { month: 'Mar', rate: 58 },
    { month: 'Apr', rate: 72 },
    { month: 'Mei', rate: stats.occupancyRate ?? 77 }
  ];

  // Dynamically compute SVG coordinates based on occupancy rate percentage (0 - 100%)
  const chartPoints = chartData.map((d, idx) => ({
    cx: 10 + idx * 59,
    cy: Math.round(100 - (Math.min(100, Math.max(0, d.rate)) / 100) * 80),
    month: d.month,
    rate: d.rate
  }));

  const linePath = chartPoints.reduce((acc, p, idx) => {
    if (idx === 0) return `M ${p.cx} ${p.cy}`;
    const prev = chartPoints[idx - 1];
    const midX = (prev.cx + p.cx) / 2;
    return `${acc} C ${midX} ${prev.cy}, ${midX} ${p.cy}, ${p.cx} ${p.cy}`;
  }, '');

  const areaPath = `${linePath} L ${chartPoints[chartPoints.length - 1].cx} 100 L ${chartPoints[0].cx} 100 Z`;

  return (
    <>
      {/* 4 Metric Stats Cards Row (Mockup Screen 10) */}
      <div className="stats-grid mb-6">
        <div className="stats-card border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-5 shadow-sm">
          <div className="stats-icon bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-xl">
            <Building2 size={24} />
          </div>
          <div className="stats-info">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Properti</h4>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalProperti}</p>
          </div>
        </div>

        <div className="stats-card border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-5 shadow-sm">
          <div className="stats-icon bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 rounded-xl">
            <Home size={24} />
          </div>
          <div className="stats-info">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Kamar</h4>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalRooms}</p>
          </div>
        </div>

        <div className="stats-card border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-5 shadow-sm">
          <div className="stats-icon bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-xl">
            <BedDouble size={24} />
          </div>
          <div className="stats-info">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400">Kamar Terisi</h4>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{stats.occupiedRooms}</p>
          </div>
        </div>

        <div className="stats-card border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-5 shadow-sm">
          <div className="stats-icon bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 rounded-xl">
            <Percent size={24} />
          </div>
          <div className="stats-info">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400">Tingkat Okupansi</h4>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{stats.occupancyRate}%</p>
          </div>
        </div>
      </div>

      {/* Secondary Financial Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo Siap Ditarik</span>
            <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{formatRupiah(stats.balance)}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
            <DollarSign size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pendapatan</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{formatRupiah(stats.totalRevenue)}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400 flex items-center justify-center">
            <ArrowUpRight size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Telah Ditarik</span>
            <div className="text-xl font-black text-slate-700 dark:text-slate-300 mt-1">{formatRupiah(stats.totalWithdrawn)}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <CreditCard size={20} />
          </div>
        </div>
      </div>

      {/* Main Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button
          className="btn btn-primary bg-emerald-800 hover:bg-emerald-900 text-white font-bold py-2.5 px-5 rounded-xl shadow-sm hover:shadow transition flex items-center gap-2"
          onClick={onOpenWithdraw}
        >
          <Landmark size={16} />
          <span>Tarik Dana (Withdraw)</span>
        </button>
        <button
          className="btn btn-secondary bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100 font-bold py-2.5 px-5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60 transition flex items-center gap-2"
          onClick={onOpenAddProperty}
        >
          <Plus size={16} />
          <span>Tambah Properti Baru</span>
        </button>
      </div>

      {/* Grafik Okupansi & Rincian Operasional (Mockup Screen 10) */}
      <div className="grid-2 mb-8">
        {/* Grafik Okupansi (6 Bulan Terakhir) */}
        <div className="card bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Grafik Okupansi (6 Bulan Terakhir)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Tren hunian kamar juragankost</p>
            </div>
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full flex items-center gap-1">
              <TrendingUp size={12} />
              +8.4%
            </span>
          </div>

          {/* SVG Trend Line Chart */}
          <div className="w-full h-44 pt-2">
            <svg viewBox="0 0 320 120" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Horizontal Grid lines */}
              <line x1="0" y1="20" x2="320" y2="20" stroke="#e2e8f0" strokeDasharray="3 3" />
              <line x1="0" y1="60" x2="320" y2="60" stroke="#e2e8f0" strokeDasharray="3 3" />
              <line x1="0" y1="100" x2="320" y2="100" stroke="#e2e8f0" />

              {/* Area fill */}
              <path
                d={areaPath}
                fill="url(#occupancyGradient)"
              />
              {/* Smooth trend line */}
              <path
                d={linePath}
                fill="none"
                stroke="#0D5C3A"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Chart point dots */}
              {chartPoints.map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.cx}
                  cy={p.cy}
                  r="4"
                  fill="#ffffff"
                  stroke="#0D5C3A"
                  strokeWidth="2.5"
                >
                  <title>{`${p.month}: ${p.rate}%`}</title>
                </circle>
              ))}
            </svg>
            <div className="flex justify-between text-[11px] font-semibold text-slate-400 mt-1 px-1">
              {chartData.map((d, i) => (
                <span key={i}>{d.month}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Riwayat Penarikan Dana Card */}
        <div className="card bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            Riwayat Penarikan Dana
          </h3>
          {stats.withdrawals.length === 0 ? (
            <p className="text-slate-400 text-xs italic py-4">Belum ada riwayat penarikan dana.</p>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-[200px] overflow-y-auto">
              {stats.withdrawals.map((w) => {
                const isRejected = w.status === 'rejected';
                const isCompleted = w.status === 'completed';
                const isProcessing = w.status === 'processing';
                return (
                  <div
                    key={w.id}
                    className="flex-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">Transfer ke {w.bankName}</p>
                      <p className="text-[11px] text-slate-400">{w.date} &bull; Rek: {w.accountNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${isRejected ? 'text-slate-400 line-through' : 'text-rose-600'}`}>
                        -{formatRupiah(w.amount)}
                      </p>
                      <span
                        className={`badge ${isCompleted ? 'badge-success' : isRejected ? 'badge-danger' : isProcessing ? 'badge-warning' : 'badge-secondary'}`}
                        style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-block', marginTop: '2px' }}
                      >
                        {isCompleted ? 'Selesai' : isRejected ? 'Ditolak' : isProcessing ? 'Diproses' : 'Menunggu'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
