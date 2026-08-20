// Sdílený moderní renderer denních jídel (a volitelně tréninku).
// Používá ho horní „Dnešní plán“ (ProfileTodayPanels) i ostatní dny v týdenním přehledu (PlanViewer),
// aby měl celý profil jeden vizuální systém a jeden zdroj dat (structured_plan_json).
import { getMealNutritionDisplay, pairStructMeal } from '../../lib/mealNutritionDisplay.js';
import { mealDisplayTitleForStructuredMeal } from '../../lib/mealDisplayNameHelpers.js';
import { createMealDisplayModelFromStructuredMeal } from '../../lib/mealRecipeDisplay.js';
import { formatExerciseSetsRepsDisplay } from '../../lib/planDataIntegrity.js';
import { getCanonicalExercise } from '../../lib/exerciseCanonicalMap';
import { BookOpen, Check, HelpCircle, RefreshCw, Star } from 'lucide-react';
import {
  KARTA_NEON_JEMNA,
  HOTOVO_RAM,
  HOTOVO_TEXT,
  MAKRO,
  PANEL,
  STITEK,
  TLACITKO,
  TLACITKO_HLAVNI,
  akcentJidla,
  podilyMaker,
} from '../../lib/profile/designTokens.js';

export function mealTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'breakfast') return 'Snídaně';
  if (t === 'snack') return 'Svačina';
  if (t === 'lunch') return 'Oběd';
  if (t === 'dinner') return 'Večeře';
  return type || 'Jídlo';
}



function topIngredients(structMeal, limit = 3) {
  const model = structMeal ? createMealDisplayModelFromStructuredMeal(structMeal) : null;
  const fromModel = Array.isArray(model?.ingredients) ? model.ingredients : [];
  if (fromModel.length) return fromModel.slice(0, limit);
  const raw = structMeal?.ingredients || structMeal?.recipe?.ingredients;
  if (Array.isArray(raw)) {
    return raw.map((x) => (typeof x === 'string' ? x : x?.name || x?.original || '')).filter(Boolean).slice(0, limit);
  }
  return [];
}

function filterWorkoutExercises(workout) {
  const list = Array.isArray(workout?.exercises) ? workout.exercises : [];
  return list.filter((ex) => String(ex?.canonical_key || '').toLowerCase() !== 'rest');
}

export default function ProfileDayMealsPanel({
  meals = [],
  structDay = null,
  planHtml = '',
  dayName = '',
  dayIndexForKeys = 0,
  canPinMeals = true,
  onRecipeClick,
  onSwapClick,
  onPinClick,
  isMealPinned,
  pinToastByKey = {},
  workout = null,
  showWorkout = false,
  onExerciseClick,
  showMealCompletion = false,
  isMealCompleted = null,
  isMealCompletionPending = null,
  onMealCompleteToggle = null,
}) {
  const structMeals = Array.isArray(structDay?.meals) ? structDay.meals : [];
  const exercises = showWorkout ? filterWorkoutExercises(workout) : [];

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="grid grid-cols-1 gap-3.5 min-[880px]:grid-cols-2 sm:gap-4">
        {(meals || []).map((meal, mi) => {
          const structMeal = pairStructMeal(structMeals, meal, mi);
          const title = structMeal
            ? mealDisplayTitleForStructuredMeal(structMeal, planHtml, dayName || '')
            : (meal.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const nutrition = getMealNutritionDisplay(structMeal || meal);
          const ings = topIngredients(structMeal);
          const mealKey = `${dayIndexForKeys}_${mi}`;
          const pinned = isMealPinned?.(meal.type || '', title) || false;
          const pinToast = pinToastByKey[mealKey];
          const mealDone = showMealCompletion && isMealCompleted?.(meal, mi);
          const mealPending = showMealCompletion && isMealCompletionPending?.(meal, mi);
          const akcent = akcentJidla(meal.type);
          const podily = podilyMaker(nutrition);
          return (
            <article
              key={`${meal.type}-${mi}`}
              className={`${KARTA_NEON_JEMNA} border-l-4 ${akcent.ram} p-4 sm:p-5 flex flex-col gap-3 min-w-0${mealDone ? ` ${HOTOVO_RAM}` : ''}`}
            >
              <header className="flex items-start justify-between gap-3">
                <span className={`${STITEK} ${akcent.stitek}`}>{mealTypeLabel(meal.type)}</span>
                {nutrition.calories != null ? (
                  <span className="shrink-0 text-sm font-bold text-neutral-300">
                    {nutrition.calories}
                    <span className="ml-0.5 text-[10px] font-medium text-neutral-500">kcal</span>
                  </span>
                ) : null}
              </header>

              {/* Název je to hlavní na kartě — musí být větší než kalorie (feedback trenéra). */}
              <h4 className="m-0 text-xl sm:text-[22px] font-bold leading-snug tracking-tight text-white">
                {title || mealTypeLabel(meal.type)}
              </h4>

              {podily ? (
                <div className="space-y-2">
                  <div className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full border border-neutral-800 bg-[#181c28] p-0.5">
                    <div style={{ width: `${podily.bilkoviny}%` }} className={`h-full rounded-sm ${MAKRO.bilkoviny.trida} shadow-[0_0_8px_rgba(0,242,254,0.6)]`} title={`Bílkoviny ${podily.bilkoviny} %`} />
                    <div style={{ width: `${podily.sacharidy}%` }} className={`h-full rounded-sm ${MAKRO.sacharidy.trida} shadow-[0_0_8px_rgba(34,197,94,0.6)]`} title={`Sacharidy ${podily.sacharidy} %`} />
                    <div style={{ width: `${podily.tuky}%` }} className={`h-full rounded-sm ${MAKRO.tuky.trida} shadow-[0_0_8px_rgba(132,204,22,0.6)]`} title={`Tuky ${podily.tuky} %`} />
                  </div>
                  <ul className="m-0 flex list-none items-center justify-between p-0 text-xs font-semibold text-neutral-300" aria-label="Makroživiny">
                    <li className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${MAKRO.bilkoviny.trida}`} aria-hidden />
                      <span>B {nutrition.protein_g != null ? `${nutrition.protein_g} g` : `${podily.bilkoviny} %`}</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${MAKRO.sacharidy.trida}`} aria-hidden />
                      <span>S {nutrition.carbs_g != null ? `${nutrition.carbs_g} g` : `${podily.sacharidy} %`}</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${MAKRO.tuky.trida}`} aria-hidden />
                      <span>T {nutrition.fat_g != null ? `${nutrition.fat_g} g` : `${podily.tuky} %`}</span>
                    </li>
                  </ul>
                </div>
              ) : null}

              {ings.length > 0 ? (
                <p className="m-0 text-xs leading-relaxed text-neutral-400">{ings.join(' · ')}</p>
              ) : null}

              <div className="mt-auto flex items-center gap-2 pt-1">
                <button
                  type="button"
                  className={`${TLACITKO_HLAVNI} min-h-[40px] flex-1 px-3`}
                  onClick={(e) => onRecipeClick?.(mi, e)}
                >
                  <BookOpen className="h-4 w-4" aria-hidden /> Recept
                </button>
                <button
                  type="button"
                  className={`${TLACITKO} min-h-[40px] w-10 shrink-0 px-0`}
                  onClick={() => onSwapClick?.(mi)}
                  title="Nahradit jiným jídlem"
                  aria-label="Nahradit jiným jídlem"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                </button>
                {canPinMeals ? (
                  <button
                    type="button"
                    className={`${TLACITKO} min-h-[40px] w-10 shrink-0 px-0${pinned ? ' border-amber-400/60 text-amber-300' : ''}`}
                    onClick={() => onPinClick?.(mi)}
                    title={pinned ? 'Zahrnuto od dalšího týdne' : 'Zahrnout od dalšího týdne'}
                    aria-label={pinned ? 'Zahrnuto od dalšího týdne' : 'Zahrnout od dalšího týdne'}
                    aria-pressed={pinned}
                  >
                    <Star className={`h-4 w-4${pinned ? ' fill-current' : ''}`} aria-hidden />
                  </button>
                ) : null}
                {showMealCompletion ? (
                  <label
                    className={`${TLACITKO} relative min-h-[40px] w-10 shrink-0 px-0${mealDone ? ` border-[#39ff14]/60 ${HOTOVO_TEXT}` : ''}`}
                    title={mealDone ? 'Splněno' : 'Označit jako splněné'}
                  >
                    <input
                      type="checkbox"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      checked={!!mealDone}
                      disabled={!!mealPending}
                      onChange={() => onMealCompleteToggle?.(meal, mi)}
                      aria-label={mealDone ? 'Označit jídlo jako nesplněné' : 'Označit jídlo jako splněné'}
                    />
                    {mealPending ? <span aria-hidden>…</span> : <Check className="h-4 w-4" aria-hidden />}
                  </label>
                ) : null}
              </div>

              {pinToast ? (
                <p className={`m-0 text-xs ${pinToast.type === 'error' ? 'text-red-300' : HOTOVO_TEXT}`}>
                  {pinToast.message}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {showWorkout ? (
        exercises.length > 0 ? (
          <div className="mt-5">
            <h4 className="m-0 mb-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-[#c4b5fd]">Trénink tento den</h4>
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 min-[880px]:grid-cols-2">
              {exercises.map((ex, xi) => {
                // JEDEN NÁZEV PRO CVIK V CELÉ APLIKACI.
                // Plán si nesl vlastní `display_name_cs` („Bench press“),
                // zatímco zápis tréninku bere název z kanonického registru
                // („Tlak na lavici“). Uživatel viděl u téhož cviku dvě jména.
                // Registr je zdroj pravdy — klíčem je `canonical_key`.
                const name = getCanonicalExercise(ex.canonical_key)?.display_name_cs
                  || ex.display_name_cs || ex.name_cs || ex.name || 'Cvik';
                const part = formatExerciseSetsRepsDisplay(ex);
                return (
                  <li key={xi} className={`${PANEL} flex min-w-0 items-center justify-between gap-2.5 px-3 py-2.5`}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <strong className="min-w-0 text-[15px] font-bold text-white">{name}</strong>
                      {part ? <span className="shrink-0 rounded-full border border-[#00f2fe]/35 bg-[#00f2fe]/12 px-2.5 py-0.5 text-xs font-bold text-[#7dd3fc]">{part}</span> : null}
                    </div>
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#00f2fe]/45 bg-[#00f2fe]/15 text-[#e0f2fe] transition-colors hover:bg-[#00f2fe]/30"
                      onClick={() => onExerciseClick?.(xi)}
                      title="Jak cvik provést"
                      aria-label={`Jak provést cvik ${name}`}
                    >
                      <HelpCircle className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="mt-5">
            <h4 className="m-0 mb-2.5 text-xs font-extrabold uppercase tracking-[0.06em] text-[#c4b5fd]">Trénink tento den</h4>
            <p className="m-0 text-sm text-neutral-300">Tento den je bez plánovaného tréninku — volno / regenerace.</p>
          </div>
        )
      ) : null}

    </div>
  );
}
