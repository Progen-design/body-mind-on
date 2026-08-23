import React, { useState } from 'react';
import { X, Check, Plus, Utensils, Flame, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MealItem } from '../types';

interface MealPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  meals: MealItem[];
  onToggleMeal: (id: string) => void;
}

export const MealPlanModal: React.FC<MealPlanModalProps> = ({
  isOpen,
  onClose,
  meals,
  onToggleMeal,
}) => {

  if (!isOpen) return null;

  const totalCalories = meals.reduce((acc, m) => acc + (m.completed ? m.calories : 0), 0);
  const plannedCalories = meals.reduce((acc, m) => acc + m.calories, 0);
  const totalProtein = meals.reduce((acc, m) => acc + (m.completed ? m.protein : 0), 0);
  const totalCarbs = meals.reduce((acc, m) => acc + (m.completed ? m.carbs : 0), 0);
  const totalFat = meals.reduce((acc, m) => acc + (m.completed ? m.fat : 0), 0);


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
        className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-[#0c1017] rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,242,254,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Dnešní jídelníček &amp; Makra
              </h3>
              <p className="text-xs text-slate-400">
                Plánováno: {plannedCalories} kcal • Snědeno: {totalCalories} kcal
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

        {/* Macro summary pills */}
        <div className="px-5 py-3 bg-[#0e1420] border-b border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-xl bg-slate-900/80 border border-cyan-500/20">
            <div className="text-slate-400">Bílkoviny (B)</div>
            <div className="text-sm font-bold text-[#00f2fe]">{totalProtein}g</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/80 border border-teal-500/20">
            <div className="text-slate-400">Sacharidy (S)</div>
            <div className="text-sm font-bold text-[#2dd4bf]">{totalCarbs}g</div>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/80 border border-lime-500/20">
            <div className="text-slate-400">Tuky (T)</div>
            <div className="text-sm font-bold text-[#39ff14]">{totalFat}g</div>
          </div>
        </div>

        {/* Meal List */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-3.5 flex-1">
          {meals.map((meal) => (
            <div
              key={meal.id}
              onClick={() => onToggleMeal(meal.id)}
              className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                meal.completed
                  ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  : 'bg-slate-950/80 border-slate-800/50 opacity-60 hover:opacity-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                      meal.completed
                        ? 'bg-[#39ff14] text-slate-950 shadow-[0_0_8px_#39ff14]'
                        : 'bg-slate-800 text-transparent border border-slate-700'
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </button>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                        {meal.type} • {meal.time}
                      </span>
                    </div>
                    <div className={`text-sm sm:text-base font-semibold mt-0.5 ${meal.completed ? 'text-white' : 'text-slate-400'}`}>
                      {meal.title}
                    </div>

                    {meal.ingredients.length > 0 && (
                      <div className="text-xs text-slate-400 mt-1.5 flex flex-wrap gap-1.5">
                        {meal.ingredients.map((ing, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 text-[11px]">
                            {ing}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right whitespace-nowrap">
                  <div className="text-sm font-bold text-white">
                    {meal.calories} kcal
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 space-x-1.5">
                    <span>B:{meal.protein}g</span>
                    <span>S:{meal.carbs}g</span>
                    <span>T:{meal.fat}g</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>AI trenér hlídá optimální časování živin.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#39ff14]"
          >
            Hotovo
          </button>
        </div>
      </motion.div>
    </div>
  );
};
