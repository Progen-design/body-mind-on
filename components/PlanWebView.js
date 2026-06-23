import Head from 'next/head';
import styles from '../styles/plan-view.module.css';
import { toCzechVocative } from '../lib/utils/czechVocative.js';
import { formatDayDateWords, formatDayDateNumeric, dayOrdinalCs } from '../lib/utils/czechDateWords.js';
import { mealDisplayTitleForStructuredMeal } from '../lib/mealDisplayNameHelpers.js';
import { addCalendarDaysIsoPrague } from '../lib/czechCalendar.js';
import { formatExerciseSetsRepsDisplay } from '../lib/planDataIntegrity.js';
import { getMealNutritionDisplay, sumMealCalories } from '../lib/mealNutritionDisplay.js';
import { getMealRecipeUrl } from '../lib/mealRecipeDisplay.js';

const MEAL_TIME_META = {
  breakfast: { icon: '☀', label: 'Snídaně', time_word: 'Ráno', time: '07:30', color: '#22D3EE' },
  lunch: { icon: '◐', label: 'Oběd', time_word: 'Poledne', time: '13:00', color: '#0EA5E9' },
  dinner: { icon: '☾', label: 'Večeře', time_word: 'Večer', time: '19:00', color: '#A78BFA' },
  snack: { icon: '◇', label: 'Svačina', time_word: 'Odpoledne', time: '16:00', color: '#22D3EE' },
};

const GOAL_TEXT_CS = {
  redukce: 'Hubnutí',
  weight_loss: 'Hubnutí',
  nabirani_svaly: 'Nabírání svalů',
  muscle_gain: 'Nabírání svalů',
  udrzovani: 'Udržování',
  maintenance: 'Udržování',
  endurance: 'Vytrvalost',
};
function goalKey(goal) {
  const raw = String(goal || '').toLowerCase();
  if (raw === 'redukce' || raw === 'weight_loss') return 'weight_loss';
  if (raw === 'nabirani_svaly' || raw === 'muscle_gain') return 'muscle_gain';
  if (raw === 'endurance') return 'endurance';
  if (raw === 'udrzovani' || raw === 'maintenance') return 'maintenance';
  return 'muscle_gain';
}
function goalText(goal) { return GOAL_TEXT_CS[goalKey(goal)] || 'Nabírání svalů'; }

function isoWeekNumber(isoDateYmd) {
  const iso = String(isoDateYmd || '').replace(/T.*/, '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function mealMacros(meal) {
  return getMealNutritionDisplay(meal);
}
function fmtKcal(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const v = Math.round(Number(value));
  return v.toLocaleString('cs-CZ').replace(/\s/g, '\u00A0');
}

function splitMottoIntoLines(text) {
  const safe = String(text || '').trim();
  if (!safe) return { line1: '', line2: '' };
  const periodIdx = safe.indexOf('.');
  if (periodIdx > 0 && periodIdx < safe.length - 1) {
    return { line1: safe.slice(0, periodIdx + 1), line2: safe.slice(periodIdx + 1).trim() };
  }
  return { line1: safe, line2: '' };
}

const HABIT_ACCENTS = ['#0EA5E9', '#A78BFA', '#22D3EE'];
const PROFILE_ACCENTS = ['#0EA5E9', '#A78BFA', '#22D3EE'];
const STAT_ACCENTS = ['#0EA5E9', '#A78BFA', '#22D3EE'];

function workoutBorderColor(intensity) {
  if (intensity === 'hard') return '#EF4444';
  if (intensity === 'easy') return '#10B981';
  if (intensity === 'rest') return '#0EA5E9';
  return '#A78BFA';
}
function workoutBorderRgba(intensity) {
  if (intensity === 'hard') return 'rgba(239,68,68,0.22)';
  if (intensity === 'easy') return 'rgba(16,185,129,0.22)';
  if (intensity === 'rest') return 'rgba(14,165,233,0.22)';
  return 'rgba(167,139,250,0.22)';
}
function inferIntensity(workout, day) {
  const raw = String(workout?.intensity || day?.workout_intensity || '').toLowerCase();
  if (['easy', 'medium', 'hard', 'rest'].includes(raw)) return raw;
  return 'medium';
}

function extractHabits(planJson) {
  const candidates = [planJson?.habits, planJson?.mindset_week, planJson?.mindset];
  for (const item of candidates) {
    if (Array.isArray(item) && item.length) {
      return item.map((row) => {
        if (typeof row === 'string') return { title: row, description: '' };
        if (row && typeof row === 'object') {
          return {
            title: String(row.title || row.text || row.name || '').trim(),
            description: String(row.description || row.detail || row.text_long || '').trim(),
          };
        }
        return null;
      }).filter((r) => r && r.title).slice(0, 3);
    }
  }
  return [
    { title: 'Drž se plánu.', description: 'Když nebudeš vědět, co dělat, podívej se sem. Cokoliv je tady, je správně.' },
    { title: 'Odpočívej mezi tréninky.', description: 'Svaly nerostou v posilovně. Rostou, když spíš. Dej tělu prostor.' },
    { title: 'Dodržuj pitný režim.', description: 'Tři litry vody. Bez kompromisu. Tělo to potřebuje.' },
  ];
}

function MealCard({ meal, day, planJson, appBaseUrl }) {
  const type = meal?.type ?? 'breakfast';
  const meta = MEAL_TIME_META[type] || MEAL_TIME_META.breakfast;
  const dayName = day?.day_name ?? day?.date ?? 'Den';
  const title = mealDisplayTitleForStructuredMeal(meal, planJson?.html || '', dayName);
  const macros = mealMacros(meal);
  const url = getMealRecipeUrl(meal, appBaseUrl);
  const accentVars = { '--accent': meta.color };
  return (
    <div className={styles.mealCard} style={accentVars}>
      <div className={styles.mealHeaderRow}>
        <span className={styles.mealTime}>{meta.icon}&nbsp;{meta.time_word} · {meta.time}</span>
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className={styles.recipeBtn}>Recept →</a> : null}
      </div>
      <h4 className={styles.mealName}>{title || meta.label}</h4>
      <div className={styles.mealMacros}>
        {macros.protein_g != null ? <span><strong style={{ color: '#0EA5E9' }}>{macros.protein_g} g</strong> bílkovin</span> : <span style={{ color: '#475569' }}>—</span>}
        {' · '}
        {macros.carbs_g != null ? <span><strong style={{ color: '#22D3EE' }}>{macros.carbs_g} g</strong> sacharidů</span> : <span style={{ color: '#475569' }}>—</span>}
        {' · '}
        {macros.fat_g != null ? <span><strong style={{ color: '#A78BFA' }}>{macros.fat_g} g</strong> tuků</span> : <span style={{ color: '#475569' }}>—</span>}
      </div>
    </div>
  );
}

function DailyTotalPill({ day }) {
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  const total = sumMealCalories(meals);
  const kcalDisplay = total != null && total > 0 ? fmtKcal(total) : '—';
  return (
    <div className={styles.dailyPill}>
      <span className={styles.dailyPillLabel}>Celkem za den</span>
      <span>
        <span className={styles.dailyPillValue}>{kcalDisplay}</span>{' '}
        <span className={styles.dailyPillUnit}>kcal</span>
      </span>
    </div>
  );
}

function WorkoutBlock({ day, coachVoice }) {
  const workout = day?.workout || {};
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : Array.isArray(day?.exercises) ? day.exercises : [];
  if (!exercises.length) {
    return (
      <div className={styles.workoutBlock} style={{ '--workout-color': '#0EA5E9', '--workout-rgba': 'rgba(14,165,233,0.22)' }}>
        <div className={styles.workoutLabel}>▲ Pohyb</div>
        <h5 className={styles.workoutTitle}>{coachVoice?.workout_intros?.rest || 'Pohyb. Dnes odpočinek. Tělo to potřebuje.'}</h5>
        <p className={styles.workoutDesc}>{coachVoice?.workout_descriptions?.rest || 'Aktivní regenerace. Procházka, strečink, pomalý nádech.'}</p>
      </div>
    );
  }
  const intensity = inferIntensity(workout, day);
  const color = workoutBorderColor(intensity);
  const rgba = workoutBorderRgba(intensity);
  const intro = coachVoice?.workout_intros?.[intensity] || 'Krátký. Poctivý.';
  const desc = coachVoice?.workout_descriptions?.[intensity] || '30 minut. Žádné výmluvy.';
  return (
    <div className={styles.workoutBlock} style={{ '--workout-color': color, '--workout-rgba': rgba }}>
      <div className={styles.workoutLabel}>▲ Pohyb</div>
      <h5 className={styles.workoutTitle}>{intro}</h5>
      <p className={styles.workoutDesc}>{desc}</p>
      <p className={styles.workoutDesc} style={{ marginTop: 10 }}>
        {exercises.slice(0, 8).map((ex, i) => {
          const name = String(ex?.name || ex?.exercise_name || ex?.display_name_cs || 'Cvik');
          const repsUnit = formatExerciseSetsRepsDisplay(ex, { nbsp: true });
          return (
            <span key={i}>
              {i > 0 ? ' · ' : ''}{name} <strong>{repsUnit}</strong>
            </span>
          );
        })}
      </p>
    </div>
  );
}

function dayIso(day, index, validFrom) {
  const raw = typeof day?.date === 'string' ? day.date.replace(/T.*/, '').slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(validFrom || '')) return addCalendarDaysIsoPrague(validFrom, index);
  return '';
}

function DayCard({ day, index, planJson, appBaseUrl, coachVoice, validFrom }) {
  const dayName = day?.day_name || `Den ${index + 1}`;
  const iso = dayIso(day, index, validFrom);
  const dateWords = formatDayDateWords(iso);
  const yearStr = iso ? iso.slice(0, 4) : '';
  const fullDate = dateWords && yearStr
    ? `${dateWords.charAt(0).toUpperCase()}${dateWords.slice(1)} ${yearStr}`
    : (formatDayDateNumeric(iso) || '');
  const ordinal = `Den ${String(index + 1).padStart(2, '0')} · ${dayOrdinalCs(index + 1)}`;
  const meals = Array.isArray(day?.meals) ? day.meals : [];

  return (
    <div className={`${styles.dayCard} ${styles.dayCardFull}`}>
      <div className={styles.dayHeader}>
        <div className={styles.dayHeaderOrdinal}>{ordinal}</div>
        <h3 className={styles.dayHeaderName}>{dayName}</h3>
        <div className={styles.dayHeaderDate}>{fullDate}</div>
      </div>
      <div className={styles.dayBody}>
        {meals.map((meal, idx) => (
          <MealCard key={idx} meal={meal} day={day} planJson={planJson} appBaseUrl={appBaseUrl} />
        ))}
        <DailyTotalPill day={day} />
        <WorkoutBlock day={day} coachVoice={coachVoice} />
      </div>
    </div>
  );
}

export default function PlanWebView({ planJson, bodyMetrics, firstName, validFrom, appBaseUrl, coachVoice, planId }) {
  const days = Array.isArray(planJson?.days) ? planJson.days : [];
  const targets = planJson?.targets ?? {};
  const bm = bodyMetrics || {};
  const safeAppBase = String(appBaseUrl || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
  const ctaUrl = `${safeAppBase}/profil`;

  const rawFirst = String(firstName || bm?.name || '').trim().split(/\s+/)[0] || '';
  const vocName = rawFirst ? toCzechVocative(rawFirst) : 'ty';
  const validFromIso = String(validFrom || planJson?.valid_from || '').replace(/T.*/, '').slice(0, 10);
  const yearStr = validFromIso ? validFromIso.slice(0, 4) : String(new Date().getFullYear());
  const weekNumber = isoWeekNumber(validFromIso) ?? 1;
  const weekLabel = `Týden ${weekNumber} · ${yearStr}`;

  const goal = bm?.goal || planJson?.goal;
  const targetKcal = Math.round(Number(targets.calories_per_day) || 0) || null;

  const mottoList = Array.isArray(coachVoice?.weekly_mottos) ? coachVoice.weekly_mottos : [];
  const mottoIdx = mottoList.length ? ((weekNumber % mottoList.length) + mottoList.length) % mottoList.length : 0;
  const mottoText = mottoList[mottoIdx]?.text || 'Nemusíš to mít rád. Stačí, že to děláš.';
  const mottoLines = splitMottoIntoLines(mottoText);
  const coachIntro = coachVoice?.coach_intros?.[goalKey(goal)] || coachVoice?.coach_intros?.muscle_gain || 'Plán je postavený přesně na tobě. Drž se ho a uvidíš změnu.';
  const macroCommentary = coachVoice?.macro_commentary?.[goalKey(goal)] || coachVoice?.macro_commentary?.muscle_gain || {};
  const kcalLeadIn = (coachVoice?.kcal_leadins || coachVoice?.kcal_lead_in || {})[goalKey(goal)]
    || coachVoice?.kcal_leadins?.muscle_gain || 'Trochu nad udržovací hodnotou.';

  const habits = extractHabits(planJson);
  const mealsCount = days.reduce((sum, day) => sum + (Array.isArray(day?.meals) ? day.meals.length : 0), 0);
  const workoutsCount = (() => {
    if (Number.isFinite(Number(planJson?.workouts_per_week))) return Number(planJson.workouts_per_week);
    let c = 0;
    for (const d of days) {
      const ex = Array.isArray(d?.workout?.exercises) ? d.workout.exercises : Array.isArray(d?.exercises) ? d.exercises : [];
      if (ex.length) c += 1;
    }
    return c;
  })();

  const macros = [
    { label: 'Bílkoviny', value: targets.protein_g, comment: macroCommentary.protein || '', color: '#0EA5E9' },
    { label: 'Sacharidy', value: targets.carbs_g, comment: macroCommentary.carbs || '', color: '#22D3EE' },
    { label: 'Tuky', value: targets.fat_g, comment: macroCommentary.fat || '', color: '#A78BFA' },
  ];

  return (
    <>
      <Head>
        <title>{`Tvůj týden · ${vocName ? vocName.charAt(0).toUpperCase() + vocName.slice(1) : 'Body & Mind ON'}`}</title>
        <meta name="theme-color" content="#0A1018" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className={styles.page}>
        <div className={styles.hairline}>
          <span /><span /><span />
        </div>

        <nav className={styles.nav}>
          <div className={styles.navInner}>
            <a className={styles.brand} href={safeAppBase}>BODY &amp; MIND ON</a>
            <span className={styles.weekBadge}>{weekLabel}</span>
          </div>
        </nav>

        <main className={styles.container}>
          {/* HERO */}
          <section className={styles.hero}>
            <p className={styles.heroGreet}>Ahoj</p>
            <h1 className={styles.heroName}>{vocName.charAt(0).toUpperCase() + vocName.slice(1)},</h1>
            <p className={styles.heroTagline}>Tvůj týden je tady.</p>
            <p className={`${styles.heroTagline} ${styles.heroTaglineAccent}`}>Sedm dní. Začínáme.</p>
            <p className={styles.heroSub}>{coachIntro}</p>
            <div className={styles.heroStats}>
              <div className={styles.statTile} style={{ '--accent': STAT_ACCENTS[0] }}>
                <div className={styles.statNum}>{days.length || 7}</div>
                <div className={styles.statLabel}>dní</div>
              </div>
              <div className={styles.statTile} style={{ '--accent': STAT_ACCENTS[1] }}>
                <div className={styles.statNum}>{mealsCount || (days.length * 3) || 21}</div>
                <div className={styles.statLabel}>jídel</div>
              </div>
              <div className={styles.statTile} style={{ '--accent': STAT_ACCENTS[2] }}>
                <div className={styles.statNum}>{workoutsCount}</div>
                <div className={styles.statLabel}>tréninky</div>
              </div>
            </div>
            <a className={styles.ctaBtn} href={ctaUrl} target="_blank" rel="noopener noreferrer">Otevřít aplikaci →</a>
          </section>

          {/* PROFIL + MOTTO */}
          <section className={styles.twoCol}>
            <div className={styles.card}>
              <span className={styles.cardBadge}>01 · Profil</span>
              <h2 className={styles.sectionTitle}>Začneme u tebe.</h2>
              <p className={styles.sectionSub}>Údaje a denní makra, podle kterých jsme plán postavili.</p>
              <div className={styles.profileTiles}>
                <div className={styles.profileTile} style={{ '--accent': PROFILE_ACCENTS[0] }}>
                  <div className={styles.tileLabel}>Výška</div>
                  <div className={styles.tileValue}>{bm?.height_cm ?? '—'}<span className={styles.tileUnit}>{' cm'}</span></div>
                </div>
                <div className={styles.profileTile} style={{ '--accent': PROFILE_ACCENTS[1] }}>
                  <div className={styles.tileLabel}>Váha</div>
                  <div className={styles.tileValue}>{bm?.weight_kg ?? '—'}<span className={styles.tileUnit}>{' kg'}</span></div>
                </div>
                <div className={styles.profileTile} style={{ '--accent': PROFILE_ACCENTS[2] }}>
                  <div className={styles.tileLabel}>Cíl</div>
                  <div className={styles.tileValue} style={{ fontSize: '15px' }}>{goalText(goal)}</div>
                </div>
              </div>
              <div className={styles.kcalBlock}>
                <div className={styles.kcalLabel}>Kalorie / den</div>
                <div className={styles.kcalValue}>
                  <span className="num">{targetKcal != null ? fmtKcal(targetKcal) : '—'}</span>
                  <span className="unit">kcal</span>
                </div>
                <p className={styles.kcalNote}>{kcalLeadIn}</p>
              </div>
              {macros.map((m, i) => (
                <div key={i} className={styles.macroRow} style={{ '--accent': m.color }}>
                  <div>
                    <div className={styles.macroLabel}>{m.label}</div>
                    <div className={styles.macroValue}>
                      {m.value != null && Number.isFinite(Number(m.value)) ? Math.round(Number(m.value)) : '—'}
                      <span className="unit">{' g'}</span>
                    </div>
                  </div>
                  <div className={styles.macroComment}>{m.comment}</div>
                </div>
              ))}
            </div>

            <div className={styles.motto}>
              <div className={styles.mottoLabel}>Pravidlo týdne</div>
              <p className={styles.mottoQuote}>
                {'\u201E'}{mottoLines.line1}
                {mottoLines.line2 ? <><br />{mottoLines.line2}</> : null}
                {'\u201C'}
              </p>
              <p className={styles.mottoAuthor}>— Tvůj kouč</p>
            </div>
          </section>

          {/* PRAVIDLA */}
          <section className={styles.habits}>
            <div className={styles.card}>
              <span className={`${styles.cardBadge} ${styles.cardBadgeLavender}`}>02 · Pravidla</span>
              <h2 className={styles.sectionTitle}>Tři věci, na kterých záleží.</h2>
              <p className={styles.sectionSub}>Žádné drama. Konzistence rozhoduje o výsledku.</p>
              <div className={styles.habitGrid}>
                {habits.map((h, i) => (
                  <div key={i} className={styles.habit}>
                    <div className={styles.habitNum} style={{ backgroundColor: HABIT_ACCENTS[i % HABIT_ACCENTS.length] }}>{String(i + 1).padStart(2, '0')}</div>
                    <div>
                      <h4 className={styles.habitTitle}>{h.title}</h4>
                      {h.description ? <p className={styles.habitDesc}>{h.description}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* DNÍ */}
          <section className={styles.daysSection}>
            <div className={styles.card} style={{ marginBottom: 20 }}>
              <span className={`${styles.cardBadge} ${styles.cardBadgeCyan}`}>03 · Tvojich 7 dní</span>
              <h2 className={styles.sectionTitle}>Den po dni, bez spěchu.</h2>
              <p className={styles.sectionSub}>Každý den máš plně rozepsaná jídla, součet kalorií a trénink.</p>
            </div>
            <div className={styles.daysGrid}>
              {days.map((day, idx) => (
                <DayCard
                  key={idx}
                  day={day}
                  index={idx}
                  planJson={planJson}
                  appBaseUrl={safeAppBase}
                  coachVoice={coachVoice}
                  validFrom={validFromIso}
                />
              ))}
            </div>
          </section>

          {/* SIGNATURE */}
          <section className={styles.signature}>
            <div className={styles.signatureBar} />
            <div>
              <p className={styles.signatureBody}>{coachVoice?.coach_signature?.body || 'Drž se. Když budeš mít otázky, napiš mi. Vidíme se za týden.'}</p>
              <p className={styles.signatureName}>{coachVoice?.coach_signature?.name || '— Tvůj kouč'}</p>
            </div>
          </section>

          {/* FINAL CTA */}
          <section className={styles.finalCta}>
            <div className={styles.finalCtaLabel}>▲ Připravený</div>
            <h2 className={styles.finalCtaTitle}>Tak co, pustíme se do toho?</h2>
            <a className={styles.finalCtaBtn} href={ctaUrl} target="_blank" rel="noopener noreferrer">Otevřít v aplikaci →</a>
          </section>
        </main>

        <footer className={styles.footer}>
          <div className={styles.footerBrand}>● BODY &amp; MIND ON</div>
          <p className={styles.footerLinks}>
            <a href="https://bodyandmindon.cz" target="_blank" rel="noopener noreferrer">bodyandmindon.cz</a>
            {' · '}
            <a href="mailto:info@bodyandmindon.cz">info@bodyandmindon.cz</a>
          </p>
          <p className={styles.footerNote}>Tvůj plán {planId ? `· ID ${String(planId).slice(0, 8)}…` : ''}</p>
        </footer>
      </div>
    </>
  );
}
