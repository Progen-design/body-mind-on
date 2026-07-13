import { useCallback, useState } from 'react';
import { resolveDayCalorieTarget, sumDayNutrition } from '../../lib/mealNutritionDisplay.js';
import MacroRatioChart from '../MacroRatioChart.js';
import { formatExerciseSetsRepsDisplay } from '../../lib/planDataIntegrity.js';
import ProfileDayMealsPanel from './ProfileDayMealsPanel.js';
import BetaTodaySection from '../beta/BetaTodaySection.js';
import WorkoutChangeModal from '../workout/WorkoutChangeModal.jsx';
import { supabase } from '../../lib/supabaseClient';

function envLabelPlain(trainingEnvironmentLabel, structuredPlan) {
  if (trainingEnvironmentLabel) {
    return String(trainingEnvironmentLabel).replace(/^Typ:\s*/i, '').trim();
  }
  return structuredPlan?.training_environment_label || '';
}

export default function ProfileTodayPanels({
  todayLabel,
  todayDay,
  todayDayIndex = 0,
  structuredPlan,
  planTargets = null,
  program = 'START',
  planHtml = '',
  trainingEnvironmentLabel = '',
  canPinMeals = true,
  onRecipeClick,
  onSwapClick,
  onPinClick,
  isMealPinned,
  pinToastByKey = {},
  onExerciseClick,
  onScrollToMeals,
  onScrollToWorkout,
  onScrollToWeek,
  planId = null,
  habitIds = [],
  onWorkoutPlanUpdated = null,
  trainingEnvironment = 'gym',
}) {
  const [workoutCompleted, setWorkoutCompleted] = useState(false);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [workoutBusy, setWorkoutBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreSlow, setRestoreSlow] = useState(false);
  const [workoutError, setWorkoutError] = useState(null);

  const handleCompletionsChange = useCallback((info) => {
    setWorkoutCompleted(!!info?.workoutCompleted);
  }, []);

  const trackWorkoutEvent = useCallback(async (name) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      fetch('/api/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_name: name, properties: { source_component: 'WorkoutChangeModal' } }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);

  const handleRestoreOriginal = async () => {
    if (!planId || restoreBusy || workoutCompleted) return;
    setRestoreBusy(true);
    setRestoreSlow(false);
    setWorkoutError(null);

    const slowTimer = setTimeout(() => setRestoreSlow(true), 8000);
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 20000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Přihlas se prosím znovu.');
      const res = await fetch('/api/workout/restore-today', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: planId,
          plan_day_index: todayDay?.originalIndex ?? todayDayIndex,
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Nepodařilo obnovit trénink.');
      onWorkoutPlanUpdated?.(data);
      trackWorkoutEvent('workout_original_restored');
    } catch (e) {
      if (e?.name === 'AbortError') {
        setWorkoutError('Obnovení trvá déle než obvykle. Zkus to znovu.');
      } else {
        setWorkoutError(e.message || 'Nepodařilo obnovit trénink.');
      }
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      setRestoreBusy(false);
      setRestoreSlow(false);
    }
  };

  if (!todayDay) return null;

  const structDay = todayDay.structDay || structuredPlan?.days?.[todayDay.originalIndex ?? todayDayIndex];
  const meals = Array.isArray(todayDay.meals) ? todayDay.meals : [];
  const dayNutrition = sumDayNutrition(meals, structDay);
  const targets = planTargets || structuredPlan?.targets || {};
  const targetKcal = resolveDayCalorieTarget(structDay, targets);
  const envPlain = envLabelPlain(trainingEnvironmentLabel, structuredPlan);

  const workout = structDay?.workout;
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises.filter((ex) => {
    const key = String(ex?.canonical_key || '').toLowerCase();
    return key !== 'rest';
  }) : [];
  const hasWorkout = exercises.length > 0;
  const workoutMinutes = Number(workout?.duration_minutes) || (exercises.length ? exercises.length * 8 : 0);
  const hasReplacementBackup = !!workout?.original_workout_backup;
  const planDayIdx = todayDay.originalIndex ?? todayDayIndex;
  const defaultLoc = trainingEnvironment === 'gym' ? 'gym' : trainingEnvironment === 'home' ? 'no_equipment' : 'home';

  return (
    <div className="profile-today-root">
      <BetaTodaySection
        planId={planId}
        planDay={planDayIdx}
        meals={meals}
        hasWorkout={hasWorkout}
        habitIds={habitIds}
        feedbackContext="first_plan"
        onCompletionsChange={handleCompletionsChange}
      />
      <section className="profile-today-hero" aria-labelledby="profile-today-heading">
        <p className="profile-today-date">{todayLabel}</p>
        <h2 id="profile-today-heading" className="profile-today-heading">Dnešní plán</h2>
        <p className="profile-today-lead">Tvůj dnešní plán je připravený.</p>
        <div className="profile-today-quick-cards">
          <article className="profile-today-card">
            <h3>Jídlo dnes</h3>
            <p className="profile-today-stat">{meals.length} jídel</p>
            <p className="profile-today-stat profile-today-stat--kcal">
              {dayNutrition.kcal != null ? `cca ${Math.round(dayNutrition.kcal)} kcal` : '— kcal'}
              {targetKcal ? ` / cíl ${Math.round(targetKcal)}` : ''}
            </p>
            <p className="profile-today-macros">
              B {Math.round(dayNutrition.protein) || '—'} g · S {Math.round(dayNutrition.carbs) || '—'} g · T {Math.round(dayNutrition.fat) || '—'} g
            </p>
            <MacroRatioChart
              protein_g={dayNutrition.protein}
              carbs_g={dayNutrition.carbs}
              fat_g={dayNutrition.fat}
              calories={dayNutrition.kcal}
              compact
            />
            <button type="button" className="profile-today-cta" onClick={onScrollToMeals}>
              Zobrazit dnešní jídla
            </button>
          </article>
          <article className="profile-today-card">
            <h3>Trénink dnes</h3>
            {envPlain ? (
              <p className="profile-today-env-badge">{envPlain}</p>
            ) : null}
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
                <p className="profile-today-stat">Dnes nemáš naplánovaný trénink.</p>
                <button type="button" className="profile-today-cta" onClick={onScrollToWeek}>
                  Zobrazit týdenní trénink
                </button>
              </>
            )}
          </article>
        </div>
      </section>

      <section id="profile-today-meals" className="profile-today-section" aria-labelledby="profile-today-meals-heading">
        <h3 id="profile-today-meals-heading" className="profile-today-section-title">Dnešní jídla</h3>
        <ProfileDayMealsPanel
          meals={meals}
          structDay={structDay}
          planHtml={planHtml}
          dayName={todayDay.dayName || ''}
          dayIndexForKeys={todayDay.originalIndex ?? todayDayIndex}
          canPinMeals={canPinMeals}
          onRecipeClick={(mi) => onRecipeClick?.(mi)}
          onSwapClick={(mi) => onSwapClick?.(mi)}
          onPinClick={(mi) => onPinClick?.(mi)}
          isMealPinned={isMealPinned}
          pinToastByKey={pinToastByKey}
        />
        <button type="button" className="profile-today-link-btn" onClick={onScrollToWeek}>
          Celý týdenní jídelníček
        </button>
      </section>

      <section id="profile-today-workout" className="profile-today-section" aria-labelledby="profile-today-workout-heading">
        <h3 id="profile-today-workout-heading" className="profile-today-section-title">Dnešní trénink</h3>
        {envPlain ? (
          <p className="profile-today-workout-env">Typ: {envPlain}</p>
        ) : null}
        {hasWorkout ? (
          <>
            <p className="profile-today-workout-meta">
              {workout?.title ? `${workout.title} · ` : ''}
              {exercises.length} cviků · {workoutMinutes ? `~${workoutMinutes} min` : 'dle plánu'}
            </p>
            {!workoutCompleted && planId ? (
              <div className="profile-today-workout-actions">
                <button
                  type="button"
                  className="profile-today-change-workout-btn"
                  onClick={() => {
                    setWorkoutModalOpen(true);
                    trackWorkoutEvent('workout_change_opened');
                  }}
                >
                  Změnit dnešní trénink
                </button>
                {hasReplacementBackup ? (
                  <button
                    type="button"
                    className="profile-today-restore-btn"
                    disabled={restoreBusy}
                    aria-busy={restoreBusy}
                    onClick={handleRestoreOriginal}
                  >
                    {restoreBusy ? 'Obnovuji…' : 'Obnovit původní trénink'}
                  </button>
                ) : null}
              </div>
            ) : null}
            {restoreSlow ? (
              <p className="profile-today-workout-slow" role="status">
                Obnovení trvá déle než obvykle. Zkus to znovu.
              </p>
            ) : null}
            {workoutError ? <p className="profile-today-workout-error" role="alert">{workoutError}</p> : null}
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
          </>
        ) : (
          <div className="profile-today-rest">
            <p>Dnes nemáš naplánovaný trénink.</p>
            <button type="button" className="profile-today-link-btn" onClick={onScrollToWeek}>
              Zobrazit týdenní trénink
            </button>
          </div>
        )}
      </section>

      {planId && hasWorkout ? (
        <WorkoutChangeModal
          open={workoutModalOpen}
          onClose={() => setWorkoutModalOpen(false)}
          planId={planId}
          planDayIndex={planDayIdx}
          defaultLocation={defaultLoc}
          defaultDuration={workoutMinutes >= 45 ? 45 : workoutMinutes >= 30 ? 30 : 30}
          defaultIntensity="medium"
          onPlanUpdated={(data) => onWorkoutPlanUpdated?.(data)}
          onEvent={trackWorkoutEvent}
        />
      ) : null}

      <style jsx>{`
        .profile-today-root {
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          margin-bottom: 20px;
          overflow-x: hidden;
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
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .profile-today-card {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(124, 58, 237, 0.35);
          border-radius: 14px;
          padding: 16px;
          min-width: 0;
          max-width: 100%;
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
        .profile-today-stat--kcal {
          font-size: 17px;
          color: #f8fafc;
        }
        .profile-today-env-badge {
          display: inline-block;
          margin: 0 0 10px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          color: #e0f2fe;
          background: rgba(14, 165, 233, 0.2);
          border: 1px solid rgba(56, 189, 248, 0.35);
        }
        .profile-today-macros {
          margin: 0 0 12px;
          font-size: 13px;
          color: #94a3b8;
        }
        .profile-today-cta {
          width: 100%;
          min-height: 48px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #0ea5e9, #7c3aed);
          color: #fff;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          padding: 10px 14px;
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
          min-height: 48px;
        }
        .profile-today-workout-env {
          margin: 0 0 8px;
          font-size: 14px;
          font-weight: 700;
          color: #7dd3fc;
        }
        .profile-today-workout-meta {
          margin: 0 0 12px;
          font-size: 14px;
          color: #94a3b8;
        }
        .profile-today-workout-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }
        .profile-today-change-workout-btn,
        .profile-today-restore-btn {
          min-height: 44px;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .profile-today-change-workout-btn {
          border: 1px solid rgba(148, 163, 184, 0.45);
          background: transparent;
          color: #e2e8f0;
        }
        .profile-today-restore-btn {
          border: 1px solid rgba(56, 189, 248, 0.35);
          background: rgba(14, 165, 233, 0.1);
          color: #7dd3fc;
        }
        .profile-today-restore-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .profile-today-workout-error {
          margin: 0 0 10px;
          font-size: 0.88rem;
          color: #fca5a5;
        }
        .profile-today-workout-slow {
          margin: 0 0 8px;
          font-size: 0.86rem;
          color: #fbbf24;
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
        .profile-today-rest p {
          margin: 0 0 8px;
          color: #cbd5e1;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
