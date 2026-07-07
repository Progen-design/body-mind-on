// Sdílený moderní renderer denních jídel (a volitelně tréninku).
// Používá ho horní „Dnešní plán“ (ProfileTodayPanels) i ostatní dny v týdenním přehledu (PlanViewer),
// aby měl celý profil jeden vizuální systém a jeden zdroj dat (structured_plan_json).
import { getMealNutritionDisplay } from '../../lib/mealNutritionDisplay.js';
import MacroRatioChart from '../MacroRatioChart.js';
import { mealDisplayTitleForStructuredMeal } from '../../lib/mealDisplayNameHelpers.js';
import { createMealDisplayModelFromStructuredMeal } from '../../lib/mealRecipeDisplay.js';
import { formatExerciseSetsRepsDisplay } from '../../lib/planDataIntegrity.js';

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
}) {
  const structMeals = Array.isArray(structDay?.meals) ? structDay.meals : [];
  const exercises = showWorkout ? filterWorkoutExercises(workout) : [];

  return (
    <div className="profile-day-panel">
      <div className="profile-today-meals-list">
        {(meals || []).map((meal, mi) => {
          const structMeal = structMeals[mi]
            || structMeals.find((m) => (m?.type || '') === (meal?.type || ''));
          const title = structMeal
            ? mealDisplayTitleForStructuredMeal(structMeal, planHtml, dayName || '')
            : (meal.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const nutrition = getMealNutritionDisplay(structMeal || meal);
          const ings = topIngredients(structMeal);
          const mealKey = `${dayIndexForKeys}_${mi}`;
          const pinned = isMealPinned?.(meal.type || '', title) || false;
          const pinToast = pinToastByKey[mealKey];
          return (
            <article key={`${meal.type}-${mi}`} className="profile-today-meal-card">
              <span className="profile-today-meal-type">{mealTypeLabel(meal.type)}</span>
              <h4 className="profile-today-meal-title">{title || mealTypeLabel(meal.type)}</h4>
              {nutrition.calories != null ? (
                <p className="profile-today-meal-kcal-main">{nutrition.calories} kcal</p>
              ) : null}
              <p className="profile-today-meal-macros">
                {nutrition.protein_g != null ? `Bílkoviny ${nutrition.protein_g} g` : ''}
                {nutrition.carbs_g != null ? ` · Sacharidy ${nutrition.carbs_g} g` : ''}
                {nutrition.fat_g != null ? ` · Tuky ${nutrition.fat_g} g` : ''}
              </p>
              <MacroRatioChart
                protein_g={nutrition.protein_g}
                carbs_g={nutrition.carbs_g}
                fat_g={nutrition.fat_g}
                calories={nutrition.calories}
                compact
              />
              {ings.length > 0 ? (
                <p className="profile-today-meal-ingredients">{ings.join(' · ')}</p>
              ) : null}
              <div className="profile-today-meal-actions">
                <button
                  type="button"
                  className="profile-today-recipe-btn"
                  onClick={(e) => onRecipeClick?.(mi, e)}
                >
                  Recept
                </button>
                <button
                  type="button"
                  className="profile-today-secondary-btn"
                  onClick={() => onSwapClick?.(mi)}
                >
                  Nahradit jiným
                </button>
                {canPinMeals ? (
                  <button
                    type="button"
                    className={`profile-today-secondary-btn ${pinned ? 'profile-today-secondary-btn--active' : ''}`}
                    onClick={() => onPinClick?.(mi)}
                  >
                    {pinned ? '✓ Zahrnuto od dalšího týdne' : 'Zahrnout od dalšího týdne'}
                  </button>
                ) : null}
              </div>
              {pinToast ? (
                <p className={`profile-today-pin-toast profile-today-pin-toast--${pinToast.type || 'success'}`}>
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
            <h4 className="profile-day-workout-title">Trénink tento den</h4>
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
                      Jak cvik provést
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="profile-day-workout">
            <h4 className="profile-day-workout-title">Trénink tento den</h4>
            <p className="profile-day-workout-rest">Tento den je bez plánovaného tréninku — volno / regenerace.</p>
          </div>
        )
      ) : null}

      <style jsx>{`
        .profile-day-panel {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          min-width: 0;
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
          max-width: 100%;
        }
        .profile-today-meal-type {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #38bdf8;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .profile-today-meal-title {
          margin: 0 0 6px;
          font-size: 16px;
          color: #f1f5f9;
        }
        .profile-today-meal-kcal-main {
          margin: 0 0 8px;
          font-size: 18px;
          font-weight: 800;
          color: #f8fafc;
        }
        .profile-today-meal-macros,
        .profile-today-meal-ingredients {
          margin: 0 0 10px;
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.45;
        }
        .profile-today-meal-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 12px;
        }
        .profile-today-recipe-btn {
          width: 100%;
          min-height: 48px;
          border: none;
          border-radius: 10px;
          background: rgba(124, 58, 237, 0.35);
          border: 1px solid rgba(167, 139, 250, 0.5);
          color: #f5f3ff;
          font-weight: 700;
          font-size: 15px;
          cursor: pointer;
        }
        .profile-today-secondary-btn {
          width: 100%;
          min-height: 48px;
          border-radius: 10px;
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.35);
          color: #e2e8f0;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          padding: 10px 14px;
        }
        .profile-today-secondary-btn--active {
          border-color: rgba(74, 222, 128, 0.5);
          color: #bbf7d0;
        }
        .profile-today-pin-toast {
          margin: 8px 0 0;
          font-size: 13px;
          color: #86efac;
        }
        .profile-today-pin-toast--error {
          color: #fca5a5;
        }
        .profile-day-workout {
          margin-top: 16px;
        }
        .profile-day-workout-title {
          margin: 0 0 10px;
          font-size: 15px;
          font-weight: 700;
          color: #e9d5ff;
        }
        .profile-day-workout-rest {
          margin: 0;
          font-size: 14px;
          color: #cbd5e1;
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
          min-width: 0;
        }
        .profile-today-workout-part {
          color: #94a3b8;
          font-size: 14px;
        }
        .profile-today-exercise-btn {
          align-self: flex-start;
          min-height: 48px;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid rgba(56, 189, 248, 0.45);
          background: rgba(14, 165, 233, 0.15);
          color: #e0f2fe;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
