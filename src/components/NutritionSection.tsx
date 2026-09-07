import React, { useState } from 'react';
import {
  Utensils,
  BookOpen,
  ShoppingBag,
  Download,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Flame,
  Sparkles,
  Plus
} from 'lucide-react';
import { motion } from 'motion/react';
import { Vysvetlivka } from './Vysvetlivka';
import { NadpisSekce } from './NadpisSekce';
import { CalorieMismatchBanner } from './CalorieMismatchBanner';
import { PruhDnu } from './PruhDnu';
import { MealItem, ShoppingItem } from '../types';
import { NesouladCile, zkratkaDne } from '../data/adaptery';
import type { TydenniDenJidel } from '../data/adaptery';
import {
  pocetJidelSlovy,
  seradDnyPoNe,
  souhrnDneJidel,
  vybranyDenJidel
} from '../lib/jidelnicekDny';

interface NutritionSectionProps {
  /**
   * Celý týden včetně `datum`, `jeDnes` a jídel — docs/DALSI_KROK.md 9.8.
   * Dřív sekce dostávala jen jídla dneška (`meals`); přepínač dnů potřebuje
   * tatáž data, jaká už měl `MealPlanModal`.
   */
  weekMeals: TydenniDenJidel[];
  /** Nákupní seznam patří k jídelníčku — vychází z něj. Dřív měl vlastní záložku. */
  shoppingItems: ShoppingItem[];
  onToggleShoppingItem: (id: string) => void;
  targetCalories: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  /** Cíl v preferencích ≠ cíl, na který je postavený plán. null = sedí. */
  nesouladCile?: NesouladCile | null;
  onRegeneratePlan?: () => void;
  regenerujiPlan?: boolean;
  /**
   * Celý objekt jídla, ne `id` — `catalog_id` NENÍ napříč týdnem unikátní
   * (stejný recept smí být v jídelníčku 2× týdně), den se pozná podle
   * `planDay` + `activityKey`. Stejný důvod jako u `MealPlanModal`.
   */
  onToggleMeal: (meal: MealItem) => void;
  onSelectRecipe: (meal: MealItem) => void;
  onOpenWeeklyPlan: () => void;
  onOpenShoppingList: () => void;
  onExportPdf: () => void;
  onAddCustomMeal?: () => void;
}

export const NutritionSection: React.FC<NutritionSectionProps> = ({
  weekMeals,
  shoppingItems,
  onToggleShoppingItem,
  targetCalories,
  proteinPct,
  carbsPct,
  fatPct,
  nesouladCile = null,
  onRegeneratePlan,
  regenerujiPlan = false,
  onToggleMeal,
  onSelectRecipe,
  onOpenWeeklyPlan,
  onOpenShoppingList,
  onExportPdf,
  onAddCustomMeal
}) => {
  // null = uživatel zatím nic nevybral, den se odvodí z dat (jeDnes).
  // Stejný vzor jako `selectedDayName` ve WorkoutSection — uložené datum by
  // po přegenerování plánu ukazovalo na neexistující den.
  const [vybranyDatum, setVybranyDatum] = useState<string | null>(null);

  const dny = seradDnyPoNe(weekMeals);
  const den = vybranyDenJidel(dny, vybranyDatum);
  const meals = den?.meals ?? [];
  // KARTA MAKRO POČÍTÁ VYBRANÝ DEN, NE POŘÁD DNEŠEK — jádro bodu 9.8;
  // jinak by přepínač lhal.
  const souhrn = souhrnDneJidel(den);
  // Odškrtávat jde jen dnešek — viz komentář u checkboxu níž.
  const jeDnesek = den?.jeDnes ?? false;
  const prohlizisJinyDenNezDnes = !!den && !den.jeDnes;

  const kNakupu = shoppingItems.filter(i => !i.checked).length;
  // Sbalený stav jako výchozí — docs/DALSI_KROK.md 8.14. 63 položek pod sebou
  // odtlačilo zbytek profilu mimo obrazovku; počet v hlavičce (`zbývá X z Y`)
  // pozná stav i bez rozbalení.
  const [rozbaleno, setRozbaleno] = useState(false);

  return (
    <div className="space-y-6">
      <NadpisSekce
        titulek="Jídelníček & makra"
        podtitulek="Dnešní jídla, poměr živin a suroviny k nákupu"
        ikona={<Utensils className="w-5 h-5 text-akcent-cyan" />}
      />

      {/* Top Banner: Macros & Calorie Tracker Overview */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-hlavicka-tmava-od via-hero-jidelnicek-stred to-hero-jidelnicek-cil border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden"
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
                {souhrn.kcalSnedeno.toLocaleString('cs-CZ')}
              </span>
              <span className="text-sm sm:text-base text-slate-400 font-medium">
                kcal / cíl {targetCalories.toLocaleString('cs-CZ')} kcal
              </span>
              <span className="text-xs font-bold text-akcent-cyan bg-cyan-950/60 px-2.5 py-1 rounded-full border border-cyan-500/30">
                Zbývá {Math.max(0, targetCalories - souhrn.kcalSnedeno)} kcal
              </span>
            </div>
          </div>

          {/* Segmented Macro Bar */}
          <div className="flex-1 max-w-xl space-y-2.5">
            <div className="flex items-center gap-1.5 h-3 w-full rounded-full overflow-hidden p-0.5 bg-slate-950 border border-slate-800">
              <div
                style={{ width: `${proteinPct}%` }}
                className="h-full rounded-full bg-makro-bilkoviny shadow-[0_0_8px_var(--color-makro-bilkoviny)]"
                title={`Bílkoviny: ${proteinPct}%`}
              />
              <div
                style={{ width: `${carbsPct}%` }}
                className="h-full rounded-full bg-makro-sacharidy shadow-[0_0_8px_var(--color-makro-sacharidy)]"
                title={`Sacharidy: ${carbsPct}%`}
              />
              <div
                style={{ width: `${fatPct}%` }}
                className="h-full rounded-full bg-makro-tuky shadow-[0_0_8px_var(--color-makro-tuky)]"
                title={`Tuky: ${fatPct}%`}
              />
            </div>

            {/* Macro labels & Grams */}
            <div className="flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-1.5 text-makro-bilkoviny">
                <span className="w-2 h-2 rounded-full bg-makro-bilkoviny" />
                <span>Bílkoviny {proteinPct} % ({souhrn.bilkovinyG} g)</span>
              </div>
              <div className="flex items-center gap-1.5 text-makro-sacharidy">
                <span className="w-2 h-2 rounded-full bg-makro-sacharidy" />
                <span>Sacharidy {carbsPct} % ({souhrn.sacharidyG} g)</span>
              </div>
              <div className="flex items-center gap-1.5 text-makro-tuky">
                <span className="w-2 h-2 rounded-full bg-makro-tuky" />
                <span>Tuky {fatPct} % ({souhrn.tukyG} g)</span>
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
            <ShoppingBag className="w-3.5 h-3.5 text-akcent-lime" />
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

      {/* Plán je otisk cíle v okamžiku generování — po změně cíle (např.
          oprava výšky, 6.5) se sám nepřegeneruje. Stejný banner jako na
          profilu, ať uživatel nesoulad vidí i tam, odkud si jídelníček
          skládá (docs/DALSI_KROK.md 7.2a). */}
      {nesouladCile && onRegeneratePlan && (
        <CalorieMismatchBanner
          nesoulad={nesouladCile}
          onRegenerate={onRegeneratePlan}
          regenerating={regenerujiPlan}
        />
      )}

      {/* Pruh dnů Po–Ne — stejné záložky jako u tréninku (docs/DALSI_KROK.md
          9.8), kreslí je sdílený PruhDnu. Místo „60m / ✓" nese dlaždice kcal
          dne a stav splnění; den bez jídel se chová jako „Volno": neklikací. */}
      {dny.length > 0 && (
        <div className="space-y-3">
          <NadpisSekce
            uroven="podsekce"
            titulek="Týdenní přehled"
            podtitulek="Klikni na den a prohlédni si jeho jídla i makra"
            ikona={<CalendarDays className="w-4 h-4 text-slate-400" />}
          />

          <PruhDnu
            polozky={dny.map(d => {
              const s = souhrnDneJidel(d);
              return {
                klic: d.datum,
                zkratka: zkratkaDne(d.denNazev),
                nazev: pocetJidelSlovy(d.meals.length),
                jeDnes: d.jeDnes,
                jeNeklikaci: !s.maJidla,
                indikator: !s.maJidla
                  ? null
                  : s.vseSplneno
                    ? 'splneno'
                    : `${s.kcalPlan.toLocaleString('cs-CZ')} kcal`
              };
            })}
            vybranyKlic={vybranyDatum}
            onVybrat={setVybranyDatum}
          />

          {/* Vybraný den ≠ dnešek — stejná hláška jako u tréninku, jinak by
              přepnutí vypadalo, že se změnil DNEŠNÍ jídelníček v kartě výš. */}
          {prohlizisJinyDenNezDnes && (
            <div className="flex items-center justify-between gap-3 text-xs bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2">
              <span className="text-slate-300">
                Prohlížíš <strong className="text-white">{den?.denNazev}</strong>, ne dnešek.
              </span>
              <button
                type="button"
                onClick={() => setVybranyDatum(null)}
                className="font-bold text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
              >
                zpět na dnešek
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detailed Meal Cards List (Snídaně, Dopolední svačina, Oběd, Odpolední svačina, Večeře) */}
      <div className="space-y-4">
        <NadpisSekce
          uroven="podsekce"
          titulek={jeDnesek ? 'Dnešní jídla' : `Jídla — ${den?.denNazev ?? ''}`}
          podtitulek="Postup přípravy najdeš pod tlačítkem Recept"
          ikona={<Flame className="w-4 h-4 text-amber-400" />}
        />

        <div className="grid grid-cols-1 gap-3.5">
          {meals.map(meal => (
            <div
              key={`${den?.datum}-${meal.activityKey ?? meal.id}`}
              className={`p-4 sm:p-5 rounded-3xl border transition-all ${
                meal.completed
                  ? 'bg-karta/90 border-slate-800 hover:border-cyan-500/40'
                  : 'bg-karta-nedokoncena/60 border-slate-900 opacity-75'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Checkbox and Info */}
                <div className="flex items-start sm:items-center gap-3.5 flex-1">
                  {/* ODŠKRTÁVAT JDE JEN DNEŠEK — docs/DALSI_KROK.md 9.8,
                      sekce Nedělat. Zvolená varianta: checkbox NEAKTIVNÍ,
                      ne schovaný — při prohlížení jiného dne má zůstat
                      vidět, co bylo splněno, a schovaný checkbox by navíc
                      rozházel layout karty. Přepínač je na prohlížení;
                      u návyků totéž vymáhá server (api/habits.js vrací 400
                      na cokoli mimo dnešek). */}
                  <button
                    onClick={jeDnesek ? () => onToggleMeal(meal) : undefined}
                    disabled={!jeDnesek}
                    title={jeDnesek ? undefined : 'Odškrtávat jde jen dnešní den'}
                    className={`w-6 h-6 rounded-xl border flex items-center justify-center transition-all shrink-0 mt-0.5 sm:mt-0 ${
                      meal.completed
                        ? 'bg-akcent-lime border-akcent-lime text-slate-950 shadow-[0_0_10px_var(--color-akcent-lime)]'
                        : `border-slate-700 bg-slate-900 text-transparent ${jeDnesek ? 'hover:border-slate-500' : ''}`
                    } ${jeDnesek ? '' : 'cursor-default opacity-60'}`}
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
                    <span className="px-2 py-1 rounded-lg bg-cyan-950/60 text-makro-bilkoviny border border-cyan-500/30">
                      B: {meal.protein}g
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-teal-950/60 text-makro-sacharidy border border-teal-500/30">
                      S: {meal.carbs}g
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-emerald-950/60 text-makro-tuky border border-emerald-500/30">
                      T: {meal.fat}g
                    </span>
                  </div>

                  <button
                    onClick={() => onSelectRecipe(meal)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-akcent-cyan bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 hover:border-cyan-400 transition-all active:scale-95"
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

      {/* NÁKUPNÍ SEZNAM.
          Dřív měl vlastní záložku a v ní seděl hned pod kartou TED, takže
          vypadal jako doporučení trenéra. Seznam se ale skládá z jídelníčku —
          patří sem, pod jídla, ze kterých vznikl. */}
      <div className="space-y-4">
        <NadpisSekce
          uroven="podsekce"
          titulek="Nákupní seznam na týden"
          podtitulek={
            shoppingItems.length === 0
              ? 'Seznam se sestaví, jakmile budeš mít jídelníček na týden.'
              : `Suroviny z tvého jídelníčku • zbývá ${kNakupu} z ${shoppingItems.length}`
          }
          ikona={<ShoppingBag className="w-4 h-4 text-akcent-lime" />}
          akce={
            shoppingItems.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setRozbaleno(v => !v)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 transition-all active:scale-95"
                >
                  <span>{rozbaleno ? 'Sbalit' : `Rozbalit (${shoppingItems.length})`}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${rozbaleno ? 'rotate-180' : ''}`} />
                </button>
                <button
                  onClick={onOpenShoppingList}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/40 transition-all active:scale-95"
                >
                  Otevřít přes celou obrazovku
                </button>
              </>
            ) : undefined
          }
        />

        {shoppingItems.length > 0 && rozbaleno && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shoppingItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggleShoppingItem(item.id)}
                className={`p-3.5 rounded-2xl border transition-all text-left w-full flex items-center justify-between ${
                  item.checked
                    ? 'bg-slate-900/40 border-slate-800 opacity-60'
                    : 'bg-karta/90 border-slate-800 hover:border-emerald-500/40'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 ${
                      item.checked
                        ? 'bg-akcent-lime border-akcent-lime text-slate-950 font-bold'
                        : 'border-slate-700 bg-slate-900'
                    }`}
                  >
                    {item.checked && '✓'}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`text-xs font-bold block truncate ${
                        item.checked ? 'line-through text-slate-500' : 'text-slate-100'
                      }`}
                    >
                      {item.name}
                    </span>
                    <span className="text-[10px] text-slate-500">{item.category}</span>
                  </span>
                </span>
                <span className="text-xs font-semibold text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 shrink-0">
                  {item.amount}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
