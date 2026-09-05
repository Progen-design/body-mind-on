import React, { useState } from 'react';
import { X, Check, Dumbbell, Clock, Flame, Shield, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { WorkoutDay, ExerciseItem } from '../types';
import { treninkoveDny, vybranyTrenink } from '../lib/trenink';

interface WeeklyWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: WorkoutDay[];
  onToggleExercise: (dayName: string, exerciseId: string) => void;
}

export const WeeklyWorkoutModal: React.FC<WeeklyWorkoutModalProps> = ({
  isOpen,
  onClose,
  workouts,
  onToggleExercise
}) => {
  // null = uzivatel zatim nic nevybral, den se odvodi z dat.
  const [selectedDayName, setSelectedDayName] = useState<string | null>(null);

  if (!isOpen) return null;

  // Uzivatel s jidelnickem, ale bez treninkovych dnu se sem dostane (maPlan
  // ho pusti dal) a driv tu dostal undefined -> pad na currentDay.dayName.
  //
  // `workouts` teď nese i dny volna (docs/DALSI_KROK.md 8.14) — vybírá se
  // jen z `treninkoveDny()`, ať vybraný den nikdy není den volna, ani jako
  // shoda jména, ani jako fallback na dnešek/první den.
  const currentDay = vybranyTrenink(treninkoveDny(workouts), selectedDayName);

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

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-3xl max-h-[90vh] bg-[#0c1017] rounded-3xl border border-lime-500/30 shadow-[0_0_50px_rgba(57,255,20,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center text-[#39ff14]">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Týdenní tréninkový rozpis &amp; Cviky
              </h3>
              <p className="text-xs text-slate-400">
                Týdenní rozpis podle tvého plánu
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Day selector tabs */}
        <div className="p-3 bg-[#0e1420] border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto">
          {workouts.map((day) => {
            const isSelected = day.dayName === currentDay.dayName;
            const jeVolno = day.maTrenink === false;
            return (
              <button
                key={day.dayName}
                type="button"
                disabled={jeVolno}
                onClick={jeVolno ? undefined : () => setSelectedDayName(day.dayName)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  jeVolno
                    ? 'text-slate-600 cursor-default border border-transparent'
                    : isSelected
                      ? 'bg-lime-500/20 text-[#39ff14] border border-[#39ff14]/50 shadow-[0_0_12px_rgba(57,255,20,0.25)]'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
                }`}
              >
                <span>{day.dayShort}</span>
                {day.isToday && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00f2fe] animate-pulse" />
                )}
                {!jeVolno && day.isCompleted && (
                  <Check className="w-3 h-3 text-[#39ff14]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day workout overview */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900/90 to-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#39ff14] uppercase tracking-wider">
                  {currentDay.dayName} {currentDay.isToday && '• Dnešní fokus'}
                </span>
              </div>
              <h4 className="text-lg sm:text-xl font-bold text-white mt-0.5">
                {currentDay.title}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {currentDay.focus}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>{currentDay.durationMin} min</span>
              </div>
              {/* Spálené kalorie u plánovaného tréninku neměříme — odznak se skryje celý. */}
              {currentDay.caloriesBurned > 0 && (
                <div className="px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span>~{currentDay.caloriesBurned} kcal</span>
                </div>
              )}
            </div>
          </div>

          {/* Exercise items list */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
              Seznam cviků ({currentDay.exercises.length})
            </div>

            {currentDay.exercises.map((exercise, idx) => (
              <div
                key={exercise.id}
                onClick={() => onToggleExercise(currentDay.dayName, exercise.id)}
                className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 ${
                  exercise.completed
                    ? 'bg-slate-900/60 border-slate-800'
                    : 'bg-slate-950/80 border-slate-800/60 hover:border-lime-500/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                      exercise.completed
                        ? 'bg-[#39ff14] text-slate-950 shadow-[0_0_8px_#39ff14]'
                        : 'bg-slate-800 text-transparent border border-slate-700'
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </button>

                  <div>
                    <div className="text-sm sm:text-base font-semibold text-white">
                      {idx + 1}. {exercise.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {exercise.targetMuscle && (
                        <>Cíl: <span className="text-cyan-400">{exercise.targetMuscle}</span></>
                      )}
                      {exercise.targetMuscle && exercise.restSec > 0 && ' • '}
                      {exercise.restSec > 0 && <>Pauza: {exercise.restSec} s</>}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs sm:text-sm font-bold text-white">
                    {exercise.sets} série × {exercise.reps}
                  </div>
                  {exercise.weightKg && (
                    <div className="text-xs font-semibold text-[#39ff14] mt-0.5">
                      {exercise.weightKg} kg
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Kliknutím na cvik označíte odcvičené série.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#39ff14]"
          >
            Zavřít
          </button>
        </div>
      </motion.div>
    </div>
  );
};
