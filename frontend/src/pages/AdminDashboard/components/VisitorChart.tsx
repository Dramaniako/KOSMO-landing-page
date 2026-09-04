import React, { useState } from 'react';
import { ChartPoint, VisitorChartProps } from '../types';

export default function VisitorChart({ data, timeRange }: VisitorChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  if (!data || data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.count), 5);
  const width = 800;
  const height = 280;

  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points: ChartPoint[] = data.map((item, i) => {
    const x = paddingLeft + (i / (data.length - 1 || 1)) * chartWidth;
    const y = height - paddingBottom - (item.count / maxVal) * chartHeight;
    return { x, y, label: item.label, count: item.count, index: i };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : '';

  const gridLevels: { y: number; val: number }[] = [];
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxVal / 4) * i);
    const y = height - paddingBottom - (val / maxVal) * chartHeight;
    gridLevels.push({ y, val });
  }

  const xLabelsCount = timeRange === '24h' ? 6 : timeRange === '7d' ? 7 : 6;
  const step = Math.max(Math.floor(data.length / xLabelsCount), 1);
  const xLabels = points.filter((_, idx) => idx % step === 0 || idx === data.length - 1);

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '24px' }}>
      <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '16px' }}>
        Grafik Aktivitas Pengunjung ({timeRange === '24h' ? '24 Jam Terakhir' : timeRange === '7d' ? '1 Minggu Terakhir' : '1 Bulan Terakhir'})
      </h4>
      <div style={{ position: 'relative', width: '100%', minWidth: '700px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>

          {/* Grid lines & Y labels */}
          {gridLevels.map((lvl, idx) => (
            <g key={idx} opacity={0.6}>
              <line
                x1={paddingLeft}
                y1={lvl.y}
                x2={width - paddingRight}
                y2={lvl.y}
                stroke="#e2e8f0"
                strokeWidth={1}
                strokeDasharray={idx === 0 ? "0" : "4 4"}
              />
              <text
                x={paddingLeft - 8}
                y={lvl.y + 4}
                fill="#64748b"
                fontSize="11px"
                textAnchor="end"
              >
                {lvl.val}
              </text>
            </g>
          ))}

          {/* Fills & Paths */}
          {points.length > 1 && (
            <>
              <path d={areaPath} fill="url(#chartGradient)" />
              <path
                d={linePath}
                fill="none"
                stroke="url(#lineGrad)"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Points circles & interactive hover areas */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredPoint?.index === idx ? 6 : 4}
                fill={hoveredPoint?.index === idx ? "#4f46e5" : "white"}
                stroke={hoveredPoint?.index === idx ? "white" : "#6366f1"}
                strokeWidth={2}
                style={{ transition: 'all 0.15s ease' }}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={14}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            </g>
          ))}

          {/* X axis labels */}
          {xLabels.map((p, idx) => (
            <text
              key={idx}
              x={p.x}
              y={height - 12}
              fill="#64748b"
              fontSize="11px"
              textAnchor="middle"
            >
              {p.label.split(' ')[0]}
            </text>
          ))}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div style={{
            position: 'absolute',
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: `${(hoveredPoint.y / height) * 100 - 15}%`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#1e293b',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
            transition: 'left 0.1s ease, top 0.1s ease'
          }}>
            <div style={{ fontWeight: 600 }}>{hoveredPoint.count} Kunjungan</div>
            <div style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '2px' }}>{hoveredPoint.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}
