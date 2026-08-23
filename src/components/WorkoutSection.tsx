import React, { useState } from 'react';
import {
  Dumbbell,
  Clock,
  Flame,
  CheckCircle2,
  Calendar,
  CalendarDays,
  Play,
  TrendingUp,
  Award,
  ChevronRight,
  Sparkles,
  PlayCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { WorkoutDay } from '../types';
import { dnesniTrenink, jeNaplanovany, vybranyTrenink } from '../lib/trenink';
import { serieOpakovaniSlovy } from '../../lib/profile/treninkPopis.js';
import { Vysvetlivka } from './Vysvetlivka';
import { NadpisSekce } from './NadpisSekce';

interface WorkoutSectionProps {
  workouts: WorkoutDay[];
  onToggleExercise: (dayName: string, exerciseId: string) => void;
  onOpenWorkoutLogger: () => void;
  onOpenWeeklyModal: () => void;
}

export const WorkoutSection: React.FC<WorkoutSectionProps> = ({
  workouts,
  onToggleExercise,
  onOpenWorkoutLogger,
  onOpenWeeklyModal
}) => {
  // null = uzivatel zatim nic nevybral, vybrany den se odvodi z dat.
  // Ulozeny nazev dne by po pregenerovani planu ukazoval na neexistujici den.
  const [selectedDayName, setSelectedDayName] = useState<string | null>(null);
  // Otevřená ukázka provedení. Jedna naráz — animace z ExerciseDB mají
  // stovky kB a načítat je všechny zbytečně zdrží i vypadá to nepřehledně.
  const [otevrenaUkazka, setOtevrenaUkazka] = useState<string | null>(null);

  const selectedWorkout = vybranyTrenink(workouts, selectedDayName);
  const todayWorkout = dnesniTrenink(workouts);
  const maDnesTrenink = jeNaplanovany(todayWorkout);

  const totalWeeklyCalories = workouts.reduce((acc, w) => acc + (w.isCompleted ? w.caloriesBurned : 0), 0);
  const totalCompletedWorkouts = workouts.filter(w => w.isCompleted).length;

  /**
   * Věta o tom, proč jsou v týdnu různé tréninky a co která jmenovka znamená.
   *
   * „Trénink A" a „Trénink B" nikomu nic neřeknou — je to jen označení
   * v plánu. Vysvětlení se proto skládá z toho, co ty jednotky doopravdy
   * obsahují: název, kolikrát v týdnu je, a jaké svalové skupiny zabírá.
   */
  const vysvetleniStridani = React.useMemo(() => {
    const podleNazvu = new Map<string, { pocet: number; zamereni: string }>();
    for (const w of workouts) {
      const nazev = String(w.title || '').trim();
      if (!nazev) continue;
      const zaznam = podleNazvu.get(nazev);
      if (zaznam) zaznam.pocet += 1;
      else podleNazvu.set(nazev, { pocet: 1, zamereni: String(w.focus || '') });
    }
    if (podleNazvu.size < 2) return null;

    const casti = [...podleNazvu].map(([nazev, { pocet, zamereni }]) => {
      const kolikrat = pocet === 1 ? '1× týdně' : `${pocet}× týdně`;
      return zamereni ? `${nazev} (${kolikrat}) — ${zamereni}` : `${nazev} — ${kolikrat}`;
    });

    return `V týdnu se střídají ${podleNazvu.size} různé jednotky, aby každá partie dostala víc typů zátěže a mezi stejnými cviky byl odstup na zotavení. ${casti.join('. ')}.`;
  }, [workouts]);

  return (
    <div className="space-y-6">
      <NadpisSekce
        titulek="Tréninkový plán"
        podtitulek="Dnešní jednotka, týdenní rozpis a záznam odcvičeného"
        ikona={<Dumbbell className="w-5 h-5 text-[#39ff14]" />}
      />

      {/* Top Banner: Today's Active Workout Hero */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-[#0d1722] via-[#0d141e] to-[#091512] border border-lime-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {/* ETAPA 3.6. Fallback na prvni treninkovy den je spravny, ale
                nadpis "Dnesni naplanovany trenink (PATEK)" se ukazoval
                i v sobotu, kdy naplanovany neni. Kdyz dnes trenink neni,
                nadpis to rekne. */}
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              {!maDnesTrenink
                ? 'Dnes trénink naplánovaný nemáš'
                : todayWorkout.isToday
                  ? `Dnešní naplánovaný trénink (${todayWorkout.dayName})`
                  : `Nejbližší trénink v plánu (${todayWorkout.dayName})`}
            </span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span>{todayWorkout.title}</span>
            {maDnesTrenink && todayWorkout.durationMin > 0 && (
              <span className="text-sm font-semibold text-slate-400">
                ({todayWorkout.durationMin} min
                {todayWorkout.caloriesBurned > 0 && ` • ${todayWorkout.caloriesBurned} kcal`})
              </span>
            )}
          </h3>

          {/* ZAMĚŘENÍ MÍSTO „FOKUS: VARIANTA B".
              Pod nadpisem „Trénink B" stálo „Fokus: Varianta B" — tentýž
              údaj podruhé. Teď se vypíšou svalové skupiny složené ze cviků
              toho dne (viz lib/profile/treninkPopis.js). */}
          {todayWorkout.focus && (
            <p className="text-xs sm:text-sm text-slate-300">
              Zaměření: <strong className="text-slate-100">{todayWorkout.focus}</strong>
            </p>
          )}

          {/* Co si připravit. Bez toho člověk zjistí až u stroje, že cvik
              potřebuje velkou činku, kterou doma nemá. */}
          {todayWorkout.naradi && todayWorkout.naradi.length > 0 && (
            <p className="text-xs text-slate-400">
              Nářadí: <span className="text-slate-300">{todayWorkout.naradi.join(', ')}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenWorkoutLogger}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-all active:scale-95"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Spustit záznam tréninku</span>
          </button>

          <button
            onClick={onOpenWeeklyModal}
            className="px-4 py-3 rounded-2xl text-xs font-bold text-slate-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition-all"
          >
            Celý rozpis
          </button>
        </div>
      </motion.div>

      {/* Week Split Navigator (PO - NE) */}
      <div className="space-y-4">
        <NadpisSekce
          uroven="podsekce"
          titulek="Týdenní rozpis"
          podtitulek={`Splněno ${totalCompletedWorkouts} z ${workouts.length} jednotek${
            totalWeeklyCalories > 0 ? ` (${totalWeeklyCalories} kcal)` : ''
          }`}
          ikona={<CalendarDays className="w-4 h-4 text-[#00f2fe]" />}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {workouts.map(w => {
            const isSelected = w.dayName === selectedDayName;
            return (
              <button
                key={w.dayName}
                onClick={() => setSelectedDayName(w.dayName)}
                className={`p-3 rounded-2xl border text-left transition-all relative select-none ${
                  isSelected
                    ? 'bg-cyan-950/40 border-[#00f2fe]/60 shadow-[0_0_15px_rgba(0,242,254,0.2)]'
                    : 'bg-[#0e131d]/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                {w.isToday && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#00f2fe] animate-ping" />
                )}

                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold text-slate-200">{w.dayShort}</span>
                  {w.isCompleted ? (
                    <span className="text-[10px] font-bold text-[#39ff14]">✓ Hotovo</span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-medium">{w.durationMin}m</span>
                  )}
                </div>

                <div className="text-xs font-bold text-white truncate mt-1">
                  {w.title}
                </div>
                {w.caloriesBurned > 0 && (
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {w.caloriesBurned} kcal
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* PROČ SE TRÉNINKY STŘÍDAJÍ.
            „Trénink A" a „Trénink B" jsou jen jmenovky a nikomu nic neřeknou.
            Věta se skládá ze skutečných jednotek v plánu, takže sedí i tehdy,
            když jich je jiný počet nebo se jmenují jinak. */}
        {vysvetleniStridani && (
          <p className="text-xs text-slate-400 leading-relaxed bg-slate-900/50 border border-slate-800 rounded-2xl p-3.5">
            {vysvetleniStridani}
          </p>
        )}
      </div>

      {/* Selected Day Exercise Matrix */}
      <div className="rounded-3xl p-5 sm:p-6 bg-[#0e131d]/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#39ff14]">
              {[selectedWorkout.dayName, selectedWorkout.focus].filter(Boolean).join(' • ')}
            </div>
            <h4 className="text-lg font-bold text-white tracking-tight mt-0.5">
              {selectedWorkout.title}
            </h4>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 font-semibold inline-flex items-center gap-1">
              {selectedWorkout.exercises.length} cviků
              {/* Otazník k zápisu „3 × 8–10" je jednou u seznamu, ne u každého cviku. */}
              <Vysvetlivka pojem="zapis_serii" />
            </span>
            {selectedWorkout.caloriesBurned > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-[#39ff14] font-bold border border-emerald-500/30">
                {selectedWorkout.caloriesBurned} kcal
              </span>
            )}
          </div>
        </div>

        {/* Exercises Table / List */}
        <div className="space-y-3">
          {selectedWorkout.exercises.map((ex, i) => (
            <div
              key={ex.id}
              className={`rounded-2xl border transition-all ${
                ex.completed
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
            <div
              onClick={() => onToggleExercise(selectedWorkout.dayName, ex.id)}
              className="p-4 cursor-pointer flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-6 h-6 rounded-xl border flex items-center justify-center transition-all ${
                    ex.completed
                      ? 'bg-[#39ff14] border-[#39ff14] text-slate-950 shadow-[0_0_8px_#39ff14]'
                      : 'border-slate-700 bg-slate-900 text-transparent'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                </div>

                <div>
                  <h5 className={`text-sm font-bold ${ex.completed ? 'text-emerald-300 line-through' : 'text-slate-100'}`}>
                    {i + 1}. {ex.name}
                  </h5>
                  {/* ZÁPIS ROZEPSANÝ SLOVY.
                      „3 × 8–10" je jasné tomu, kdo posilovnu zná. Kdo v ní
                      stojí poprvé, potřebuje větu. Svalovou skupinu doplňuje
                      /api/profile z registru cviků; když u cviku chybí,
                      nekreslí se — radši nic než vymyšlený sval. */}
                  <p className="text-xs text-slate-400">
                    {serieOpakovaniSlovy(ex.sets, ex.reps) || null}
                    {serieOpakovaniSlovy(ex.sets, ex.reps) && ex.targetMuscle && ' • '}
                    {ex.targetMuscle && <>zabírá {ex.targetMuscle}</>}
                    {ex.restSec > 0 && <> • pauza {ex.restSec} s</>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-extrabold text-slate-200">
                  {ex.sets} × {ex.reps}
                </span>
                {ex.weightKg && (
                  <span className="px-3 py-1 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-xs font-extrabold text-[#00f2fe]">
                    {ex.weightKg} kg
                  </span>
                )}

                {/* JAK SE TO CVIČÍ. Ukázku plán nese u každého cviku jako
                    `gif_url`, ale nikde se nezobrazovala — člověk viděl jen
                    název a musel si provedení domýšlet. Otevírá se na klik,
                    aby seznam zůstal přehledný a animace se nenačítaly
                    všechny naráz. */}
                {ex.ukazkaUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOtevrenaUkazka(otevrenaUkazka === ex.id ? null : ex.id);
                    }}
                    className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 transition-all ${
                      otevrenaUkazka === ex.id
                        ? 'bg-cyan-950/70 border-cyan-500/50 text-[#00f2fe]'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-cyan-500/40'
                    }`}
                    title="Ukázat provedení cviku"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Jak na to</span>
                  </button>
                )}
              </div>
            </div>

            {ex.ukazkaUrl && otevrenaUkazka === ex.id && (
              <div className="px-4 pb-4">
                <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                  <img
                    src={ex.ukazkaUrl}
                    alt={`Provedení cviku ${ex.name}`}
                    loading="lazy"
                    className="w-full max-h-72 object-contain bg-white"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  {serieOpakovaniSlovy(ex.sets, ex.reps)}
                  {ex.targetMuscle && ` • zabírá ${ex.targetMuscle}`}
                </p>
              </div>
            )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
