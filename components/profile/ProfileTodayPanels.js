import { useCallback, useRef, useState } from 'react';
import { resolveDayCalorieTarget, sumDayNutrition } from '../../lib/mealNutritionDisplay.js';
import MacroRatioChart from '../MacroRatioChart.js';
import { formatExerciseSetsRepsDisplay } from '../../lib/planDataIntegrity.js';
import ProfileDayMealsPanel from './ProfileDayMealsPanel.js';
import DailyAdherenceStatus from './DailyAdherenceStatus.js';
import WorkoutChangeModal from '../workout/WorkoutChangeModal.jsx';
import { HabitUiProgressBar } from '../habit/HabitUiPrimitives';
import { mealActivityKey } from '../../lib/dailyActivationClient.js';
import { useDailyActivation } from '../../hooks/useDailyActivation.js';
import WorkoutLogSection from './WorkoutLogSection';
import { getCanonicalExercise } from '../../lib/exerciseCanonicalMap';
import { HelpCircle } from 'lucide-react';
import { MAKRO, PANEL, STITEK, TLACITKO, podilyMaker } from '../../lib/profile/designTokens.js';
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
  onScrollToWeek,
  planId = null,
  onWorkoutPlanUpdated = null,
  trainingEnvironment = 'gym',
}) {
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  /** Zápis tréninku je sbalený, dokud si ho uživatel nevyžádá. */
  const [zapisOtevren, setZapisOtevren] = useState(false);
  const [workoutBusy, setWorkoutBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreSlow, setRestoreSlow] = useState(false);
  const [workoutError, setWorkoutError] = useState(null);
  const changeWorkoutBtnRef = useRef(null);
  const scrollLockYRef = useRef(null);

  const captureScrollForModal = useCallback(() => {
    scrollLockYRef.current = window.scrollY;
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
    if (!planId || restoreBusy) return;
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
      if (!res.ok) throw new Error(data.error || 'Nepodařilo se obnovit trénink.');
      onWorkoutPlanUpdated?.(data);
      trackWorkoutEvent('workout_original_restored');
    } catch (e) {
      if (e?.name === 'AbortError') {
        setWorkoutError('Obnovení trvá déle než obvykle. Zkus to znovu.');
      } else {
        setWorkoutError(e.message || 'Nepodařilo se obnovit trénink.');
      }
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      setRestoreBusy(false);
      setRestoreSlow(false);
    }
  };

  const planDayIdx = todayDay?.originalIndex ?? todayDayIndex;
  const structDayEarly = todayDay?.structDay || structuredPlan?.days?.[planDayIdx];
  const mealsEarly = Array.isArray(todayDay?.meals) ? todayDay.meals : [];
  const workoutEarly = structDayEarly?.workout;
  const hasWorkoutEarly = Array.isArray(workoutEarly?.exercises)
    && workoutEarly.exercises.some((ex) => String(ex?.canonical_key || '').toLowerCase() !== 'rest');

  const {
    errorMsg: activationError,
    doneCount,
    totalActivities,
    workoutCompleted,
    watchWorkoutDetected,
    workoutAutoFromMovement,
    manualWorkoutDone,
    adherence,
    adherenceLoading,
    isMealCompleted,
    isPending,
    toggleMeal,
    toggleWorkout,
  } = useDailyActivation({
    planId,
    planDay: Number.isFinite(planDayIdx) ? planDayIdx : 0,
    meals: mealsEarly,
    hasWorkout: hasWorkoutEarly,
  });

  if (!todayDay) return null;

  const structDay = structDayEarly;
  const meals = mealsEarly;
  const dayNutrition = sumDayNutrition(meals, structDay);
  /** Podíly maker za celý den — pro pruh nad seznamem jídel. */
  const podilyDne = podilyMaker({
    protein_g: dayNutrition?.protein,
    carbs_g: dayNutrition?.carbs,
    fat_g: dayNutrition?.fat,
  });
  const targets = planTargets || structuredPlan?.targets || {};
  const targetKcal = resolveDayCalorieTarget(structDay, targets);
  const envPlain = envLabelPlain(trainingEnvironmentLabel, structuredPlan);

  const workout = workoutEarly;
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises.filter((ex) => {
    const key = String(ex?.canonical_key || '').toLowerCase();
    return key !== 'rest';
  }) : [];
  const hasWorkout = exercises.length > 0;
  const workoutMinutes = Number(workout?.duration_minutes) || (exercises.length ? exercises.length * 8 : 0);
  const hasReplacementBackup = !!workout?.original_workout_backup;

  const defaultLoc = trainingEnvironment === 'gym'
    ? 'gym'
    : trainingEnvironment === 'home_bodyweight'
      ? 'outdoor'
      : 'home';
  const defaultEquip = trainingEnvironment === 'gym'
    ? 'full_gym'
    : trainingEnvironment === 'home_bodyweight'
      ? 'bodyweight'
      : 'basic';

  return (
    <div className="profile-today-root">
      <section className="profile-today-hero" aria-labelledby="profile-today-heading">
        <div className="profile-today-hero-top">
          <div>
            <p className="profile-today-date">{todayLabel}</p>
            <h2 id="profile-today-heading" className="profile-today-heading">Dnešní plán</h2>
            <p className="profile-today-lead">Tvůj dnešní plán je připravený.</p>
          </div>
          {totalActivities > 0 ? (
            <HabitUiProgressBar done={doneCount} total={totalActivities} />
          ) : null}
        </div>
        {activationError ? (
          <p className="profile-today-activation-error" role="alert">{activationError}</p>
        ) : null}
        <DailyAdherenceStatus adherence={adherence} loading={adherenceLoading} />
      </section>

      <section id="profile-today-meals" className="profile-today-section" aria-labelledby="profile-today-meals-heading">
        <h3 id="profile-today-meals-heading" className="m-0 mb-3 text-xs font-extrabold uppercase tracking-[0.06em] text-[#c4b5fd]">Dnešní jídla</h3>

        {/* DENNÍ SOUČET NAD SEZNAMEM, NE JAKO SAMOSTATNÁ KARTA.
            Do 20. 8. 2026 nad tímhle seznamem stály souhrnné karty „Jídlo dnes“
            a „Trénink dnes“ — ukazovaly totéž, co je hned pod nimi, jen zkráceně,
            a jejich tlačítka nic nerozbalovala, jen odscrollovala o dvě stě
            pixelů níž. Zůstala z nich jediná informace, kterou seznam sám nenese:
            kolik z denního cíle je pokryto. */}
        {dayNutrition.kcal != null || targetKcal ? (
          <div className={`${PANEL} mb-3.5 flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
            <div className="min-w-0">
              <div className="text-xs text-neutral-400">
                {meals.length} {meals.length === 1 ? 'jídlo' : meals.length >= 2 && meals.length <= 4 ? 'jídla' : 'jídel'} dnes
              </div>
              <div className="mt-0.5 text-lg font-bold text-white">
                {dayNutrition.kcal != null ? `${Math.round(dayNutrition.kcal)} kcal` : '— kcal'}
                {targetKcal ? (
                  <span className="text-sm font-medium text-neutral-400">{` / cíl ${Math.round(targetKcal)}`}</span>
                ) : null}
                {structDay?.calorie_under_target === true ? (
                  <span className="ml-2 text-xs font-semibold text-amber-300">zatím pod cílem</span>
                ) : null}
              </div>
            </div>

            {podilyDne ? (
              <div className="min-w-[180px] flex-1 space-y-1.5 sm:max-w-xs">
                <div className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full border border-neutral-800 bg-[#181c28] p-0.5">
                  <div style={{ width: `${podilyDne.bilkoviny}%` }} className={`h-full rounded-sm ${MAKRO.bilkoviny.trida}`} title={`Bílkoviny ${podilyDne.bilkoviny} %`} />
                  <div style={{ width: `${podilyDne.sacharidy}%` }} className={`h-full rounded-sm ${MAKRO.sacharidy.trida}`} title={`Sacharidy ${podilyDne.sacharidy} %`} />
                  <div style={{ width: `${podilyDne.tuky}%` }} className={`h-full rounded-sm ${MAKRO.tuky.trida}`} title={`Tuky ${podilyDne.tuky} %`} />
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-neutral-300">
                  <span>B {Math.round(dayNutrition.protein) || '—'} g</span>
                  <span>S {Math.round(dayNutrition.carbs) || '—'} g</span>
                  <span>T {Math.round(dayNutrition.fat) || '—'} g</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

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
          showMealCompletion
          isMealCompleted={(meal, mi) => isMealCompleted(meal, mi)}
          isMealCompletionPending={(meal, mi) => isPending('meal', mealActivityKey(meal, mi))}
          onMealCompleteToggle={(meal, mi) => toggleMeal(meal, mi)}
        />
        <button type="button" className="profile-today-link-btn" onClick={onScrollToWeek}>
          Celý týdenní jídelníček
        </button>
      </section>

      <section id="profile-today-workout" className="profile-today-section" aria-labelledby="profile-today-workout-heading">
        <h3 id="profile-today-workout-heading" className="m-0 mb-3 text-xs font-extrabold uppercase tracking-[0.06em] text-[#c4b5fd]">Dnešní trénink</h3>
        {hasWorkout ? (
          <>
            {/* Prostředí, počet cviků a odhad délky v jednom podtitulku.
                Dřív to byly dva řádky nad sebou plus totéž ještě jednou
                v souhrnné kartě „Trénink dnes“ — ta je zrušená, tohle zbylo. */}
            <p className="m-0 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
              {envPlain ? (
                <span className={`${STITEK} bg-[#00f2fe]/15 text-[#7dd3fc]`}>{envPlain}</span>
              ) : null}
              {workout?.title ? <span className="font-semibold text-neutral-200">{workout.title}</span> : null}
              <span>{exercises.length} cviků</span>
              <span aria-hidden>·</span>
              <span>{workoutMinutes ? `~${workoutMinutes} min` : 'dle plánu'}</span>
            </p>
            {planId ? (
              <div className="profile-today-workout-actions">
                <button
                  type="button"
                  className="profile-today-change-workout-btn"
                  ref={changeWorkoutBtnRef}
                  onMouseDown={captureScrollForModal}
                  onPointerDown={captureScrollForModal}
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
            {workoutCompleted && !manualWorkoutDone ? (
              <p className="profile-today-workout-done" role="status">
                {watchWorkoutDetected
                  ? '✓ Trénink splněn (Apple Watch)'
                  : workoutAutoFromMovement
                    ? '✓ Trénink splněn (pohyb z hodinek)'
                    : '✓ Trénink splněn'}
              </p>
            ) : (
              <label className={`profile-today-workout-check${manualWorkoutDone ? ' profile-today-workout-check--done' : ''}`}>
                <input
                  type="checkbox"
                  checked={manualWorkoutDone}
                  disabled={isPending('workout', 'plan_day')}
                  onChange={() => toggleWorkout()}
                  aria-label={manualWorkoutDone ? 'Označit trénink jako nedokončený' : 'Označit trénink jako dokončený'}
                />
                <span>
                  {isPending('workout', 'plan_day')
                    ? 'Ukládám…'
                    : 'Dokončil/a jsem dnešní trénink'}
                </span>
              </label>
            )}
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 min-[880px]:grid-cols-2">
              {exercises.map((ex, xi) => {
                // Název z kanonického registru — stejný zdroj jako zápis
                // tréninku. Plán si nesl vlastní „Bench press“, zápis ukazoval
                // „Tlak na lavici“ a byl to týž cvik.
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
            {/* ZÁPIS PATŘÍ POD CVIKY, KTERÉ POPISUJE — A AŽ NA VYŽÁDÁNÍ.
                Do 18. 8. 2026 se vykresloval úplně nahoře v profilu, odtržený
                od „Dnešního tréninku“ — uživatel viděl tytéž cviky dvakrát,
                pokaždé pod jiným názvem a v jiném pořadí. Pořadí se komponentě
                předává z plánu, názvy si obě strany berou z kanonického registru.

                Sbalený stav NEVYKRESLUJE nic: formulář na sérii ke každému cviku
                je dlouhý a hned po přihlášení překrýval samotný plán. Kdo si
                trénink zapsat chce, klikne. Podmíněný render, ne CSS `display`
                — jinak by se komponenta i tak namontovala a natáhla data. */}
            {zapisOtevren ? (
              <WorkoutLogSection poradiCviku={exercises.map((ex) => ex.canonical_key)} />
            ) : null}
            <button
              type="button"
              className={`${TLACITKO} mt-3.5 min-h-[46px] w-full border-dashed border-[#00f2fe]/40 text-[#baf6ff] hover:border-solid`}
              onClick={() => setZapisOtevren((v) => !v)}
              aria-expanded={zapisOtevren}
              aria-controls="zapis-treninku"
            >
              {zapisOtevren ? 'Skrýt zápis tréninku' : 'Zapsat trénink'}
            </button>
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
          defaultEquipment={defaultEquip}
          defaultDuration={workoutMinutes >= 45 ? 45 : workoutMinutes >= 30 ? 30 : 30}
          defaultIntensity="medium"
          onPlanUpdated={(data) => onWorkoutPlanUpdated?.(data)}
          onEvent={trackWorkoutEvent}
          returnFocusRef={changeWorkoutBtnRef}
          scrollLockYRef={scrollLockYRef}
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
        .profile-today-hero-top {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 8px;
        }
        .profile-today-activation-error {
          margin: 0 0 12px;
          font-size: 0.875rem;
          color: #fca5a5;
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
        @media (min-width: 720px) {
        }
        .profile-today-section {
          margin-bottom: 24px;
        }
        /* ── DNEŠNÍ TRÉNINK ──────────────────────────────────────────────────
           Stejný vizuál jako „Trénink tento den“ v týdenním přehledu
           (ProfileDayMealsPanel). Obě místa vykreslují tentýž seznam cviků;
           když se styloval jen jeden, aplikace měla dvě různé podoby téhož. */
        
        @media (min-width: 880px) {
          
        }
        
        
        
        
        
        /* Sbalený zápis tréninku: vypadá jako akce, ne jako nadpis sekce. */
        

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
        .profile-today-workout-check {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 14px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(15, 23, 42, 0.55);
          font-size: 0.95rem;
          font-weight: 600;
          color: #e2e8f0;
          cursor: pointer;
          user-select: none;
        }
        .profile-today-workout-done {
          margin: 0 0 14px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(34, 197, 94, 0.35);
          background: rgba(22, 101, 52, 0.12);
          font-size: 0.95rem;
          font-weight: 600;
          color: #86efac;
        }
        .profile-today-workout-check--done {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(22, 101, 52, 0.14);
          color: #86efac;
        }
        .profile-today-workout-check input {
          width: 18px;
          height: 18px;
          accent-color: #22c55e;
          cursor: pointer;
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
