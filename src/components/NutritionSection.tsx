import React from 'react';
import {
  Utensils,
  BookOpen,
  ShoppingBag,
  Download,
  CheckCircle2,
  ChevronRight,
  Flame,
  Sparkles,
  Plus
} from 'lucide-react';
import { motion } from 'motion/react';
import { Vysvetlivka } from './Vysvetlivka';
import { MealItem } from '../types';

interface NutritionSectionProps {
  meals: MealItem[];
  currentCalories: number;
  targetCalories: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  onToggleMeal: (id: string) => void;
  onSelectRecipe: (meal: MealItem) => void;
  onOpenWeeklyPlan: () => void;
  onOpenShoppingList: () => void;
  onExportPdf: () => void;
  onAddCustomMeal?: () => void;
}

export const NutritionSection: React.FC<NutritionSectionProps> = ({
  meals,
  currentCalories,
  targetCalories,
  proteinPct,
  carbsPct,
  fatPct,
  onToggleMeal,
  onSelectRecipe,
  onOpenWeeklyPlan,
  onOpenShoppingList,
  onExportPdf,
  onAddCustomMeal
}) => {
  const totalProteinGrams = meals.reduce((acc, m) => acc + (m.completed ? m.protein : 0), 0);
  const totalCarbsGrams = meals.reduce((acc, m) => acc + (m.completed ? m.carbs : 0), 0);
  const totalFatGrams = meals.reduce((acc, m) => acc + (m.completed ? m.fat : 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner: Macros & Calorie Tracker Overview */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-[#0e1624] via-[#0c121c] to-[#0d161a] border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Calorie Stats */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Denní příjem &amp; Makronutrienty{' '}
                <Vysvetlivka pojem="makroziviny" />
              </span>
              {/* „Fáze: Čistá hypertrofie" byla natvrdo pro každého bez ohledu
                  na cíl. Žádné pole s fází jídelníčku neexistuje. */}
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                {currentCalories.toLocaleString('cs-CZ')}
              </span>
              <span className="text-sm sm:text-base text-slate-400 font-medium">
                kcal / cíl {targetCalories.toLocaleString('cs-CZ')} kcal
              </span>
              <span className="text-xs font-bold text-[#00f2fe] bg-cyan-950/60 px-2.5 py-1 rounded-full border border-cyan-500/30">
                Zbývá {Math.max(0, targetCalories - currentCalories)} kcal
              </span>
            </div>
          </div>

          {/* Segmented Macro Bar */}
          <div className="flex-1 max-w-xl space-y-2.5">
            <div className="flex items-center gap-1.5 h-3 w-full rounded-full overflow-hidden p-0.5 bg-slate-950 border border-slate-800">
              <div
                style={{ width: `${proteinPct}%` }}
                className="h-full rounded-full bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]"
                title={`Bílkoviny: ${proteinPct}%`}
              />
              <div
                style={{ width: `${carbsPct}%` }}
                className="h-full rounded-full bg-[#2dd4bf] shadow-[0_0_8px_#2dd4bf]"
                title={`Sacharidy: ${carbsPct}%`}
              />
              <div
                style={{ width: `${fatPct}%` }}
                className="h-full rounded-full bg-[#39ff14] shadow-[0_0_8px_#39ff14]"
                title={`Tuky: ${fatPct}%`}
              />
            </div>

            {/* Macro labels & Grams */}
            <div className="flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-1.5 text-[#00f2fe]">
                <span className="w-2 h-2 rounded-full bg-[#00f2fe]" />
                <span>Bílkoviny {proteinPct} % ({totalProteinGrams} g)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#2dd4bf]">
                <span className="w-2 h-2 rounded-full bg-[#2dd4bf]" />
                <span>Sacharidy {carbsPct} % ({totalCarbsGrams} g)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#39ff14]">
                <span className="w-2 h-2 rounded-full bg-[#39ff14]" />
                <span>Tuky {fatPct} % ({totalFatGrams} g)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Nutrition Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 pt-5 mt-5 border-t border-slate-800/80">
          <button
            onClick={onOpenWeeklyPlan}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/40 transition-all active:scale-95"
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Celý týdenní jídelníček</span>
          </button>

          <button
            onClick={onOpenShoppingList}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/40 transition-all active:scale-95"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#39ff14]" />
            <span>Nákupní seznam na týden</span>
          </button>

          <button
            onClick={onExportPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Stáhnout Jídelníček (PDF)</span>
          </button>
        </div>
      </motion.div>

      {/* Detailed Meal Cards List (Snídaně, Dopolední svačina, Oběd, Odpolední svačina, Večeře) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Dnešní naplánovaná jídla &amp; Recepty
          </h3>
          <span className="text-xs text-slate-400">
            Klikněte na „Recept“ pro postup vaření
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {meals.map(meal => (
            <div
              key={meal.id}
              className={`p-4 sm:p-5 rounded-3xl border transition-all ${
                meal.completed
                  ? 'bg-[#0e131d]/90 border-slate-800 hover:border-cyan-500/40'
                  : 'bg-[#0a0d14]/60 border-slate-900 opacity-75'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Checkbox and Info */}
                <div className="flex items-start sm:items-center gap-3.5 flex-1">
                  <button
                    onClick={() => onToggleMeal(meal.id)}
                    className={`w-6 h-6 rounded-xl border flex items-center justify-center transition-all shrink-0 mt-0.5 sm:mt-0 ${
                      meal.completed
                        ? 'bg-[#39ff14] border-[#39ff14] text-slate-950 shadow-[0_0_10px_#39ff14]'
                        : 'border-slate-700 bg-slate-900 text-transparent hover:border-slate-500'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                        {meal.type} • {meal.time}
                      </span>
                      <span className="text-xs font-extrabold text-amber-400">
                        {meal.calories} kcal
                      </span>
                    </div>

                    <h4 className="text-sm sm:text-base font-bold text-white tracking-tight">
                      {meal.title}
                    </h4>

                    {/* Výpis surovin tu byl duplicitně — totéž je v receptu,
                        a tam s gramáží. Navíc se ořezával na jeden řádek, takže
                        z něj stejně nešlo nic vyčíst. */}
                  </div>
                </div>

                {/* Macro breakdown pills & Recipe trigger */}
                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className="px-2 py-1 rounded-lg bg-cyan-950/60 text-[#00f2fe] border border-cyan-500/30">
                      B: {meal.protein}g
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-teal-950/60 text-[#2dd4bf] border border-teal-500/30">
                      S: {meal.carbs}g
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-emerald-950/60 text-[#39ff14] border border-emerald-500/30">
                      T: {meal.fat}g
                    </span>
                  </div>

                  <button
                    onClick={() => onSelectRecipe(meal)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#00f2fe] bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 hover:border-cyan-400 transition-all active:scale-95"
                  >
                    <span>Recept</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
