import React from 'react';
import { X, Clock, ChefHat, Sparkles, CheckCircle2, RefreshCw, Flame, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { MealItem } from '../types';

interface RecipeModalProps {
  meal: MealItem | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleComplete?: (id: string) => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({
  meal,
  isOpen,
  onClose,
  onToggleComplete
}) => {
  if (!isOpen || !meal) return null;

  const recipe = meal.recipe || {
    prepTimeMin: 10,
    cookTimeMin: 15,
    difficulty: 'Snadné' as const,
    instructions: [
      'Připravte si všechny čerstvé suroviny podle gramáže.',
      'Suroviny zpracujte tepelně na mírném ohni s minimem přepáleného tuku.',
      'Dochuťte čerstvými bylinkami, mořskou solí a kvalitním pepřem.',
      'Servírujte čerstvé pro maximální nutriční zachování mikroživin.'
    ],
    tips: 'Konzumujte v klidu a dostatečně žvýkejte pro podporu optimální enzymatické aktivity v žaludku.',
    replacements: ['Lze zaměnit za odpovídající zdroj bílkovin či komplexních sacharidů dle preferencí.']
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
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-start justify-between bg-gradient-to-r from-[#0e1624] to-[#0c1017]">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-cyan-950 text-[#00f2fe] border border-cyan-500/40">
                {meal.type} • {meal.time}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-slate-300 border border-slate-700">
                {recipe.difficulty}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {meal.title}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {/* Quick Metrics Bar (Calories & Macros) */}
          <div className="grid grid-cols-4 gap-2.5 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
            <div>
              <span className="text-[11px] text-slate-400 font-semibold block">Kalorie</span>
              <span className="text-base sm:text-lg font-black text-amber-400">{meal.calories} kcal</span>
            </div>
            <div>
              <span className="text-[11px] text-[#00f2fe] font-semibold block">Bílkoviny</span>
              <span className="text-base sm:text-lg font-black text-white">{meal.protein} g</span>
            </div>
            <div>
              <span className="text-[11px] text-[#2dd4bf] font-semibold block">Sacharidy</span>
              <span className="text-base sm:text-lg font-black text-white">{meal.carbs} g</span>
            </div>
            <div>
              <span className="text-[11px] text-[#39ff14] font-semibold block">Tuky</span>
              <span className="text-base sm:text-lg font-black text-white">{meal.fat} g</span>
            </div>
          </div>

          {/* Time & Prep info */}
          <div className="flex items-center gap-4 text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Příprava: <strong>{recipe.prepTimeMin} min</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Vaření/pečení: <strong>{recipe.cookTimeMin} min</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-[#39ff14]" />
              <span>Náročnost: <strong>{recipe.difficulty}</strong></span>
            </div>
          </div>

          {/* Ingredients list */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <span>Suroviny (Přesná gramáž)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {meal.ingredients.map((ing, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-medium text-slate-200"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00f2fe]" />
                  <span>{ing}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Step-by-Step Instructions */}
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
              Postup přípravy krok za krokem
            </h4>
            <div className="space-y-3">
              {recipe.instructions.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs sm:text-sm">
                  <div className="w-6 h-6 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-[#00f2fe] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-slate-300 leading-relaxed pt-0.5">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Chef Tip & Nutrition Note */}
          {recipe.tips && (
            <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-[#00f2fe] shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-[#00f2fe] block mb-0.5">Nutriční tip AI Trenéra:</span>
                <p className="text-slate-300">{recipe.tips}</p>
              </div>
            </div>
          )}

          {/* Alternative Replacements */}
          {recipe.replacements && recipe.replacements.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 text-xs space-y-1">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-[#39ff14]" />
                Možné alternativy a záměny:
              </span>
              <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                {recipe.replacements.map((rep, rIdx) => (
                  <li key={rIdx}>{rep}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 transition-all"
          >
            Zavřít
          </button>

          {onToggleComplete && (
            <button
              onClick={() => {
                onToggleComplete(meal.id);
                onClose();
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                meal.completed
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(57,255,20,0.3)]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{meal.completed ? 'Označit jako nesnědeno' : 'Označit jako snědeno (+ ' + meal.calories + ' kcal)'}</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
