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

interface WorkoutLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayWorkout: WorkoutDay;
  onToggleExercise: (dayName: string, exerciseId: string) => void;
  onAddExercise?: (dayName: string, exercise: ExerciseItem) => void;
}

export const WorkoutLoggerModal: React.FC<WorkoutLoggerModalProps> = ({
  isOpen,
  onClose,
  todayWorkout,
  onToggleExercise,
  onAddExercise
}) => {
  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [restTimer, setRestTimer] = useState<number | null>(null);

  // New exercise form
  const [showAddEx, setShowAddEx] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExSets, setNewExSets] = useState('4');
  const [newExReps, setNewExReps] = useState('8-10');
  const [newExWeight, setNewExWeight] = useState('50');

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

  const handleStartRest = (sec: number) => {
    setRestTimer(sec);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName.trim() || !onAddExercise) return;

    onAddExercise(todayWorkout.dayName, {
      id: `ex-${Date.now()}`,
      name: newExName.trim(),
      sets: parseInt(newExSets) || 3,
      reps: newExReps.trim() || '10',
      weightKg: parseFloat(newExWeight) || 0,
      restSec: 90,
      targetMuscle: todayWorkout.title,
      completed: true
    });

    setNewExName('');
    setShowAddEx(false);
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
                  Aktivní trénink • {todayWorkout.dayName}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {todayWorkout.title}
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
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Cviky a série ({completedCount} z {todayWorkout.exercises.length} hotovo)
            </span>
            <span className="text-xs text-[#39ff14] font-semibold">
              Cíl: {todayWorkout.caloriesBurned} kcal
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
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(57,255,20,0.3)] active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Uložit a dokončit trénink</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
