import React from 'react';
import { Check } from 'lucide-react';
import type { MealItem, UserPreferences } from '../types';
import type { NesouladCile } from '../data/adaptery';
import { denniMakra } from '../lib/makra';
import { CalorieMismatchBanner } from './CalorieMismatchBanner';
import { RadekJidlaGrid } from './RadekJidlaGrid';

// JÍDLA DNES — celý dnešní jídelníček, jedna karta.
//
// PROMPT_DNES_HERO.md (21. 9. 2026): kcal/makra dne, trénink, pohyb a
// primární akce se přestěhovaly do hero „Tvůj den" (DnesHero) — tahle karta
// zůstala jen na to, co „Dnešek" (PROMPT_UX_DNES.md, 18. 9. 2026) měl navíc
// oproti hero: seznam dnešních jídel. Nadpis „Jídla dnes", makra dne vpravo
// jako kompaktní připomínka cíle (velký kcal/makro blok je teď v hero —
// stejné číslo se nemá kreslit dvakrát).
//
// TŘI STAVY, NE DVA. Neodškrtnuté jídlo znamená „nevíme", ne „nesnědl" —
// člověk mohl jíst a jen to nezapsal. Stav dne (adherenci ze serveru) čte
// a řeší hero DnesHero; tahle karta jen vypisuje seznam a zaškrtávátko.

interface Props {
  meals: MealItem[];
  preferences: UserPreferences;
  onToggleMeal: (id: string) => void;
  onSelectRecipe: (meal: MealItem) => void;
  /** Cíl v preferencích ≠ cíl, na který je postavený plán. null = sedí. */
  nesouladCile?: NesouladCile | null;
  onRegeneratePlan?: () => void;
  regenerujiPlan?: boolean;
}

export const DnesniPrehled: React.FC<Props> = ({
  meals,
  preferences,
  onToggleMeal,
  onSelectRecipe,
  nesouladCile = null,
  onRegeneratePlan,
  regenerujiPlan = false,
}) => {
  const makra = denniMakra(preferences);

  return (
    <section
      aria-label="Jídla dnes"
      className="rounded-3xl border border-slate-800 bg-povrch p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
          Jídla dnes
        </h2>
        <div className="flex items-center gap-2.5 text-[11px] font-semibold">
          <span className="text-makro-bilkoviny">B {makra.bilkoviny.gramy} g</span>
          <span className="text-makro-sacharidy">S {makra.sacharidy.gramy} g</span>
          <span className="text-makro-tuky">T {makra.tuky.gramy} g</span>
        </div>
      </div>

      {/* Plán je otisk cíle v okamžiku generování — po změně cíle se sám
          nepřegeneruje. Stejný banner jako v jídelníčku, ať nesoulad vidí
          i tady (docs/DALSI_KROK.md 7.2a). */}
      {nesouladCile && onRegeneratePlan && (
        <div className="mt-4">
          <CalorieMismatchBanner
            nesoulad={nesouladCile}
            onRegenerate={onRegeneratePlan}
            regenerating={regenerujiPlan}
          />
        </div>
      )}

      {/* VŠECHNA DNEŠNÍ JÍDLA, ŽÁDNÝ VÝŘEZ (PROMPT_UX_DNES.md bod A.3).
          Do 18. 9. 2026 tu byl ořezaný výpis prvních tří jídel s poznámkou
          „Zobrazeny 3 z 5 jídel" — karta tvrdila 1338 kcal proti cíli 2634,
          jako by třetina
          dne chyběla. */}
      {meals.length > 0 && (
        <div className="mt-4 space-y-2">
          {/* CELÝ ŘÁDEK OTEVÍRÁ RECEPT (PROMPT_UX_DOLADENI.md bod A).
              Na 390 px zbylo na název jen ~90 px useknutých `truncate`m —
              „Ovesná kaš…", nikdo si nepřečetl, co má jíst. `div role="button"`,
              ne `<button>`: uvnitř je skutečné tlačítko (zaškrtávátko) a
              vnořený `<button>` v `<button>` je nevalidní HTML. Zaškrtávátko
              samo dělá jinou akci (odškrtnutí), proto `stopPropagation`. */}
          {meals.map((meal) => (
            <div
              key={meal.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectRecipe(meal)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectRecipe(meal);
                }
              }}
              aria-label={`Otevřít recept: ${meal.title}`}
              className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center gap-2.5 hover:border-slate-700 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMeal(meal.id);
                }}
                aria-label={`${meal.completed ? 'Zrušit záznam jídla' : 'Označit jako snědené'}: ${meal.title}`}
                aria-pressed={meal.completed}
                className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center transition-all ${
                  meal.completed
                    ? 'bg-akcent-lime border-akcent-lime text-slate-950 font-bold'
                    : 'border-slate-700 bg-slate-800 text-slate-600 hover:text-slate-400 hover:border-slate-600'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </button>

              <RadekJidlaGrid typ={meal.type} nazev={meal.title} kcal={meal.calories} odskrtnuto={meal.completed} />

              {/* Pod `sm` schované — celý řádek dělá totéž, tlačítko by na
                  úzkém displeji jen ukrajovalo místo názvu. Na desktopu
                  zůstává jako vizuální nápověda, ne druhá akce — proto
                  `stopPropagation`, ne vlastní `onSelectRecipe` (dvě volání
                  téhož by nic nerozbila, ale je to zbytečné). */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRecipe(meal);
                }}
                className="hidden sm:inline-flex shrink-0 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30"
              >
                Recept
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
