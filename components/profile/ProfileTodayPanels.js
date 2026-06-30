import { getMealNutritionDisplay } from '../../lib/mealNutritionDisplay.js';
import { mealDisplayTitleForStructuredMeal } from '../../lib/mealDisplayNameHelpers.js';
import { createMealDisplayModelFromStructuredMeal } from '../../lib/mealRecipeDisplay.js';
import { formatExerciseSetsRepsDisplay } from '../../lib/planDataIntegrity.js';

const MEAL_TYPE_ORDER = ['breakfast', 'snack', 'lunch', 'dinner'];

function mealTypeLabel(type) {
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

function sumDayNutrition(meals, structDay) {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  const structMeals = Array.isArray(structDay?.meals) ? structDay.meals : [];
  (meals || []).forEach((meal, mi) => {
    const sm = structMeals[mi] || structMeals.find((m) => (m?.type || '') === (meal?.type || ''));
    const n = getMealNutritionDisplay(sm || meal);
    if (n.calories != null) kcal += Number(n.calories) || 0;
    if (n.protein_g != null) protein += Number(n.protein_g) || 0;
    if (n.carbs_g != null) carbs += Number(n.carbs_g) || 0;
    if (n.fat_g != null) fat += Number(n.fat_g) || 0;
  });
  return { kcal: kcal || null, protein, carbs, fat };
}

export default function ProfileTodayPanels({
  todayLabel,
  todayDay,
  todayDayIndex = 0,
  structuredPlan,
  program = 'START',
  planHtml = '',
  onRecipeClick,
  onExerciseClick,
  onScrollToMeals,
  onScrollToWorkout,
  onScrollToWeek,
  onScrollToPrograms,
}) {
  if (!todayDay) return null;

  const structDay = todayDay.structDay || structuredPlan?.days?.[todayDay.originalIndex ?? todayDayIndex];
  const meals = Array.isArray(todayDay.meals) ? todayDay.meals : [];
  const sortedMeals = [...meals].sort((a, b) => {
    const ai = MEAL_TYPE_ORDER.indexOf(String(a?.type || '').toLowerCase());
    const bi = MEAL_TYPE_ORDER.indexOf(String(b?.type || '').toLowerCase());
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const dayNutrition = sumDayNutrition(meals, structDay);
  const targets = structuredPlan?.targets || {};
  const targetKcal = Number(targets.calories_per_day) || null;

  const workout = structDay?.workout;
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises.filter((ex) => {
    const key = String(ex?.canonical_key || '').toLowerCase();
    return key !== 'rest';
  }) : [];
  const hasWorkout = exercises.length > 0;
  const workoutMinutes = Number(workout?.duration_minutes) || (exercises.length ? exercises.length * 8 : 0);

  const continuationText = program === 'START'
    ? 'Drž se dnešního plánu. Po týdnu se rozhodneš, jestli pokračuješ samostatně nebo v ON CLUBU.'
    : 'Drž se dnešního plánu — v aplikaci máš vše na jednom místě.';

  return (
    <div className="profile-today-root">
      <section className="profile-today-hero" aria-labelledby="profile-today-heading">
        <p className="profile-today-date">{todayLabel}</p>
        <h2 id="profile-today-heading" className="profile-today-heading">Dnes máš jasno</h2>
        <p className="profile-today-lead">Tvůj dnešní plán je připravený.</p>
        <div className="profile-today-quick-cards">
          <article className="profile-today-card">
            <h3>Jídlo dnes</h3>
            <p className="profile-today-stat">{meals.length} jídel</p>
            <p className="profile-today-stat">
              {dayNutrition.kcal != null ? `${Math.round(dayNutrition.kcal)} kcal` : '— kcal'}
              {targetKcal ? ` / cíl ${Math.round(targetKcal)}` : ''}
            </p>
            <p className="profile-today-macros">
              B {Math.round(dayNutrition.protein) || '—'} g · S {Math.round(dayNutrition.carbs) || '—'} g · T {Math.round(dayNutrition.fat) || '—'} g
            </p>
            <button type="button" className="profile-today-cta" onClick={onScrollToMeals}>
              Zobrazit dnešní jídla
            </button>
          </article>
          <article className="profile-today-card">
            <h3>Trénink dnes</h3>
            {hasWorkout ? (
              <>
                <p className="profile-today-stat">{exercises.length} cviků</p>
                <p className="profile-today-stat">{workoutMinutes ? `~${workoutMinutes} min` : 'Dle plánu'}</p>
                <button type="button" className="profile-today-cta" onClick={onScrollToWorkout}>
                  Zobrazit trénink
                </button>
              </>
            ) : (
              <>
                <p className="profile-today-stat">Dnes máš volnější den / regeneraci</p>
                <button type="button" className="profile-today-cta" onClick={onScrollToWeek}>
                  Zobrazit plán týdne
                </button>
              </>
            )}
          </article>
          <article className="profile-today-card">
            <h3>Další krok</h3>
            <p className="profile-today-next-text">{continuationText}</p>
            <button type="button" className="profile-today-cta profile-today-cta--secondary" onClick={onScrollToPrograms}>
              {program === 'START' ? 'Jak pokračovat po STARTU' : 'Možnosti programu'}
            </button>
          </article>
        </div>
      </section>

      <section id="profile-today-meals" className="profile-today-section" aria-labelledby="profile-today-meals-heading">
        <h3 id="profile-today-meals-heading" className="profile-today-section-title">Dnešní jídla</h3>
        <div className="profile-today-meals-list">
          {sortedMeals.map((meal, mi) => {
            const structMeal = structDay?.meals?.[mi]
              || structDay?.meals?.find((m) => (m?.type || '') === (meal?.type || ''));
            const title = structMeal
              ? mealDisplayTitleForStructuredMeal(structMeal, planHtml, todayDay.dayName || '')
              : (meal.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            const nutrition = getMealNutritionDisplay(structMeal || meal);
            const ings = topIngredients(structMeal);
            const origIdx = meals.indexOf(meal);
            return (
              <article key={`${meal.type}-${mi}`} className="profile-today-meal-card">
                <div className="profile-today-meal-head">
                  <span className="profile-today-meal-type">{mealTypeLabel(meal.type)}</span>
                  {nutrition.calories != null ? (
                    <span className="profile-today-meal-kcal">{nutrition.calories} kcal</span>
                  ) : null}
                </div>
                <h4 className="profile-today-meal-title">{title || mealTypeLabel(meal.type)}</h4>
                <p className="profile-today-meal-macros">
                  {nutrition.protein_g != null ? `B ${nutrition.protein_g} g` : ''}
                  {nutrition.carbs_g != null ? ` · S ${nutrition.carbs_g} g` : ''}
                  {nutrition.fat_g != null ? ` · T ${nutrition.fat_g} g` : ''}
                </p>
                {ings.length > 0 ? (
                  <p className="profile-today-meal-ingredients">{ings.join(' · ')}</p>
                ) : null}
                <button
                  type="button"
                  className="profile-today-recipe-btn"
                  onClick={() => onRecipeClick?.(origIdx >= 0 ? origIdx : mi)}
                >
                  Recept
                </button>
              </article>
            );
          })}
        </div>
        <button type="button" className="profile-today-link-btn" onClick={onScrollToWeek}>
          Zobrazit celý jídelníček
        </button>
      </section>

      <section id="profile-today-workout" className="profile-today-section" aria-labelledby="profile-today-workout-heading">
        <h3 id="profile-today-workout-heading" className="profile-today-section-title">Dnešní trénink</h3>
        {hasWorkout ? (
          <ul className="profile-today-workout-list">
            {exercises.map((ex, xi) => {
              const name = ex.display_name_cs || ex.name_cs || ex.name || 'Cvik';
              const part = formatExerciseSetsRepsDisplay(ex);
              return (
                <li key={xi} className="profile-today-workout-item">
                  <div>
                    <strong>{name}</strong>
                    <span className="profile-today-workout-part"> · {part}</span>
                  </div>
                  <button
                    type="button"
                    className="profile-today-exercise-btn"
                    onClick={() => onExerciseClick?.(xi)}
                  >
                    Jak cvik dělat
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="profile-today-rest">
            <p>Dnes nemáš naplánovaný trénink. Soustřeď se na jídlo, kroky a regeneraci.</p>
            <button type="button" className="profile-today-link-btn" onClick={onScrollToWeek}>
              Zobrazit týdenní trénink
            </button>
          </div>
        )}
      </section>

      <style jsx>{`
        .profile-today-root {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          margin-bottom: 20px;
        }
        .profile-today-hero {
          margin-bottom: 24px;
        }
        .profile-today-date {
          margin: 0 0 6px;
          font-size: 13px;
          color: #94a3b8;
          text-transform: capitalize;
        }
        .profile-today-heading {
          margin: 0 0 8px;
          font-size: clamp(22px, 5vw, 28px);
          font-weight: 800;
          color: #f8fafc;
        }
        .profile-today-lead {
          margin: 0 0 16px;
          color: #cbd5e1;
          font-size: 15px;
        }
        .profile-today-quick-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 720px) {
          .profile-today-quick-cards {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .profile-today-card {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(124, 58, 237, 0.35);
          border-radius: 14px;
          padding: 16px;
          min-width: 0;
        }
        .profile-today-card h3 {
          margin: 0 0 10px;
          font-size: 14px;
          font-weight: 700;
          color: #c4b5fd;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .profile-today-stat {
          margin: 0 0 6px;
          font-size: 15px;
          color: #e2e8f0;
          font-weight: 600;
        }
        .profile-today-macros {
          margin: 0 0 12px;
          font-size: 13px;
          color: #94a3b8;
        }
        .profile-today-next-text {
          margin: 0 0 12px;
          font-size: 14px;
          line-height: 1.5;
          color: #cbd5e1;
        }
        .profile-today-cta {
          width: 100%;
          min-height: 44px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #0ea5e9, #7c3aed);
          color: #fff;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          padding: 10px 14px;
        }
        .profile-today-cta--secondary {
          background: rgba(124, 58, 237, 0.2);
          border: 1px solid rgba(167, 139, 250, 0.45);
        }
        .profile-today-section {
          margin-bottom: 24px;
        }
        .profile-today-section-title {
          margin: 0 0 12px;
          font-size: 18px;
          font-weight: 700;
          color: #e9d5ff;
        }
        .profile-today-meals-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .profile-today-meal-card {
          background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          padding: 14px;
          min-width: 0;
        }
        .profile-today-meal-head {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .profile-today-meal-type {
          font-size: 12px;
          font-weight: 700;
          color: #38bdf8;
          text-transform: uppercase;
        }
        .profile-today-meal-kcal {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 600;
        }
        .profile-today-meal-title {
          margin: 0 0 6px;
          font-size: 16px;
          color: #f1f5f9;
        }
        .profile-today-meal-macros,
        .profile-today-meal-ingredients {
          margin: 0 0 10px;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.45;
        }
        .profile-today-recipe-btn {
          width: 100%;
          min-height: 44px;
          border: none;
          border-radius: 10px;
          background: rgba(124, 58, 237, 0.35);
          border: 1px solid rgba(167, 139, 250, 0.5);
          color: #f5f3ff;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
        }
        .profile-today-link-btn {
          margin-top: 12px;
          background: transparent;
          border: none;
          color: #a78bfa;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          text-decoration: underline;
          padding: 8px 0;
          min-height: 44px;
        }
        .profile-today-workout-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .profile-today-workout-item {
          background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .profile-today-workout-part {
          color: #94a3b8;
          font-size: 14px;
        }
        .profile-today-exercise-btn {
          align-self: flex-start;
          min-height: 44px;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid rgba(56, 189, 248, 0.45);
          background: rgba(14, 165, 233, 0.15);
          color: #e0f2fe;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
        }
        .profile-today-rest p {
          margin: 0 0 8px;
          color: #cbd5e1;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
