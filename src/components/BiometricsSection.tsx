import React, { useState } from 'react';
import {
  Activity,
  Heart,
  Moon,
  Zap,
  Footprints,
  Clock,
  Droplets,
  TrendingDown,
  TrendingUp,
  Watch,
  Scale,
  Brain,
  Sparkles,
  Waves,
  Dumbbell,
  CheckCircle2,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppleWatchBiometrics } from '../types';

interface BiometricsSectionProps {
  biometrics: AppleWatchBiometrics;
  onSync: () => void;
  isSyncing?: boolean;
}

export const BiometricsSection: React.FC<BiometricsSectionProps> = ({
  biometrics,
  onSync,
  isSyncing = false
}) => {
  const [activeMetricTab, setActiveMetricTab] = useState<'hrv' | 'restingHr' | 'steps' | 'energy'>('hrv');
  const [hoveredPoint, setHoveredPoint] = useState<{ day: string; value: number } | null>(null);

  // Active trend series based on selection
  const trendData = {
    hrv: {
      data: biometrics.hrvTrend,
      unit: 'ms',
      label: 'Variabilita srdečního tepu (HRV)',
      color: '#00f2fe',
      baseline: biometrics.hrvBaselineMs,
      baselineLabel: 'Průměrná základna (42,0 ms)'
    },
    restingHr: {
      data: biometrics.restingHrTrend,
      unit: 'bpm',
      label: 'Klidový tep (Resting Heart Rate)',
      color: '#f43f5e',
      baseline: 58,
      baselineLabel: 'Optimální základna (58 bpm)'
    },
    steps: {
      data: biometrics.stepsTrend,
      unit: 'kroků',
      label: 'Denní kroky & NEAT',
      color: '#39ff14',
      baseline: biometrics.stepsTarget,
      baselineLabel: 'Denní cíl (10 000)'
    },
    energy: {
      data: biometrics.energyTrend,
      unit: 'kcal',
      label: 'Aktivní energie (Active Burn)',
      color: '#fbbf24',
      baseline: biometrics.activeEnergyTargetKcal,
      baselineLabel: 'Denní cíl (1 500 kcal)'
    }
  }[activeMetricTab];

  // SVG mini-chart coordinate calculations
  // Krivka potrebuje aspon dva body: pri jednom deli (length - 1) nulou a
  // souradnice vyjdou NaN, pri nule spadne points[points.length - 1] na undefined.
  const maKrivku = trendData.data.length >= 2;

  const values = trendData.data.map(d => d.value);
  const minVal = maKrivku ? Math.min(...values) * 0.9 : 0;
  const maxVal = maKrivku ? Math.max(...values) * 1.1 || 1 : 1;
  const width = 600;
  const height = 160;
  const paddingX = 40;
  const paddingY = 25;

  const points = maKrivku
    ? trendData.data.map((d, i) => {
        const x = paddingX + (i / (trendData.data.length - 1)) * (width - paddingX * 2);
        const y = height - paddingY - ((d.value - minVal) / (maxVal - minVal)) * (height - paddingY * 2);
        return { x, y, ...d };
      })
    : [];

  const pathD = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  const areaD = maKrivku
    ? `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`
    : '';

  return (
    <div className="space-y-6">
      {/* Top Banner: Device Connection Statuses & Sync */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Withings Scale Status */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0e131d]/90 border border-slate-800/80 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-[#00f2fe]">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Chytrá váha</div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Withings Body Scan</span>
                <span className="w-2 h-2 rounded-full bg-[#39ff14] shadow-[0_0_8px_#39ff14]" />
              </div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/60 text-[#39ff14] border border-emerald-500/30">
            připojeno
          </span>
        </div>

        {/* Apple Watch Status */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0e131d]/90 border border-slate-800/80 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-[#39ff14]">
              <Watch className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Chytré hodinky</div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Apple Watch Ultra 2</span>
                <span className="w-2 h-2 rounded-full bg-[#39ff14] shadow-[0_0_8px_#39ff14]" />
              </div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/60 text-[#39ff14] border border-emerald-500/30">
            připojeno
          </span>
        </div>
      </div>

      {/* Main Biometrics Dashboard: Skóre Regenerace + Core Triad (HRV, RHR, Spánek) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Skóre Regenerace Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1 rounded-3xl p-6 bg-gradient-to-br from-[#111927]/90 via-[#0e141f]/90 to-[#0c1017]/90 border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Skóre Regenerace (CNS)
              </span>
              <div className="px-3 py-1 rounded-full text-xs font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 shadow-[0_0_10px_rgba(245,158,11,0.25)]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>{biometrics.recoveryStatus}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 my-3">
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center bg-slate-900 border-4 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                <div className="text-center">
                  <span className="text-3xl font-black text-white tracking-tight">
                    {biometrics.recoveryScore}
                  </span>
                  <span className="text-[11px] block text-slate-400 font-bold -mt-1">
                    / 100
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <div className="text-slate-300 font-medium">
                  Stav: <span className="text-amber-300 font-bold">Mírné přetížení CNS</span>
                </div>
                <div className="text-slate-400">
                  Včera náročný silový trénink nohou (dřepy 175 kg).
                </div>
                <div className="text-[11px] text-cyan-400 font-semibold">
                  Dnes snížit RPE o 1–2 stupně.
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Aktualizováno: {biometrics.lastSyncTime}</span>
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>
        </motion.div>

        {/* 3 Core Metric Tiles: HRV, Klidový tep, Spánek */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* HRV Tile */}
          <div className="rounded-3xl p-5 bg-[#0e131d]/90 border border-cyan-500/30 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-cyan-400/60 transition-all">
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400">HRV (Variabilita)</span>
                <Activity className="w-4 h-4 text-[#00f2fe]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white tracking-tight">
                  {biometrics.hrvMs.toLocaleString('cs-CZ')}
                </span>
                <span className="text-xs font-semibold text-slate-400">ms</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-rose-400 font-medium mt-1">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                <span>-21,4 ms oproti normě ({biometrics.hrvBaselineMs} ms)</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              Měření: Ranní SDNN přes HealthKit
            </div>
          </div>

          {/* Klidový tep Tile */}
          <div className="rounded-3xl p-5 bg-[#0e131d]/90 border border-rose-500/30 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-rose-400/60 transition-all">
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-rose-500/10 rounded-full blur-xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400">Klidový tep (RHR)</span>
                <Heart className="w-4 h-4 text-rose-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white tracking-tight">
                  {biometrics.restingHrBpm.toLocaleString('cs-CZ')}
                </span>
                <span className="text-xs font-semibold text-slate-400">bpm</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-amber-400 font-medium mt-1">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                <span>+10 bpm (zvýšený metabolický výdej)</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              Noční klidové minimum: 54 bpm
            </div>
          </div>

          {/* Spánek info Tile */}
          <div className="rounded-3xl p-5 bg-[#0e131d]/90 border border-emerald-500/30 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-emerald-400/60 transition-all">
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400">Délka spánku</span>
                <Moon className="w-4 h-4 text-[#39ff14]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {biometrics.sleepDuration}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-[#39ff14] font-medium mt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#39ff14]" />
                <span>Hluboký spánek {biometrics.deepSleepDuration} ({biometrics.sleepEfficiencyPercent}%)</span>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
              Usnutí: 23:14 • Procitnutí: 07:02
            </div>
          </div>
        </div>
      </div>

      {/* Block: "Co z toho vyplývá" (AI Training Load Advice & Interpretation) */}
      <div className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-cyan-950/40 via-[#0e1622]/90 to-emerald-950/40 border border-cyan-500/40 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-cyan-950/80 border border-cyan-500/60 flex items-center justify-center text-[#00f2fe] shrink-0 shadow-[0_0_12px_rgba(0,242,254,0.4)]">
            <Brain className="w-5 h-5" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Co z toho vyplývá pro dnešní trénink &amp; regeneraci
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                AI Analýza TED
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              {biometrics.recoveryAdvice}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <span className="text-slate-400 block text-[11px]">Tréninkový protokol</span>
                <span className="text-white font-semibold">Zachovat plán, RIR 1-2</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <span className="text-slate-400 block text-[11px]">Suplementace</span>
                <span className="text-[#00f2fe] font-semibold">500mg Hořčík Bisglycinát</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <span className="text-slate-400 block text-[11px]">Hydratace</span>
                <span className="text-[#39ff14] font-semibold">3,5L vody + sodík</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 30-Day Mini-Graphs & Trend Inspector */}
      <div className="rounded-3xl p-5 sm:p-6 bg-[#0e131d]/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white">
              Historické trendy &amp; Biometrické grafy
            </h3>
            <p className="text-xs text-slate-400">
              Přehled za posledních 7–30 dní synchronizovaných z Apple Watch &amp; Withings
            </p>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
            <button
              onClick={() => setActiveMetricTab('hrv')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMetricTab === 'hrv'
                  ? 'bg-cyan-950 text-[#00f2fe] border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              HRV
            </button>
            <button
              onClick={() => setActiveMetricTab('restingHr')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMetricTab === 'restingHr'
                  ? 'bg-rose-950 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Klidový tep
            </button>
            <button
              onClick={() => setActiveMetricTab('steps')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMetricTab === 'steps'
                  ? 'bg-emerald-950 text-[#39ff14] border border-[#39ff14]/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Kroky
            </button>
            <button
              onClick={() => setActiveMetricTab('energy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMetricTab === 'energy'
                  ? 'bg-amber-950 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Aktivní kcal
            </button>
          </div>
        </div>

        {/* Dynamic Glowing Trend SVG */}
        <div className="relative pt-2">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-2 px-2">
            <span className="font-semibold text-slate-200">{trendData.label}</span>
            <span className="text-[11px] text-slate-500">{trendData.baselineLabel}</span>
          </div>

          <div className="w-full h-44 bg-slate-950/80 rounded-2xl border border-slate-800/80 p-2 relative overflow-hidden">
            {!maKrivku ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center gap-1 px-4">
                <span className="text-2xl text-slate-600 font-bold leading-none">—</span>
                <span className="text-[11px] text-slate-500">
                  {trendData.data.length === 0
                    ? 'Zatím nemáme naměřená data pro tento graf.'
                    : 'Pro vykreslení trendu potřebujeme aspoň dvě měření.'}
                </span>
              </div>
            ) : (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="biometricAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trendData.color} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={trendData.color} stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="biometricLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={trendData.color} />
                  <stop offset="100%" stopColor="#39ff14" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              <line x1={paddingX} y1={height / 4} x2={width - paddingX} y2={height / 4} stroke="#1e293b" strokeDasharray="3 3" />
              <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="#1e293b" strokeDasharray="3 3" />
              <line x1={paddingX} y1={(3 * height) / 4} x2={width - paddingX} y2={(3 * height) / 4} stroke="#1e293b" strokeDasharray="3 3" />

              {/* Area fill */}
              <path d={areaD} fill="url(#biometricAreaGrad)" />

              {/* Main curve */}
              <path
                d={pathD}
                fill="none"
                stroke="url(#biometricLineGrad)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points */}
              {points.map((p, idx) => (
                <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredPoint({ day: p.day, value: p.value })}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="5"
                    fill="#08090d"
                    stroke={trendData.color}
                    strokeWidth="2.5"
                    className="hover:scale-125 transition-transform"
                  />
                  <text
                    x={p.x}
                    y={height - 5}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="10"
                    fontWeight="600"
                  >
                    {p.day}
                  </text>
                </g>
              ))}
            </svg>
            )}

            {/* Hover Tooltip display */}
            {maKrivku && hoveredPoint && (
              <div className="absolute top-4 right-4 bg-slate-900/95 border border-cyan-500/50 px-3 py-1.5 rounded-xl text-xs shadow-xl backdrop-blur-md">
                <span className="text-slate-400">{hoveredPoint.day}: </span>
                <span className="font-bold text-white">
                  {hoveredPoint.value.toLocaleString('cs-CZ')} {trendData.unit}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dnešní přehled (Daily 4-Card Biometric Summary) */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
          Dnešní přehled aktivity z Apple Watch
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Kroky */}
          <div className="p-4 rounded-2xl bg-[#0e131d]/90 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Kroky</span>
              <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                {biometrics.stepsToday.toLocaleString('cs-CZ')}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">cíl {biometrics.stepsTarget.toLocaleString('cs-CZ')}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-[#39ff14]">
              <Footprints className="w-5 h-5" />
            </div>
          </div>

          {/* Aktivní energie */}
          <div className="p-4 rounded-2xl bg-[#0e131d]/90 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Aktivní energie</span>
              <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                {biometrics.activeEnergyKcal.toLocaleString('cs-CZ')}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">kcal (cíl 1 500)</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
          </div>

          {/* Čas cvičení */}
          <div className="p-4 rounded-2xl bg-[#0e131d]/90 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Čas cvičení</span>
              <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                {biometrics.exerciseMinutes.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })}
              </div>
              <span className="text-[10px] text-slate-500 font-medium">min (cíl 60,0)</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-[#00f2fe]">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Okysličení krve */}
          <div className="p-4 rounded-2xl bg-[#0e131d]/90 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Okysličení krve</span>
              <div className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                {biometrics.bloodOxygenPercent.toLocaleString('cs-CZ', { minimumFractionDigits: 1 })} %
              </div>
              <span className="text-[10px] text-slate-500 font-medium">SpO2 (optimální)</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-950/60 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Droplets className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Tréninky z Apple Watch Table */}
      <div className="rounded-3xl p-5 sm:p-6 bg-[#0e131d]/90 border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Watch className="w-5 h-5 text-[#39ff14]" />
            <h3 className="text-base font-bold text-white">
              Zaznamenané tréninky z Apple Watch
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Automatický import z HealthKit
          </span>
        </div>

        <div className="divide-y divide-slate-800/80">
          {biometrics.recentWorkouts.map(wo => (
            <div key={wo.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-[#00f2fe]">
                  {wo.icon === 'waves' ? <Waves className="w-5 h-5" /> : <Dumbbell className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{wo.type}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span>{wo.time}</span>
                    <span>•</span>
                    <span>{wo.durationMin} min</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="text-right">
                  <span className="text-slate-400 block text-[11px]">Spáleno</span>
                  <span className="text-amber-400 font-bold">{wo.caloriesBurned} kcal</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[11px]">Průměrný tep</span>
                  <span className="text-rose-400 font-bold">{wo.avgHr} bpm</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[11px]">Max tep</span>
                  <span className="text-slate-200">{wo.maxHr} bpm</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
