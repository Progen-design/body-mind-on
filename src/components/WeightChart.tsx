import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WeightRecord } from '../types';
import { hodnotaNeboPomlcka } from '../data/adaptery';
import { Calendar, Plus, Info } from 'lucide-react';

interface WeightChartProps {
  recordsByFilter: Record<string, WeightRecord[]>;
  onAddMeasurement?: () => void;
}

export const WeightChart: React.FC<WeightChartProps> = ({
  recordsByFilter,
  onAddMeasurement
}) => {
  const [activeFilter, setActiveFilter] = useState<'1M' | '3M' | '6M' | '1R'>('1M');
  const [hoveredPoint, setHoveredPoint] = useState<WeightRecord | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const currentRecords = recordsByFilter[activeFilter] || recordsByFilter['1M'];

  // Calculate scales
  const weights = currentRecords.map(r => r.weight);
  const minWeight = Math.floor(Math.min(...weights, 101));
  const maxWeight = Math.ceil(Math.max(...weights, 105));
  
  // Y-axis grid values (e.g. 105, 104, 103, 102, 101)
  const yLabels = [];
  for (let w = maxWeight; w >= minWeight; w--) {
    yLabels.push(w);
  }

  // Chart coordinate mapping
  const chartHeight = 160;
  const paddingLeft = 32;
  const paddingRight = 20;
  const paddingTop = 15;
  const paddingBottom = 25;
  const width = 500; // SVG viewBox width

  const getY = (val: number) => {
    const ratio = (val - minWeight) / (maxWeight - minWeight || 1);
    return chartHeight - paddingBottom - ratio * (chartHeight - paddingTop - paddingBottom);
  };

  const getX = (idx: number, total: number) => {
    if (total <= 1) return paddingLeft + (width - paddingLeft - paddingRight) / 2;
    return paddingLeft + (idx / (total - 1)) * (width - paddingLeft - paddingRight);
  };

  // Build SVG Path
  const points = currentRecords.map((r, idx) => ({
    x: getX(idx, currentRecords.length),
    y: getY(r.weight),
    record: r
  }));

  const linePath = points.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  // Fill path for glowing gradient underneath
  const firstPoint = points[0] || { x: paddingLeft, y: chartHeight - paddingBottom };
  const lastPoint = points[points.length - 1] || { x: width - paddingRight, y: chartHeight - paddingBottom };
  const bottomY = chartHeight - paddingBottom;
  const areaPath = `${linePath} L ${lastPoint.x} ${bottomY} L ${firstPoint.x} ${bottomY} Z`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0e131d]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-cyan-400/50 transition-all duration-300"
    >
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Title and Timeframe Filters */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white tracking-tight">
            Vývoj váhy
          </h3>
          <span className="text-xs text-slate-400 font-normal">
            (kg)
          </span>
        </div>

        {/* Timeframe pill selector */}
        <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800">
          {(['1M', '3M', '6M', '1R'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setActiveFilter(filter);
                setHoveredIndex(null);
                setHoveredPoint(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === filter
                  ? 'bg-cyan-500/20 text-[#00f2fe] border border-cyan-500/40 shadow-[0_0_8px_rgba(0,242,254,0.3)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Chart Container */}
      <div className="relative z-10 w-full overflow-x-auto select-none pt-2">
        <div className="min-w-[340px]">
          <svg
            viewBox={`0 0 ${width} ${chartHeight}`}
            className="w-full h-44 overflow-visible"
          >
            <defs>
              {/* Gradient for the Stroke: Cyan to Lime */}
              <linearGradient id="neonLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00f2fe" />
                <stop offset="60%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#39ff14" />
              </linearGradient>

              {/* Gradient for Area Fill */}
              <linearGradient id="neonAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.28" />
                <stop offset="50%" stopColor="#39ff14" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#0a0b0e" stopOpacity="0" />
              </linearGradient>

              {/* Node drop shadow glow */}
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Horizontal Grid lines and Y-axis labels */}
            {yLabels.map((val) => {
              const y = getY(val);
              return (
                <g key={val}>
                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    {val}
                  </text>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                </g>
              );
            })}

            {/* Area Fill */}
            {points.length > 1 && (
              <path
                d={areaPath}
                fill="url(#neonAreaGradient)"
              />
            )}

            {/* Glowing Main Line */}
            {points.length > 1 && (
              <>
                {/* Ambient glow stroke behind */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="url(#neonLineGradient)"
                  strokeWidth="6"
                  strokeOpacity="0.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Crisp neon foreground line */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="url(#neonLineGradient)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Data Points with glowing halos */}
            {points.map((pt, idx) => {
              const isLast = idx === points.length - 1;
              const isHovered = hoveredIndex === idx;
              // Color transitions from cyan to lime
              const color = idx > points.length / 2 ? '#39ff14' : '#00f2fe';

              return (
                <g
                  key={idx}
                  className="cursor-pointer transition-transform"
                  onMouseEnter={() => {
                    setHoveredIndex(idx);
                    setHoveredPoint(pt.record);
                  }}
                  onMouseLeave={() => {
                    setHoveredIndex(null);
                    setHoveredPoint(null);
                  }}
                  onClick={() => {
                    setHoveredIndex(idx);
                    setHoveredPoint(pt.record);
                  }}
                >
                  {/* Outer pulse circle for the latest point */}
                  {isLast && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="9"
                      fill="#39ff14"
                      fillOpacity="0.25"
                      className="animate-ping"
                    />
                  )}

                  {/* Halo hover */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? "8" : "5"}
                    fill={color}
                    fillOpacity={isHovered ? "0.4" : "0.2"}
                  />

                  {/* Center Dot */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? "4.5" : "3.5"}
                    fill={color}
                    stroke="#0e131d"
                    strokeWidth="1.5"
                    filter="url(#glow)"
                  />

                  {/* X-axis date labels */}
                  <text
                    x={pt.x}
                    y={chartHeight - 4}
                    textAnchor="middle"
                    fill={isHovered ? '#38bdf8' : '#64748b'}
                    fontSize="10"
                    fontWeight={isHovered ? '600' : '400'}
                  >
                    {pt.record.date}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Dynamic Hover Tooltip / Measurement summary bar */}
      <div className="relative z-10 mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
        {hoveredPoint ? (
          <div className="flex items-center gap-3 text-slate-200">
            <span className="font-semibold text-[#00f2fe]">{hoveredPoint.date}</span>
            <span>Váha: <strong className="text-white">{hodnotaNeboPomlcka(hoveredPoint.weight, 'kg')}</strong></span>
            <span>Tuk: <strong className="text-[#39ff14]">{hodnotaNeboPomlcka(hoveredPoint.fatPercent, '%')}</strong></span>
            {hoveredPoint.note && (
              <span className="hidden sm:inline text-slate-400 italic">({hoveredPoint.note})</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Klikněte na libovolný bod v grafu pro detailní měření.</span>
          </div>
        )}

        {onAddMeasurement && (
          <button
            onClick={onAddMeasurement}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Přidat záznam</span>
          </button>
        )}
      </div>
    </motion.div>
  );
};
