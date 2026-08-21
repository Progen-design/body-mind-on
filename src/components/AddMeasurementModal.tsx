import React, { useState } from 'react';
import { X, Scale, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { WeightRecord } from '../types';

interface AddMeasurementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: WeightRecord) => void;
  latestWeight?: number;
}

export const AddMeasurementModal: React.FC<AddMeasurementModalProps> = ({
  isOpen,
  onClose,
  onSave,
  latestWeight = 104.6
}) => {
  const [weight, setWeight] = useState(latestWeight.toString().replace(',', '.'));
  const [fat, setFat] = useState('11.6');
  const [muscle, setMuscle] = useState('88.9');
  const [note, setNote] = useState('Manuální zápis po ranním vážení');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(weight.replace(',', '.')) || latestWeight;
    const f = parseFloat(fat.replace(',', '.')) || 11.6;
    const m = parseFloat(muscle.replace(',', '.')) || 88.9;
    // Estimated BMI (height ~1.82 m)
    const bmi = Math.round((w / (1.82 * 1.82)) * 10) / 10;

    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.`;

    onSave({
      date: formattedDate,
      weight: w,
      fatPercent: f,
      muscleKg: m,
      bmi: bmi,
      note: note.trim()
    });

    onClose();
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

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-md bg-[#0c1017] rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,242,254,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Zadat nové tělesné měření
              </h3>
              <p className="text-xs text-slate-400">
                Data se promítnou do grafu a analýzy AI Trenéra
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Váha (kg)
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-[#00f2fe] focus:outline-none rounded-xl px-3 py-2.5 text-sm font-bold text-white shadow-inner"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Tuk (%)
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-700 focus:border-[#39ff14] focus:outline-none rounded-xl px-3 py-2.5 text-sm font-bold text-white shadow-inner"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Svalová hmota (kg)
            </label>
            <input
              type="number"
              step="0.1"
              required
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700 focus:border-[#00f2fe] focus:outline-none rounded-xl px-3 py-2.5 text-sm font-bold text-white shadow-inner"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Poznámka
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="např. Měřeno nalačno, dobrý spánek"
              className="w-full bg-slate-900/90 border border-slate-700 focus:border-slate-500 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-white"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
            >
              Zrušit
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#39ff14] hover:opacity-95 shadow-[0_0_15px_rgba(0,242,254,0.3)] cursor-pointer"
            >
              Uložit měření
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
