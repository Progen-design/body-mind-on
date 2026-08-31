import React, { useState, useEffect } from 'react';
import {
  X,
  Dumbbell,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Plus,
  Flame,
  Clock,
  Sparkles,
  Save
} from 'lucide-react';
import { motion } from 'motion/react';
import { WorkoutDay, ExerciseItem } from '../types';
import { jeNaplanovany } from '../lib/trenink';
import {
  PERCEIVED_DIFFICULTIES,
  PERCEIVED_DIFFICULTY_LABELS,
  WORKOUT_TYPES,
  WORKOUT_TYPE_LABELS
} from '../../lib/workoutTypes.js';

interface WorkoutLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayWorkout: WorkoutDay;
  onToggleExercise: (dayName: string, exerciseId: string) => void;
  /**
   * Zapise trenink na server. Dostane jen to, co uzivatel zadal — modal nic
   * neprepocitava ani nepredvyplnuje. Vraci true pri uspechu.
   */
  onSaveWorkout: (vstup: {
    sekundyStopek: number;
    obtiznost: string | null;
    typ: string | null;
  }) => Promise<boolean>;
}

export const WorkoutLoggerModal: React.FC<WorkoutLoggerModalProps> = ({
  isOpen,
  onClose,
  todayWorkout,
  onToggleExercise,
  onSaveWorkout
}) => {
  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [uklada, setUklada] = useState(false);
  // null = uzivatel nevybral. Nic neni predvolene: predvyplnena hodnota by
  // byla odpoved, kterou nedal.
  const [obtiznost, setObtiznost] = useState<string | null>(null);
  const [typTreninku, setTypTreninku] = useState<string | null>(null);

  // New exercise form

  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  useEffect(() => {
    let restInterval: any = null;
    if (restTimer !== null && restTimer > 0) {
      restInterval = setInterval(() => {
        setRestTimer(t => (t !== null && t > 0 ? t - 1 : null));
      }, 1000);
    }
    return () => clearInterval(restInterval);
  }, [restTimer]);

  if (!isOpen) return null;

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const completedCount = todayWorkout.exercises.filter(e => e.completed).length;
  // Prazdny todayWorkout (den volna) neni chyba dat — jen v planu dnes nic
  // neni. Hlavicka a seznam cviku to musi rict rovnou, ne ukazat "0 z 0"
  // jako by trenink existoval a byl prazdny (docs/DALSI_KROK.md 6.11).
  const maPlan = jeNaplanovany(todayWorkout);

  const handleStartRest = (sec: number) => {
    setRestTimer(sec);
  };

  const handleSave = async () => {
    if (uklada) return;
    setUklada(true);
    setIsTimerRunning(false);
    const ok = await onSaveWorkout({ sekundyStopek: timerSeconds, obtiznost, typ: typTreninku });
    setUklada(false);
    if (ok) onClose();
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-[#0c1017] rounded-3xl border border-cyan-500/40 shadow-[0_0_50px_rgba(0,242,254,0.2)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-[#0e1624] to-[#0c1017]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  {maPlan ? `Aktivní trénink • ${todayWorkout.dayName}` : 'Trénink mimo plán'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {maPlan ? todayWorkout.title : 'Vlastní trénink'}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Timer & Rest Timer Bar */}
        <div className="p-4 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Main Stopwatch */}
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400 font-semibold">Trvání tréninku:</div>
            <div className="text-xl font-mono font-black text-[#00f2fe] bg-slate-950 px-3 py-1 rounded-xl border border-cyan-500/30 shadow-inner">
              {formatTime(timerSeconds)}
            </div>
            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="p-2 rounded-xl bg-cyan-950/60 text-[#00f2fe] border border-cyan-500/40 hover:bg-cyan-900/60"
            >
              {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {
                setIsTimerRunning(false);
                setTimerSeconds(0);
              }}
              className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Rest Timer preset buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-semibold hidden sm:inline">Pauza:</span>
            {[60, 90, 120].map(sec => (
              <button
                key={sec}
                onClick={() => handleStartRest(sec)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  restTimer === sec
                    ? 'bg-[#39ff14] text-slate-950 font-black'
                    : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                {sec}s
              </button>
            ))}
            {restTimer !== null && (
              <span className="px-2 py-1 rounded-lg bg-emerald-950 text-[#39ff14] text-xs font-mono font-bold border border-emerald-500/40 animate-pulse">
                {restTimer}s
              </span>
            )}
          </div>
        </div>

        {/* Exercises list with checkmarks */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-3 flex-1">
          {maPlan ? (
            <>
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Cviky a série ({completedCount} z {todayWorkout.exercises.length} hotovo)
                </span>
                <span className="text-xs text-[#39ff14] font-semibold">
                  {todayWorkout.caloriesBurned > 0 ? `Cíl: ${todayWorkout.caloriesBurned} kcal` : ''}
                </span>
              </div>

              {todayWorkout.exercises.map((ex, idx) => (
                <div
                  key={ex.id}
                  onClick={() => onToggleExercise(todayWorkout.dayName, ex.id)}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
                    ex.completed
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-white'
                      : 'bg-[#0e131d]/90 border-slate-800 hover:border-cyan-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
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
                      <h4 className={`text-sm font-bold ${ex.completed ? 'text-emerald-300' : 'text-slate-100'}`}>
                        {idx + 1}. {ex.name}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {ex.targetMuscle && <>Cílový sval: {ex.targetMuscle}</>}
                        {ex.targetMuscle && ex.restSec > 0 && ' • '}
                        {ex.restSec > 0 && <>Pauza {ex.restSec}s</>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200">
                      {ex.sets} × {ex.reps}
                    </span>
                    {ex.weightKg && (
                      <span className="px-2.5 py-1 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-xs font-bold text-[#00f2fe]">
                        {ex.weightKg} kg
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="p-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 text-sm text-slate-400">
              Dnes nemáš v plánu žádný trénink — klidně si zapiš čas a pocit z toho, co sis dal navíc.
            </div>
          )}
        </div>

        {/* Jak to slo a co to bylo — obojí jde přeskočit */}
        <div className="px-4 sm:px-5 pb-4 space-y-4 border-t border-slate-800 pt-4">
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Jak trénink šel?
            </div>
            <div className="flex flex-wrap gap-2">
              {PERCEIVED_DIFFICULTIES.map((klic: string) => {
                const vybrano = obtiznost === klic;
                return (
                  <button
                    key={klic}
                    type="button"
                    onClick={() => setObtiznost(vybrano ? null : klic)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
                      vybrano
                        ? 'bg-cyan-950/60 border-[#00f2fe]/60 text-[#00f2fe] shadow-[0_0_10px_rgba(0,242,254,0.2)]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {(PERCEIVED_DIFFICULTY_LABELS as Record<string, string>)[klic]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Typ tréninku
            </div>
            <div className="flex flex-wrap gap-2">
              {WORKOUT_TYPES.map((klic: string) => {
                const vybrano = typTreninku === klic;
                return (
                  <button
                    key={klic}
                    type="button"
                    onClick={() => setTypTreninku(vybrano ? null : klic)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
                      vybrano
                        ? 'bg-emerald-950/60 border-[#39ff14]/50 text-[#39ff14] shadow-[0_0_10px_rgba(57,255,20,0.18)]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {(WORKOUT_TYPE_LABELS as Record<string, string>)[klic]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              Bez výběru se trénink uloží jako „Ostatní“. Vyplnit nemusíš.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
          >
            Zavřít
          </button>

          <button
            onClick={handleSave}
            disabled={uklada}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(57,255,20,0.3)] active:scale-95 disabled:opacity-60"
          >
            <Save className={`w-4 h-4 ${uklada ? 'animate-pulse' : ''}`} />
            <span>{uklada ? 'Ukládám…' : 'Uložit a dokončit trénink'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
