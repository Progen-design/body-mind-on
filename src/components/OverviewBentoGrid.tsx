import React from 'react';
import {
  Utensils,
  Dumbbell,
  Flame,
  CheckCircle2,
  ChevronRight,
  ShoppingBag,
  Check
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  MealItem,
  HabitItem,
  BadHabitItem,
  UserPreferences,
  TelesneSlozeni
} from '../types';
import { ActiveTab } from './NavigationTabs';
import { denniMakra } from '../lib/makra';

interface OverviewBentoGridProps {
  meals: MealItem[];
  habits: HabitItem[];
  badHabits: BadHabitItem[];
  preferences: UserPreferences;
  /** Pocet polozek nakupniho seznamu. */
  pocetNakupu?: number;
  /** Z chytre vahy. null = blok slozeni se nezobrazi. */
  slozeni?: TelesneSlozeni | null;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleMeal: (id: string) => void;
  onToggleHabit: (id: string) => void;
  onCompleteAllHabits: () => void;
  onSelectRecipe: (meal: MealItem) => void;
}

export const OverviewBentoGrid: React.FC<OverviewBentoGridProps> = ({
  meals,
  habits,
  badHabits,
  preferences,
  pocetNakupu = 0,
  slozeni = null,
  onSelectTab,
  onToggleMeal,
  onToggleHabit,
  onCompleteAllHabits,
  onSelectRecipe
}) => {
  const currentCalories = meals.reduce((acc, m) => acc + (m.completed ? m.calories : 0), 0);
  const targetCalories = preferences.dailyCalorieTarget;
  const makra = denniMakra(preferences);
  const completedHabitsCount = habits.filter(h => h.completed).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 auto-rows-auto">
      {/* 
        ========================================================================
      {/* KARTA "TELESNE SLOZENI & WITHINGS" TU BYLA DO 23. 8. 2026.
          Ukazovala vahu, telesny tuk, svalovou hmotu, BMI a datum mereni.
          Po slouceni zalozek Prehled a Muj profil sedi presne tyhle hodnoty
          o kus vys v ProfileSection -- kreslily by se podruhe pod sebou.
          BMI, datum mereni a odkaz na graf, ktere v ProfileSection chybely,
          se tam presunuly. */}

      {/* JÍDELNÍČEK A TRÉNINK NA PRVNÍM ŘÁDKU (9. 9. 2026).
          Span 2 + span 1 vyplní všechny tři sloupce, takže obojí sedí vedle
          sebe hned nahoře. Dřív tu začínala Regenerace (span 1), čímž se
          široký jídelníček zalomil na druhý řádek a trénink spadl pod něj. */}
      {/* 
        ========================================================================
        KARTA 3: Jídelníček & Makra dnes (col-span-1 md:col-span-1 lg:col-span-2)
        Široká karta s přehledem denních kalorií, makro-baru, receptů
        a nákupního seznamu (viz docs/DALSI_KROK.md 6.8)
        ========================================================================
      */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="col-span-1 md:col-span-2 lg:col-span-3 relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-povrch/95 backdrop-blur-xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between group hover:border-cyan-400/60 transition-all duration-300"
      >
        <div className="absolute -bottom-8 -right-8 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-akcent-cyan">
                <Utensils className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Jídelníček &amp; Makra dnes
                </h3>
                <span className="text-sm text-slate-400">Zaznamenáno z jídelníčku</span>
              </div>
            </div>
            <button
              onClick={() => onSelectTab('jidelnicek')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <span>Otevřít jídelníček</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Calories & Progress */}
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <span className="text-2xl sm:text-3xl font-extrabold text-white">
                {currentCalories.toLocaleString('cs-CZ')}
              </span>
              <span className="text-xs text-slate-400 font-medium ml-1.5">
                / cíl {targetCalories.toLocaleString('cs-CZ')} kcal
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-akcent-lime bg-emerald-950/60 border border-emerald-500/30">
              {meals.filter(meal => meal.completed).length} z {meals.length} jídel zaznamenáno
            </span>
          </div>

          {/* Segmented Macro Bar */}
          <p className="mb-4 text-sm leading-relaxed text-slate-400">
            Počítáme jen jídla označená jako snědená. Nezapsané jídlo neznamená, že jsi nejedl/a.
          </p>
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center gap-1.5 h-2.5 w-full rounded-full overflow-hidden p-0.5 bg-slate-900 border border-slate-800">
              <div style={{ width: `${preferences.proteinRatioPercent}%` }} className="h-full rounded-full bg-makro-bilkoviny shadow-[0_0_8px_var(--color-makro-bilkoviny)]" />
              <div style={{ width: `${preferences.carbsRatioPercent}%` }} className="h-full rounded-full bg-makro-sacharidy shadow-[0_0_8px_var(--color-makro-sacharidy)]" />
              <div style={{ width: `${preferences.fatRatioPercent}%` }} className="h-full rounded-full bg-makro-tuky shadow-[0_0_8px_var(--color-makro-tuky)]" />
            </div>
            {/* GRAMY SE POČÍTAJÍ, NEPÍŠOU SE.
                Do 23. 8. 2026 tu stálo `B {procenta} % (103 g)` — procento
                z profilu, gramy natvrdo z makety. Přehled tvrdil 103 g
                bílkovin, Profil na vedlejší záložce 184 g. Sto tři gramů
                odpovídalo poměru 19 %, což je výchozí hodnota makety, ne
                uživatelův profil. Obě místa teď berou číslo z `denniMakra`. */}
            <div className="flex items-center justify-between text-xs font-semibold px-0.5">
              <span className="text-makro-bilkoviny">B {makra.bilkoviny.procenta} % ({makra.bilkoviny.gramy} g)</span>
              <span className="text-makro-sacharidy">S {makra.sacharidy.procenta} % ({makra.sacharidy.gramy} g)</span>
              <span className="text-makro-tuky">T {makra.tuky.procenta} % ({makra.tuky.gramy} g)</span>
            </div>
          </div>

          {/* Today's Meals Quick List with recipe buttons.
              KARTA UKAZUJE VÝŘEZ, NE VŠECHNA JÍDLA — a řekne to. Nadpis
              "Všechna jídla" nad tříprvkovým výřezem z pěti jídel lhal o tom,
              co je pod ním (docs/DALSI_KROK.md 7.2c): karta ukazovala
              1338 kcal proti cíli 2634, jako by třetina dne chyběla. */}
          <div className="space-y-2 mb-4">
            {meals.length > 3 && (
              <div className="text-[10px] text-slate-500 px-0.5">
                Zobrazeny 3 z {meals.length} jídel
              </div>
            )}
            {meals.slice(0, 3).map(meal => (
              <div
                key={meal.id}
                className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => onToggleMeal(meal.id)}
                    aria-label={`${meal.completed ? 'Zrušit záznam jídla' : 'Označit jako snědené'}: ${meal.title}`}
                    aria-pressed={meal.completed}
                    className={`w-10 h-10 shrink-0 rounded-lg border flex items-center justify-center transition-all ${
                      meal.completed
                        ? 'bg-akcent-lime border-akcent-lime text-slate-950 font-bold'
                        : 'border-slate-700 bg-slate-800'
                    }`}
                  >
                    {meal.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                  <div>
                    <span className={`text-xs font-bold block ${meal.completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                      {meal.title}
                    </span>
                    <span className="text-[10px] text-slate-400">{meal.type} • {meal.calories} kcal</span>
                  </div>
                </div>
                <button
                  onClick={() => onSelectRecipe(meal)}
                  className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30"
                >
                  Recept
                </button>
              </div>
            ))}
          </div>

          {/* Nákupní seznam patří k jídelníčku, ne k TEDovi — přesunuto sem
              z Karty 6 (AI Trenér TED). Ta karta se hlavičkou hlásila jako
              „AI Trenér TED", ale zobrazovala pod ní i nesouvisející nákup;
              Karta 6 je navíc jediné místo, kde je TED vidět, a nákup ho tam
              ředil. Viz docs/DALSI_KROK.md 6.8. */}
          <div
            onClick={() => onSelectTab('jidelnicek')}
            className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 flex items-center justify-between cursor-pointer transition-all"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-200">Nákupní seznam</span>
            </div>
            {/* Skutecny pocet, ne natvrdo 12 — seznam jich ma pres sto. */}
            {pocetNakupu > 0 && (
              <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-full">
                {pocetNakupu} {pocetNakupu === 1 ? 'položka' : pocetNakupu < 5 ? 'položky' : 'položek'}
              </span>
            )}
          </div>
        </div>

        <div className="pt-1">
          <button
            onClick={() => onSelectTab('jidelnicek')}
            className="w-full py-2 px-3 rounded-xl text-xs font-bold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/40 flex items-center justify-center gap-1.5 transition-all"
          >
            <span>Zobrazit kompletní týdenní jídelníček &amp; Recepty</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </motion.div>

      {/* KARTY „DNEŠNÍ TRÉNINK" A „REGENERACE & SPÁNEK" ODSTRANĚNY 9. 9. 2026.
          Obojí má vlastní záložku v horní navigaci (Tréninkový plán,
          Regenerace & Spánek), takže v profilu stály podruhé — a u člověka
          bez připojených hodinek nebo ve dni volna ukazovaly jen pomlčky
          a „Volno". Jídelníček tím dostal celou šířku mřížky.
          Rozhodnutí Honzy 9. 9. 2026. */}
      {/* KARTA „AI Trenér TED" ODSTRANĚNA 8. 9. 2026.
          TED je v hlavičce jako tlačítko „Zeptat se TEDa" na každé záložce,
          takže karta v profilu byla druhý vstup do téhož chatu. Zprávy od
          trenéra navíc vznikají jen při registraci a po týdnu se skrývají —
          většinu času tu tedy stála karta se jménem TEDa, ve které nebyl. */}
    </div>
  );
};
