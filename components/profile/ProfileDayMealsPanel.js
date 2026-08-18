// Sdílený moderní renderer denních jídel (a volitelně tréninku).
// Používá ho horní „Dnešní plán“ (ProfileTodayPanels) i ostatní dny v týdenním přehledu (PlanViewer),
// aby měl celý profil jeden vizuální systém a jeden zdroj dat (structured_plan_json).
import { getMealNutritionDisplay, pairStructMeal } from '../../lib/mealNutritionDisplay.js';
import MacroRatioChart from '../MacroRatioChart.js';
import { mealDisplayTitleForStructuredMeal } from '../../lib/mealDisplayNameHelpers.js';
import { createMealDisplayModelFromStructuredMeal } from '../../lib/mealRecipeDisplay.js';
import { formatExerciseSetsRepsDisplay } from '../../lib/planDataIntegrity.js';
import { getCanonicalExercise } from '../../lib/exerciseCanonicalMap';

export function mealTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'breakfast') return 'Snídaně';
  if (t === 'snack') return 'Svačina';
  if (t === 'lunch') return 'Oběd';
  if (t === 'dinner') return 'Večeře';
  return type || 'Jídlo';
}


/**
 * BARVA PODLE TYPU JÍDLA.
 *
 * Karty byly všechny stejně šedé, takže se den četl jako jeden blok textu.
 * Akcent je jediné, co odlišuje snídani od večeře na první pohled — proto
 * jeden odstín na typ, ne duha: barva nese informaci, není dekorace.
 *
 * @param {string} type
 * @returns {string} CSS třída
 */
function mealAccentClass(type) {
  // POZOR NA DVA TVARY TÉHOŽ TYPU.
  // Ze `structured_plan_json` chodí anglický klíč (`breakfast`), z HTML plánu
  // parsovaný český popisek („Snídaně“) — a tenhle panel dostává to druhé.
  // První verze porovnávala jen anglické klíče, takže všechny karty spadly na
  // výchozí šedou a barevný akcent nebyl vidět vůbec.
  const t = String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (t.startsWith('breakfast') || t.startsWith('snidan')) return 'meal--breakfast';
  if (t.startsWith('snack') || t.startsWith('svacin')) return 'meal--snack';
  if (t.startsWith('lunch') || t.startsWith('obed')) return 'meal--lunch';
  if (t.startsWith('dinner') || t.startsWith('vecer')) return 'meal--dinner';
  return 'meal--other';
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
    <div className="profile-day-panel">
      <div className="profile-today-meals-list">
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
          return (
            <article
              key={`${meal.type}-${mi}`}
              className={`profile-today-meal-card ${mealAccentClass(meal.type)}${mealDone ? ' profile-today-meal-card--done' : ''}`}
            >
              <header className="meal-head">
                <span className="meal-type">{mealTypeLabel(meal.type)}</span>
                {nutrition.calories != null ? (
                  <span className="meal-kcal">{nutrition.calories}<small>kcal</small></span>
                ) : null}
              </header>

              <h4 className="meal-title">{title || mealTypeLabel(meal.type)}</h4>

              {(nutrition.protein_g != null || nutrition.carbs_g != null || nutrition.fat_g != null) ? (
                <ul className="meal-macros" aria-label="Makroživiny">
                  {nutrition.protein_g != null ? (
                    <li className="macro macro--p"><b>{nutrition.protein_g}<i>g</i></b><span>Bílkoviny</span></li>
                  ) : null}
                  {nutrition.carbs_g != null ? (
                    <li className="macro macro--c"><b>{nutrition.carbs_g}<i>g</i></b><span>Sacharidy</span></li>
                  ) : null}
                  {nutrition.fat_g != null ? (
                    <li className="macro macro--f"><b>{nutrition.fat_g}<i>g</i></b><span>Tuky</span></li>
                  ) : null}
                </ul>
              ) : null}

              <MacroRatioChart
                protein_g={nutrition.protein_g}
                carbs_g={nutrition.carbs_g}
                fat_g={nutrition.fat_g}
                calories={nutrition.calories}
                compact
              />

              {ings.length > 0 ? (
                <p className="meal-ings">{ings.join(' · ')}</p>
              ) : null}

              <div className="meal-actions">
                <button
                  type="button"
                  className="act act--primary"
                  onClick={(e) => onRecipeClick?.(mi, e)}
                >
                  <span aria-hidden>📖</span> Recept
                </button>
                <button
                  type="button"
                  className="act"
                  onClick={() => onSwapClick?.(mi)}
                  title="Nahradit jiným jídlem"
                  aria-label="Nahradit jiným jídlem"
                >
                  <span aria-hidden>🔄</span>
                </button>
                {canPinMeals ? (
                  <button
                    type="button"
                    className={`act${pinned ? ' act--on' : ''}`}
                    onClick={() => onPinClick?.(mi)}
                    title={pinned ? 'Zahrnuto od dalšího týdne' : 'Zahrnout od dalšího týdne'}
                    aria-label={pinned ? 'Zahrnuto od dalšího týdne' : 'Zahrnout od dalšího týdne'}
                    aria-pressed={pinned}
                  >
                    <span aria-hidden>{pinned ? '★' : '☆'}</span>
                  </button>
                ) : null}
                {showMealCompletion ? (
                  <label className={`act act--check${mealDone ? ' act--on' : ''}`} title={mealDone ? 'Splněno' : 'Označit jako splněné'}>
                    <input
                      type="checkbox"
                      checked={!!mealDone}
                      disabled={!!mealPending}
                      onChange={() => onMealCompleteToggle?.(meal, mi)}
                      aria-label={mealDone ? 'Označit jídlo jako nesplněné' : 'Označit jídlo jako splněné'}
                    />
                    <span aria-hidden>{mealPending ? '…' : '✓'}</span>
                  </label>
                ) : null}
              </div>

              {pinToast ? (
                <p className={`meal-toast${pinToast.type === 'error' ? ' meal-toast--error' : ''}`}>
                  {pinToast.message}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {showWorkout ? (
        exercises.length > 0 ? (
          <div className="profile-day-workout">
            <h4 className="wo-title">Trénink tento den</h4>
            <ul className="wo-list">
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
                  <li key={xi} className="wo-item">
                    <div className="wo-main">
                      <strong className="wo-name">{name}</strong>
                      {part ? <span className="wo-badge">{part}</span> : null}
                    </div>
                    <button
                      type="button"
                      className="wo-help"
                      onClick={() => onExerciseClick?.(xi)}
                      title="Jak cvik provést"
                      aria-label={`Jak provést cvik ${name}`}
                    >
                      <span aria-hidden>?</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="profile-day-workout">
            <h4 className="wo-title">Trénink tento den</h4>
            <p className="wo-rest">Tento den je bez plánovaného tréninku — volno / regenerace.</p>
          </div>
        )
      ) : null}

      <style jsx>{`
        /* ── DENNÍ JÍDLA ──────────────────────────────────────────────────────
           Původní karty byly jednosloupcové, šedé, s třemi tlačítky přes celou
           šířku pod sebou — na desktopu z toho byl úzký sloupec s prázdnem
           vpravo a text splýval. Přepracováno na mřížku s barevným akcentem
           podle typu jídla, výrazným číslem kalorií a kompaktní řadou akcí.
           Vzor je Whoop/Fitbod: jedno velké číslo, makra jako čipy, ovládání
           malé a po straně. */
        .profile-day-panel { width: 100%; max-width: 100%; box-sizing: border-box; min-width: 0; }

        .profile-today-meals-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        /* Dva sloupce až tam, kde se karta nezmáčkne. Mobil zůstává 1 sloupec. */
        @media (min-width: 880px) {
          .profile-today-meals-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        .profile-today-meal-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px 14px 14px 18px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: linear-gradient(180deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.85));
          min-width: 0;
          overflow: hidden;
        }
        /* Barevný pruh vlevo = typ jídla. Nese informaci, proto je součástí
           karty, ne dekorace navíc. */
        .profile-today-meal-card::before {
          content: '';
          position: absolute;
          inset: 0 auto 0 0;
          width: 4px;
          background: var(--akcent, #64748b);
        }
        .meal--breakfast { --akcent: #f59e0b; --akcent-soft: rgba(245, 158, 11, 0.16); }
        .meal--snack     { --akcent: #22d3ee; --akcent-soft: rgba(34, 211, 238, 0.16); }
        .meal--lunch     { --akcent: #a78bfa; --akcent-soft: rgba(167, 139, 250, 0.16); }
        .meal--dinner    { --akcent: #fb7185; --akcent-soft: rgba(251, 113, 133, 0.16); }
        .meal--other     { --akcent: #94a3b8; --akcent-soft: rgba(148, 163, 184, 0.16); }

        .profile-today-meal-card--done {
          border-color: rgba(34, 197, 94, 0.45);
          background: linear-gradient(180deg, rgba(22, 101, 52, 0.28), rgba(15, 23, 42, 0.85));
        }

        .meal-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .meal-type {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--akcent);
          padding: 3px 8px;
          border-radius: 999px;
          background: var(--akcent-soft);
        }
        .meal-kcal {
          font-size: 22px;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1;
          white-space: nowrap;
        }
        .meal-kcal small { font-size: 11px; font-weight: 600; color: #94a3b8; margin-left: 3px; }

        .meal-title {
          margin: 0;
          font-size: 15px;
          line-height: 1.35;
          color: #f1f5f9;
        }

        /* Makra jako tři čipy místo jedné šedé věty — čitelné na jeden pohled. */
        .meal-macros {
          list-style: none;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin: 0;
          padding: 0;
        }
        .macro {
          display: flex;
          flex-direction: column;
          gap: 1px;
          padding: 6px 8px;
          border-radius: 9px;
          background: rgba(2, 6, 23, 0.5);
          border-left: 3px solid var(--m, #64748b);
          min-width: 0;
        }
        .macro b { font-size: 15px; font-weight: 800; color: #e2e8f0; line-height: 1.1; }
        .macro b i { font-style: normal; font-size: 10px; color: #94a3b8; margin-left: 1px; }
        .macro span {
          font-size: 10px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .macro--p { --m: #38bdf8; }
        .macro--c { --m: #fbbf24; }
        .macro--f { --m: #f472b6; }

        .meal-ings {
          margin: 0;
          font-size: 12px;
          line-height: 1.45;
          color: #94a3b8;
        }

        /* Akce v jedné řadě: text jen u primární, zbytek ikony s aria-label. */
        .meal-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: auto;
          padding-top: 4px;
        }
        .act {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 40px;
          min-width: 40px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          background: rgba(15, 23, 42, 0.6);
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .act:hover { border-color: rgba(148, 163, 184, 0.6); }
        .act--primary {
          flex: 1;
          border-color: rgba(167, 139, 250, 0.5);
          background: rgba(124, 58, 237, 0.32);
          color: #f5f3ff;
          font-weight: 700;
        }
        .act--on {
          border-color: rgba(250, 204, 21, 0.6);
          color: #fde68a;
          background: rgba(250, 204, 21, 0.12);
        }
        .act--check { position: relative; }
        .act--check input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .act--check.act--on {
          border-color: rgba(34, 197, 94, 0.6);
          color: #86efac;
          background: rgba(34, 197, 94, 0.14);
        }

        .meal-toast { margin: 0; font-size: 12px; color: #86efac; }
        .meal-toast--error { color: #fca5a5; }

        /* ── TRÉNINK TENTO DEN ────────────────────────────────────────────────
           Bylo: prázdná buňka, název vlevo, tlačítko „Jak cvik provést“ přes
           celou šířku. Teď je název dominantní, série/opakování jako badge
           a nápověda jako ikona — řádek se vejde na jednu výšku. */
        .profile-day-workout { margin-top: 18px; }
        .wo-title {
          margin: 0 0 10px;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #c4b5fd;
        }
        .wo-rest { margin: 0; font-size: 14px; color: #cbd5e1; }
        .wo-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }
        @media (min-width: 880px) {
          .wo-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .wo-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(30, 41, 59, 0.72);
          min-width: 0;
        }
        .wo-main { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
        .wo-name {
          font-size: 15px;
          font-weight: 700;
          color: #f1f5f9;
          min-width: 0;
        }
        .wo-badge {
          flex-shrink: 0;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          color: #7dd3fc;
          background: rgba(56, 189, 248, 0.14);
          border: 1px solid rgba(56, 189, 248, 0.35);
          white-space: nowrap;
        }
        .wo-help {
          flex-shrink: 0;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 1px solid rgba(56, 189, 248, 0.45);
          background: rgba(14, 165, 233, 0.15);
          color: #e0f2fe;
          font-weight: 800;
          font-size: 15px;
          cursor: pointer;
          line-height: 1;
        }
        .wo-help:hover { background: rgba(14, 165, 233, 0.3); }
      `}</style>
    </div>
  );
}
