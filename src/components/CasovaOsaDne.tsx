import React from 'react';
import { Check, Dumbbell, Utensils } from 'lucide-react';
import type { MealItem, UserPreferences } from '../types';
import type { NesouladCile } from '../data/adaptery';
import { denniMakra } from '../lib/makra';
import { sestavCasovouOsu, type PolozkaOsy, type TreninekOsy } from '../lib/casovaOsa.ts';
import { casVPraze } from '../lib/casVPraze.ts';
import { CalorieMismatchBanner } from './CalorieMismatchBanner';

/**
 * ČASOVÁ OSA DNE — PROMPT_DNES_WOW.md bod C (styl Yazio / MyFitnessPal).
 *
 * Jeden svislý seznam podle času místo dvou karet („Jídla dnes" + trénink):
 * Snídaně → Svačina → Oběd → Trénink → Svačina → Večeře. Každá položka má
 * čas, název, kcal nebo délku a zaškrtnutí; klik na řádek otevře recept
 * nebo trénink. Hotové jsou ztlumené s fajfkou, značka „Teď" sedí mezi
 * položkami podle pražského času.
 *
 * Nahradila `DnesniPrehled` a zachovává jeho funkce: makra dne jako
 * připomínka cíle a banner nesouladu cíle s tlačítkem na přegenerování plánu.
 *
 * Trénink nemá v plánu čas, proto ukazuje „Kdykoli"; odškrtává se na záložce
 * Trénink (cvik po cviku), tady jen ukazuje stav.
 *
 * Neodškrtnuté jídlo znamená „nevíme", ne „nesnědl" — proto žádné červené
 * „zameškáno", jen neutrální styl.
 */
interface Props {
  meals: MealItem[];
  treninek: TreninekOsy | null;
  /** Den volna: text o nejbližším tréninku („za 2 dny: Trénink B"), nebo `null`. */
  dalsiTreninkText: string | null;
  preferences: UserPreferences;
  onToggleMeal: (id: string) => void;
  onSelectRecipe: (meal: MealItem) => void;
  onOpenTrenink: () => void;
  onOpenJidelnicek: () => void;
  /** Cíl v preferencích ≠ cíl, na který je postavený plán. null = sedí. */
  nesouladCile?: NesouladCile | null;
  onRegeneratePlan?: () => void;
  regenerujiPlan?: boolean;
}

function formatTed(ted: Date): string {
  const { hodina, minuta } = casVPraze(ted);
  return `${hodina}:${String(minuta).padStart(2, '0')}`;
}

const ZnackaTed: React.FC<{ cas: string }> = ({ cas }) => (
  <li aria-label={`Teď je ${cas}`} className="grid grid-cols-[3rem_1.25rem_1fr] sm:grid-cols-[3.5rem_1.25rem_1fr] items-center gap-x-2 py-0.5">
    <span className="text-[11px] font-extrabold text-akcent-cyan text-right">Teď</span>
    <span className="relative flex items-center justify-center">
      <span className="w-3 h-3 rounded-full bg-akcent-cyan shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
    </span>
    <span className="h-px bg-gradient-to-r from-cyan-400/60 to-transparent" />
  </li>
);

export const CasovaOsaDne: React.FC<Props> = ({
  meals,
  treninek,
  dalsiTreninkText,
  preferences,
  onToggleMeal,
  onSelectRecipe,
  onOpenTrenink,
  onOpenJidelnicek,
  nesouladCile = null,
  onRegeneratePlan,
  regenerujiPlan = false,
}) => {
  // Značka „Teď" se posouvá v čase — jednou za minutu stačí.
  const [ted, setTed] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setTed(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const makra = denniMakra(preferences);
  const osa = sestavCasovouOsu(meals, treninek, ted);
  const mealPodleId = new Map(meals.map((m) => [m.id, m]));

  function otevri(p: PolozkaOsy) {
    if (p.typ === 'trenink') {
      onOpenTrenink();
      return;
    }
    const meal = p.jidloId ? mealPodleId.get(p.jidloId) : undefined;
    if (meal) onSelectRecipe(meal);
  }

  const bezPlanu = osa.polozky.length === 0;

  return (
    <section aria-label="Dnešní den" className="rounded-3xl border border-slate-800 bg-povrch p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Dnešní den</h2>
        <div className="flex items-center gap-2.5 text-[11px] font-semibold">
          <span className="text-makro-bilkoviny">B {makra.bilkoviny.gramy} g</span>
          <span className="text-makro-sacharidy">S {makra.sacharidy.gramy} g</span>
          <span className="text-makro-tuky">T {makra.tuky.gramy} g</span>
        </div>
      </div>

      {/* Plán je otisk cíle v okamžiku generování — po změně cíle se sám
          nepřegeneruje (docs/DALSI_KROK.md 7.2a). */}
      {nesouladCile && onRegeneratePlan && (
        <div className="mt-4">
          <CalorieMismatchBanner nesoulad={nesouladCile} onRegenerate={onRegeneratePlan} regenerating={regenerujiPlan} />
        </div>
      )}

      {bezPlanu ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-700 p-5 text-center">
          <p className="text-sm text-slate-300">Na dnešek zatím nemáš v plánu žádné jídlo ani trénink.</p>
          <button
            type="button"
            onClick={onOpenJidelnicek}
            className="mt-3 min-h-10 px-4 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/60 transition-all"
          >
            Otevřít jídelníček
          </button>
        </div>
      ) : (
        <ol className="mt-4 relative">
          {osa.polozky.map((p, i) => (
            <React.Fragment key={p.klic}>
              {osa.tedPredIndexem === i && <ZnackaTed cas={formatTed(ted)} />}
              <li className="grid grid-cols-[3rem_1.25rem_1fr] sm:grid-cols-[3.5rem_1.25rem_1fr] gap-x-2 items-stretch">
                <span className="pt-4 text-right text-[11px] font-bold text-slate-500 truncate min-w-0">
                  {p.cas ?? 'Kdykoli'}
                </span>
                {/* Svislá osa s bodem; poslední položka osu nedotahuje dolů. */}
                <span className="relative flex justify-center" aria-hidden="true">
                  <span
                    className={`absolute top-0 w-px bg-slate-800 ${i === osa.polozky.length - 1 ? 'h-5' : 'h-full'}`}
                  />
                  <span
                    className={`relative mt-[1.15rem] w-2.5 h-2.5 rounded-full border-2 ${
                      p.hotovo ? 'bg-akcent-lime border-akcent-lime' : 'bg-povrch border-slate-600'
                    }`}
                  />
                </span>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => otevri(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      otevri(p);
                    }
                  }}
                  aria-label={`${p.typ === 'trenink' ? 'Otevřít trénink' : 'Otevřít recept'}: ${p.nazev}${p.hotovo ? ' (hotovo)' : ''}`}
                  className={`my-1 p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    p.hotovo
                      ? 'bg-slate-900/40 border-slate-800/60 opacity-70'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {p.typ === 'jidlo' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (p.jidloId) onToggleMeal(p.jidloId);
                      }}
                      aria-label={`${p.hotovo ? 'Zrušit záznam jídla' : 'Označit jako snědené'}: ${p.nazev}`}
                      aria-pressed={p.hotovo}
                      className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center transition-all ${
                        p.hotovo
                          ? 'bg-akcent-lime border-akcent-lime text-slate-950'
                          : 'border-slate-700 bg-slate-800 text-slate-600 hover:text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center ${
                        p.hotovo ? 'bg-akcent-lime border-akcent-lime text-slate-950' : 'border-slate-700 bg-slate-800 text-slate-400'
                      }`}
                    >
                      {p.hotovo ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Dumbbell className="w-4 h-4" />}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{p.stitek}</p>
                    <p
                      className={`text-sm font-bold leading-snug break-words line-clamp-2 ${
                        p.hotovo ? 'line-through text-slate-500' : 'text-slate-200'
                      }`}
                    >
                      {p.nazev}
                    </p>
                    {/* Na 390 px zbývá na název ~90 px, proto údaj (kcal / délka /
                        „2 z 4 cviků") sedí pod názvem; vpravo až od `sm`. */}
                    <p className="sm:hidden mt-0.5 text-xs font-semibold text-amber-300 truncate">{p.udaj}</p>
                  </div>
                  <span className="hidden sm:block shrink-0 max-w-[9rem] truncate text-xs font-semibold text-amber-300">{p.udaj}</span>
                </div>
              </li>
            </React.Fragment>
          ))}
          {osa.tedPredIndexem === osa.polozky.length && <ZnackaTed cas={formatTed(ted)} />}
        </ol>
      )}

      {/* DEN BEZ TRÉNINKU — vlastní text a akce, ne prázdné místo. */}
      {!bezPlanu && !treninek && (
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3">
          <p className="text-sm text-slate-300 min-w-0">
            <Utensils className="inline w-4 h-4 mr-1.5 -mt-0.5 text-slate-500" aria-hidden="true" />
            Dnes máš volno od tréninku.
            {dalsiTreninkText ? ` Další: ${dalsiTreninkText}.` : ''}
          </p>
          <button
            type="button"
            onClick={onOpenTrenink}
            className="min-h-9 px-3 rounded-lg text-xs font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/60 transition-all"
          >
            Tréninkový plán
          </button>
        </div>
      )}
    </section>
  );
};
