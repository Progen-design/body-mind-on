import React from 'react';
import {
  CheckCircle2,
  Calendar,
  Sparkles,
  Flame,
  ShieldAlert,
  Droplets,
  Moon,
  Footprints,
  Utensils,
  Ban,
  Check,
  TrendingUp,
  Award
} from 'lucide-react';
import { motion } from 'motion/react';
import { HabitItem, BadHabitItem, HabitDayRecord } from '../types';

interface HabitsSectionProps {
  habits: HabitItem[];
  badHabits: BadHabitItem[];
  habitHistory: HabitDayRecord[];
  onToggleHabit: (id: string) => void;
  onCompleteAllToday: () => void;
  onLogBadHabitTemptation?: (id: string) => void;
}

export const HabitsSection: React.FC<HabitsSectionProps> = ({
  habits,
  badHabits,
  habitHistory,
  onToggleHabit,
  onCompleteAllToday,
  onLogBadHabitTemptation
}) => {
  const completedHabitsCount = habits.filter(h => h.completed).length;
  const totalHabitsCount = habits.length;
  const allCompleted = completedHabitsCount === totalHabitsCount;

  const getHabitIcon = (type: HabitItem['iconType']) => {
    switch (type) {
      case 'food':
        return <Utensils className="w-5 h-5 text-[#00f2fe]" />;
      case 'sleep':
        return <Moon className="w-5 h-5 text-[#39ff14]" />;
      case 'water':
        return <Droplets className="w-5 h-5 text-sky-400" />;
      case 'steps':
        return <Footprints className="w-5 h-5 text-amber-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-purple-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Date, Completion Counter (0/3 or 2/3) & "Splnit vše pro dnes" Button */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-[#0e1624] via-[#0d141e] to-[#0a1513] border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe] shadow-[0_0_15px_rgba(0,242,254,0.3)]">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                20. 8. Dnes (Čtvrtek)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-950 text-[#39ff14] border border-emerald-500/40">
                Aktivní disciplína
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-0.5">
              Splněno {completedHabitsCount} z {totalHabitsCount} denních návyků
            </h3>
          </div>
        </div>

        <button
          onClick={onCompleteAllToday}
          disabled={allCompleted}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-lg active:scale-95 ${
            allCompleted
              ? 'bg-emerald-950/80 text-[#39ff14] border border-[#39ff14]/50 cursor-default'
              : 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-[0_0_20px_rgba(57,255,20,0.3)]'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{allCompleted ? 'Vše splněno na 100%' : 'Splnit vše pro dnes'}</span>
        </button>
      </motion.div>

      {/* Zdravé návyky (Healthy Habits Grid) */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Zdravé návyky &amp; Série (Streaks)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {habits.map(habit => (
            <div
              key={habit.id}
              onClick={() => onToggleHabit(habit.id)}
              className={`p-4 sm:p-5 rounded-3xl border transition-all cursor-pointer select-none flex items-center justify-between gap-4 ${
                habit.completed
                  ? 'bg-[#0e131d]/90 border-cyan-500/30 hover:border-cyan-400/60 shadow-md'
                  : 'bg-[#0b0e14]/60 border-slate-800 hover:border-slate-700 opacity-80'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center shrink-0">
                  {getHabitIcon(habit.iconType)}
                </div>

                <div>
                  <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
                    {habit.title}
                  </h4>
                  <p className="text-xs text-slate-400">{habit.subtitle}</p>
                  {habit.value && (
                    <span className="text-[11px] font-bold text-[#00f2fe] block mt-0.5">
                      {habit.value}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <div
                  className={`w-7 h-7 rounded-xl border flex items-center justify-center transition-all ${
                    habit.completed
                      ? 'bg-[#39ff14] border-[#39ff14] text-slate-950 shadow-[0_0_10px_#39ff14]'
                      : 'border-slate-700 bg-slate-900 text-transparent'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>

                <div className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-500/30">
                  <Flame className="w-3 h-3 text-amber-400" />
                  <span>{habit.streakDays} dní</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Zlozvyky & Pokušení (Bad Habits / Junk Food Avoidance Tracker) */}
      <div className="rounded-3xl p-5 sm:p-6 bg-[#0e131d]/90 border border-rose-500/30 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Ban className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Kontrola zlozvyků &amp; Průmyslový cukr
              </h3>
              <p className="text-xs text-slate-400">
                Důsledné sledování čistých dnů bez junk foodu a fast foodu
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/60 text-[#39ff14] border border-emerald-500/40 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-[#39ff14]" />
            <span>18 dní čistý</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {badHabits.map(bad => (
            <div key={bad.id} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{bad.title}</span>
                <span className="text-xs font-bold text-[#39ff14] bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  {bad.cleanDaysStreak} dní bez prohřešku
                </span>
              </div>
              <p className="text-xs text-slate-300">{bad.description}</p>
              {bad.lastResistedNote && (
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-300 flex items-start gap-2">
                  <Award className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{bad.lastResistedNote}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Habit Matrix (PO až NE Streak Table) */}
      <div className="rounded-3xl p-5 sm:p-6 bg-[#0e131d]/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">
              Týdenní matice plnění návyků
            </h3>
            <p className="text-xs text-slate-400">
              Historie za aktuální týden (Pondělí – Neděle)
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span className="flex items-center gap-1 text-[#39ff14]">
              <span className="w-2 h-2 rounded-full bg-[#39ff14]" /> Splněno
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-slate-700" /> Čeká
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left">
                <th className="pb-3 font-semibold">Návyk / Den</th>
                {habitHistory.map(d => (
                  <th key={d.dayShort} className="pb-3 text-center font-bold text-slate-300">
                    <div>{d.dayShort}</div>
                    <div className="text-[10px] text-slate-500 font-normal">{d.dateStr}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {/* Food row */}
              <tr>
                <td className="py-3 font-semibold text-slate-200 flex items-center gap-2">
                  <Utensils className="w-3.5 h-3.5 text-[#00f2fe]" />
                  <span>Vyvážené stravování</span>
                </td>
                {habitHistory.map((d, i) => (
                  <td key={i} className="py-3 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${
                        d.foodDone
                          ? 'bg-[#39ff14]/20 text-[#39ff14] border border-[#39ff14]/40'
                          : 'bg-slate-900 text-slate-600 border border-slate-800'
                      }`}
                    >
                      {d.foodDone ? '✓' : '–'}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Sleep row */}
              <tr>
                <td className="py-3 font-semibold text-slate-200 flex items-center gap-2">
                  <Moon className="w-3.5 h-3.5 text-[#39ff14]" />
                  <span>Kvalitní spánek (7h+)</span>
                </td>
                {habitHistory.map((d, i) => (
                  <td key={i} className="py-3 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${
                        d.sleepDone
                          ? 'bg-[#39ff14]/20 text-[#39ff14] border border-[#39ff14]/40'
                          : 'bg-slate-900 text-slate-600 border border-slate-800'
                      }`}
                    >
                      {d.sleepDone ? '✓' : '–'}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Water row */}
              <tr>
                <td className="py-3 font-semibold text-slate-200 flex items-center gap-2">
                  <Droplets className="w-3.5 h-3.5 text-sky-400" />
                  <span>Hydratace (3,5L)</span>
                </td>
                {habitHistory.map((d, i) => (
                  <td key={i} className="py-3 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${
                        d.waterDone
                          ? 'bg-[#39ff14]/20 text-[#39ff14] border border-[#39ff14]/40'
                          : 'bg-slate-900 text-slate-600 border border-slate-800'
                      }`}
                    >
                      {d.waterDone ? '✓' : '–'}
                    </span>
                  </td>
                ))}
              </tr>

              {/* Junk food row */}
              <tr>
                <td className="py-3 font-semibold text-slate-200 flex items-center gap-2">
                  <Ban className="w-3.5 h-3.5 text-rose-400" />
                  <span>Bez junk foodu &amp; cukru</span>
                </td>
                {habitHistory.map((d, i) => (
                  <td key={i} className="py-3 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${
                        d.noJunkDone
                          ? 'bg-[#39ff14]/20 text-[#39ff14] border border-[#39ff14]/40'
                          : 'bg-slate-900 text-slate-600 border border-slate-800'
                      }`}
                    >
                      {d.noJunkDone ? '✓' : '–'}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
