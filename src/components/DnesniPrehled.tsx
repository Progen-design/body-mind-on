import React from 'react';
import { Dumbbell, Activity, ChevronRight, Check } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ActiveTab } from './NavigationTabs';
import type { MealItem, UserPreferences, WorkoutDay } from '../types';
import type { NesouladCile } from '../data/adaptery';
import { denniMakra } from '../lib/makra';
import { CalorieMismatchBanner } from './CalorieMismatchBanner';
import { RadekJidlaGrid } from './RadekJidlaGrid';

// DNEŠEK — CO MĚ ČEKÁ A CO UŽ MÁM ZA SEBOU, JEDNA KARTA.
//
// PROMPT_UX_DNES.md (18. 9. 2026): sloučeno z `DnesniPrehled` (tenhle soubor,
// dřív jen souhrn „Jídla 0 z 6", trénink, pohyb) a jídelní části
// `OverviewBentoGrid` (dřív samostatná karta s kcal/makro pruhem a výřezem
// tří jídel z pěti). Obě ukazovaly „dnešek", jen na dvou různých místech
// stránky a s dvojicí téměř totožných nadpisů („Jídla — 0 z 6 zaznamenáno"
// / „0 z 6 jídel zaznamenáno") — a mezi nima seděl prodej příštího týdne.
// Jedna karta, jedno místo, žádný výřez: dřív se ukazovaly jen 3 z 5 jídel
// s poznámkou „Zobrazeny 3 z 5" — teď je vidět celý dnešní jídelníček.
//
// TŘI STAVY, NE DVA. Přehled dřív počítal „splněno" z odškrtnutých
// plánovaných jídel a neodškrtnuté vydával za nesnědené. Neodškrtnuté ale
// znamená „nevíme" — člověk mohl jíst a jen to nezapsal. Karta proto odděluje
// co je v plánu, co je zaznamenané a kde záznam chybí.
//
// POHYB JE JEDINÉ TVRDÉ ČÍSLO. Minuty z hodinek nikdo neodškrtává, měří se.
// Proto se ukazují jen když opravdu dorazily, a nikdy se nedopočítávají
// z plánu.
//
// Zdroj adherence je `GET /api/stats/adherence` nad DB funkcí
// `get_daily_adherence()`. Endpoint existoval, ale UI ho nevolalo a
// počítalo si vlastní číslo z odškrtnutých položek.

interface Adherence {
  planovanych_jidel: number;
  splnenych_jidel: number;
  treninkovy_den: boolean;
  trenink_splnen: boolean;
  pohyb_min: number;
  watch_workout_count: number;
  manual_workout_count: number;
}

interface Props {
  todayWorkout: WorkoutDay;
  meals: MealItem[];
  preferences: UserPreferences;
  onToggleMeal: (id: string) => void;
  onSelectRecipe: (meal: MealItem) => void;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenPreferences: () => void;
  /** Cíl v preferencích ≠ cíl, na který je postavený plán. null = sedí. */
  nesouladCile?: NesouladCile | null;
  onRegeneratePlan?: () => void;
  regenerujiPlan?: boolean;
}

function Radek({
  ikona,
  popisek,
  hodnota,
  poznamka,
}: {
  ikona: React.ReactNode;
  popisek: string;
  hodnota: string;
  poznamka?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-800/70 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="shrink-0 text-slate-500">{ikona}</span>
        <span className="text-sm text-slate-300">{popisek}</span>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-white">{hodnota}</div>
        {poznamka && <div className="text-[11px] text-slate-500">{poznamka}</div>}
      </div>
    </div>
  );
}

export const DnesniPrehled: React.FC<Props> = ({
  todayWorkout,
  meals,
  preferences,
  onToggleMeal,
  onSelectRecipe,
  onSelectTab,
  onOpenPreferences,
  nesouladCile = null,
  onRegeneratePlan,
  regenerujiPlan = false,
}) => {
  const [stav, setStav] = React.useState<Adherence | null>(null);

  React.useEffect(() => {
    let zive = true;
    apiFetch<{ adherence?: Adherence | null }>('/api/stats/adherence')
      .then((data) => {
        if (zive) setStav(data?.adherence ?? null);
      })
      .catch(() => {
        // Bez adherence se karta pořád vyplatí — ukáže aspoň plán dne.
        if (zive) setStav(null);
      });
    return () => {
      zive = false;
    };
  }, []);

  const maTrenink = todayWorkout.exercises.length > 0;
  const planovanychJidel = stav?.planovanych_jidel || meals.length;
  const zaznamenanychJidel = stav?.splnenych_jidel ?? 0;
  const chybiZaznam = Math.max(0, planovanychJidel - zaznamenanychJidel);

  // Trénink je odcvičený, když ho člověk odškrtl NEBO ho naměřily hodinky.
  // Bez toho by aplikace tvrdila „neodcvičeno" i po tréninku, který jen
  // nikdo neodklikl.
  const treninkHotovy =
    todayWorkout.isCompleted
    || stav?.trenink_splnen === true
    || (stav?.watch_workout_count ?? 0) > 0
    || (stav?.manual_workout_count ?? 0) > 0;

  const pohybMin = stav?.pohyb_min ?? 0;

  const currentCalories = meals.reduce((acc, m) => acc + (m.completed ? m.calories : 0), 0);
  const targetCalories = preferences.dailyCalorieTarget;
  const makra = denniMakra(preferences);

  return (
    <section
      aria-label="Dnešní přehled"
      className="rounded-3xl border border-slate-800 bg-povrch p-5 sm:p-6"
    >
      <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
        Dnešek
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        {maTrenink
          ? `${todayWorkout.title}${todayWorkout.durationMin > 0 ? ` · ${todayWorkout.durationMin} min` : ''}`
          : todayWorkout.dayName
            ? 'Dnes máš v tréninkovém plánu volno.'
            : 'Na dnešek tu zatím nemáš trénink.'}
      </p>

      {/* KCAL A MAKRA — SLOUČENO Z OverviewBentoGrid (18. 9. 2026). */}
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <div>
          <span className="text-2xl sm:text-3xl font-extrabold text-white">
            {currentCalories.toLocaleString('cs-CZ')}
          </span>
          <span className="text-xs text-slate-400 font-medium ml-1.5">
            / cíl {targetCalories.toLocaleString('cs-CZ')} kcal
          </span>
        </div>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-akcent-lime bg-emerald-950/60 border border-emerald-500/30 shrink-0">
          {meals.filter((m) => m.completed).length} z {meals.length} jídel zaznamenáno
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400 leading-relaxed">
        Počítáme jen jídla označená jako snědená. Nezapsané jídlo neznamená, že jsi nejedl/a.
      </p>
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 h-2.5 w-full rounded-full overflow-hidden p-0.5 bg-slate-900 border border-slate-800">
          <div style={{ width: `${preferences.proteinRatioPercent}%` }} className="h-full rounded-full bg-makro-bilkoviny shadow-[0_0_8px_var(--color-makro-bilkoviny)]" />
          <div style={{ width: `${preferences.carbsRatioPercent}%` }} className="h-full rounded-full bg-makro-sacharidy shadow-[0_0_8px_var(--color-makro-sacharidy)]" />
          <div style={{ width: `${preferences.fatRatioPercent}%` }} className="h-full rounded-full bg-makro-tuky shadow-[0_0_8px_var(--color-makro-tuky)]" />
        </div>
        <div className="flex items-center justify-between text-xs font-semibold px-0.5">
          <span className="text-makro-bilkoviny">B {makra.bilkoviny.procenta} % ({makra.bilkoviny.gramy} g)</span>
          <span className="text-makro-sacharidy">S {makra.sacharidy.procenta} % ({makra.sacharidy.gramy} g)</span>
          <span className="text-makro-tuky">T {makra.tuky.procenta} % ({makra.tuky.gramy} g)</span>
        </div>
      </div>

      {/* Plán je otisk cíle v okamžiku generování — po změně cíle se sám
          nepřegeneruje. Stejný banner jako v jídelníčku, ať nesoulad vidí
          i tady, kde cíl nastavuje (docs/DALSI_KROK.md 7.2a). */}
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
          Do 18. 9. 2026 tu byl `meals.slice(0, 3)` s poznámkou „Zobrazeny 3 z
          5 jídel" — karta tvrdila 1338 kcal proti cíli 2634, jako by třetina
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

      <div className="mt-4">
        <Radek
          ikona={<Dumbbell className="w-4 h-4" />}
          popisek="Trénink"
          hodnota={
            !maTrenink
              ? 'Dnes volno'
              : treninkHotovy
                ? 'Odcvičeno'
                : 'Čeká na tebe'
          }
          poznamka={
            maTrenink && !treninkHotovy && !todayWorkout.isToday
              ? `Naplánováno na ${todayWorkout.dayName}`
              : undefined
          }
        />

        {/* Pohyb se ukazuje jen když ho hodinky naměřily. Nula by tvrdila,
            že se člověk nehýbal — my víme jen to, že data nedorazila. */}
        {pohybMin > 0 && (
          <Radek
            ikona={<Activity className="w-4 h-4" />}
            popisek="Pohyb"
            hodnota={`${pohybMin} min`}
            poznamka="Naměřeno hodinkami"
          />
        )}

        {chybiZaznam > 0 && (
          <p className="mt-2.5 text-[11px] text-slate-500">
            U {chybiZaznam} {chybiZaznam === 1 ? 'jídla' : 'jídel'} zatím nevíme, jestli jsi jedl
          </p>
        )}
      </div>

      {/* PRIMÁRNÍ AKCE PODLE TOHO, JESTLI JE DNES TRÉNINK.
          PROMPT_UX_DOLADENI.md bod B — Honza výslovně: „když je tam
          prohlédnout si tréninkový plán i když ho daný den nemám, je
          blbost." PR 241 tlačítko ve dni volna jen zdegradovalo na
          sekundární styl, pořád tam ale bylo. Řádek „Trénink — Dnes volno"
          výš už tu informaci nese a záložka Tréninkový plán je o kus výš
          v navigaci — tlačítko se ve dni volna nekreslí vůbec. */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        {maTrenink ? (
          <>
            <button
              type="button"
              onClick={() => onSelectTab('trenink')}
              className="min-h-11 rounded-xl border border-cyan-500/40 bg-cyan-950/60 px-4 text-sm font-semibold text-cyan-300 hover:bg-cyan-900/60 transition-all inline-flex items-center gap-1.5"
            >
              <span>Otevřít dnešní trénink</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('jidelnicek')}
              className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300 hover:border-slate-500 transition-all"
            >
              Otevřít jídelníček
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onSelectTab('jidelnicek')}
            className="min-h-11 rounded-xl border border-cyan-500/40 bg-cyan-950/60 px-4 text-sm font-semibold text-cyan-300 hover:bg-cyan-900/60 transition-all inline-flex items-center gap-1.5"
          >
            <span>Otevřít jídelníček</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onOpenPreferences}
          className="min-h-11 rounded-xl border border-slate-800 px-4 text-sm text-slate-400 hover:text-slate-200 transition-all"
        >
          Upravit cíle
        </button>
      </div>
    </section>
  );
};
