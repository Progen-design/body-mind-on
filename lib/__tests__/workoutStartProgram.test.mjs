/**
 * START PROGRAM — OPAKOVANÝ FULL-BODY A/B S PROGRESÍ.
 *
 * PROČ TENHLE TEST EXISTUJE
 * Změřeno na produkčním plánu c0c89c40 (START, 3× týdně): 15 cviků, 15 různých,
 * ani jeden se neopakoval. Den 3 byl core + hýždě + stehna + hrudník + hrudník.
 * Začátečník se za takový týden nenaučí techniku a nemá jak sledovat progres.
 *
 * Pestrost vyráběla čtyři místa (rotace šablon, `diversified_days`,
 * `usedAcrossWeek` v `deduplicateExercisesAcrossWeek` a dopisování dnů
 * v `enforceWorkoutsPerWeekInPlan`). Testuje se proto VÝSLEDEK — že se cviky
 * opakují a progrese se odvozuje — ne že se zavolala nějaká funkce.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStartWorkoutDays,
  applyStartProgression,
  startVariantForSession,
  startProgramWeekIndex,
  startProgramEnvironment,
  START_PROGRAM_VARIANTS,
} from '../workoutStartProgram.js';
import {
  nextPrescription,
  prescriptionMet,
  progressionRuleFor,
  PROGRESSION_BY_EXERCISE,
} from '../workoutProgression.js';
import { resolveProgramTier, usesStartStrengthProgram, PROGRAM_TIERS } from '../programTier.js';
import { adaptExerciseForTrainingEnvironment } from '../trainingEnvironment.js';
import { pickPreviousPerExercise } from '../workoutProgressionStore.js';

const GYM = { user_id: 'u1', program: 'START', training_environment: 'gym', workouts_per_week: 3 };
const HOME_BW = { user_id: 'u2', program: 'START', training_environment: 'home_bodyweight', workouts_per_week: 3 };
const HOME_EQ = {
  user_id: 'u3', program: 'START', training_environment: 'home_equipment',
  available_equipment: ['dumbbells', 'bench'], workouts_per_week: 3,
};

/** Postaví týden a dopočítá progresi — tak, jak to dělá orchestrátor. */
function tyden(bodyMetrics, weekIndex = 0, lastByKey = new Map(), days = [1, 3, 5]) {
  const built = buildStartWorkoutDays({ bodyMetrics, workoutDays: days, weekIndex });
  const prescriptions = applyStartProgression(built.days, lastByKey);
  return { ...built, prescriptions };
}

test('týden má jen dva různé tréninky, ne tři', () => {
  // Tohle je celé zadání: A-B-A, ne tři různé dny.
  for (const bm of [GYM, HOME_BW, HOME_EQ]) {
    const { days } = tyden(bm);
    const varianty = days.map((d) => d.start_program_variant);
    assert.deepEqual(varianty, ['A', 'B', 'A'], `${bm.training_environment}: čekáno A-B-A`);

    const podpisy = new Set(days.map((d) => d.exercises.map((e) => e.canonical_key).join('|')));
    assert.equal(podpisy.size, 2, `${bm.training_environment}: musí být 2 různé tréninky, je ${podpisy.size}`);

    // Den 1 a den 3 jsou TÝŽ trénink — přesně to, co dedupe dřív znemožňoval.
    assert.deepEqual(
      days[0].exercises.map((e) => e.canonical_key),
      days[2].exercises.map((e) => e.canonical_key),
      'první a třetí trénink v týdnu musí být stejný'
    );
  }
});

test('další týden se pořadí obrátí na B-A-B', () => {
  const t0 = tyden(GYM, 0).days.map((d) => d.start_program_variant);
  const t1 = tyden(GYM, 1).days.map((d) => d.start_program_variant);
  assert.deepEqual(t0, ['A', 'B', 'A']);
  assert.deepEqual(t1, ['B', 'A', 'B']);

  // Ale CVIKY jsou pořád tytéž dvě sady — mění se jen který den.
  const keys = (plan) => new Set(plan.flatMap((d) => d.exercises.map((e) => e.canonical_key)));
  assert.deepEqual([...keys(tyden(GYM, 0).days)].sort(), [...keys(tyden(GYM, 1).days)].sort());
});

test('cviky se v týdnu OPAKUJÍ — 5 cviků, ne 15 různých', () => {
  const { days } = tyden(GYM);
  const vsechny = days.flatMap((d) => d.exercises.map((e) => e.canonical_key));
  assert.equal(vsechny.length, 15, '3 tréninky × 5 cviků');

  const unikatni = new Set(vsechny);
  assert.equal(unikatni.size, 10, `A(5) + B(5) = 10 unikátních, ne ${unikatni.size}`);

  // Původní stav: 15 z 15. Tenhle test by na něm spadl.
  assert.ok(unikatni.size < vsechny.length, 'aspoň jeden cvik se musí opakovat');
});

test('každý trénink má 5 cviků a pokrývá vzory, ne partie', () => {
  for (const [env, varianty] of Object.entries(START_PROGRAM_VARIANTS)) {
    for (const [nazev, cviky] of Object.entries(varianty)) {
      assert.equal(cviky.length, 5, `${env}/${nazev}: čekáno 5 cviků`);
      // Každý trénink má core.
      const maCore = cviky.some((c) => ['plank', 'plank_side', 'dead_bug', 'russian_twist'].includes(c.canonical_key));
      assert.ok(maCore, `${env}/${nazev}: chybí core`);
      // Žádný cvik dvakrát v jednom tréninku.
      const keys = cviky.map((c) => c.canonical_key);
      assert.equal(new Set(keys).size, keys.length, `${env}/${nazev}: cvik dvakrát v jednom tréninku`);
    }
  }
});

test('všechny cviky mají pravidlo progrese', () => {
  // Cvik bez pravidla by se tiše choval jako vlastní váha a nikdy nepřidal váhu.
  for (const [env, varianty] of Object.entries(START_PROGRAM_VARIANTS)) {
    for (const [nazev, cviky] of Object.entries(varianty)) {
      for (const c of cviky) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(PROGRESSION_BY_EXERCISE, c.canonical_key),
          `${env}/${nazev}: ${c.canonical_key} nemá pravidlo v PROGRESSION_BY_EXERCISE`
        );
      }
    }
  }
});

test('prostředí se respektuje — doma se necvičí na kladce', () => {
  assert.equal(startProgramEnvironment(GYM), 'gym');
  assert.equal(startProgramEnvironment(HOME_EQ), 'home_equipment');
  assert.equal(startProgramEnvironment(HOME_BW), 'home_bodyweight');

  // „Doma s vybavením“ bez jakéhokoli náčiní je doma s vlastní váhou.
  assert.equal(
    startProgramEnvironment({ training_environment: 'home_equipment', available_equipment: [] }),
    'home_bodyweight'
  );

  const gymOnly = new Set(['leg_press', 'lat_pulldown', 'chest_press', 'hamstring_curl']);
  for (const bm of [HOME_BW, HOME_EQ]) {
    const keys = tyden(bm).days.flatMap((d) => d.exercises.map((e) => e.canonical_key));
    for (const k of keys) {
      assert.ok(!gymOnly.has(k), `${bm.training_environment}: ${k} patří jen do posilovny`);
    }
  }
});

test('shyby bez hrazdy se nepředepíšou', () => {
  const sHrazdou = tyden({ ...HOME_EQ, available_equipment: ['dumbbells', 'pullup_bar'] });
  const bezHrazdy = tyden({ ...HOME_EQ, available_equipment: ['dumbbells'] });

  const maPullUp = (plan) => plan.days.some((d) => d.exercises.some((e) => e.canonical_key === 'pull_up'));
  assert.equal(maPullUp(sHrazdou), true, 's hrazdou se shyby předepsat mají');
  assert.equal(maPullUp(bezHrazdy), false, 'bez hrazdy nesmí projít shyby');
});

test('žádný cvik neprojde filtrem prostředí jako jiný cvik', () => {
  // Tohle je ta chyba, kterou unit testy nechytily a produkce ano (plán
  // ee814006): `lunges` jsou v GYM_FORBIDDEN_CANONICAL, takže je filtr
  // v posilovně vyměnil za `leg_press` — ten už byl v A, takže A a B se
  // přestaly lišit. Šablona musí být zvolená tak, aby filtr NEMĚL co měnit.
  const envMap = { gym: 'gym', home_equipment: 'home_equipment', home_bodyweight: 'home_bodyweight' };
  const equipment = { gym: [], home_equipment: ['dumbbells', 'bench', 'pullup_bar'], home_bodyweight: [] };

  for (const [envKey, varianty] of Object.entries(START_PROGRAM_VARIANTS)) {
    for (const [nazev, cviky] of Object.entries(varianty)) {
      for (const cvik of cviky) {
        const adapted = adaptExerciseForTrainingEnvironment(
          { ...cvik },
          envMap[envKey],
          equipment[envKey]
        );
        assert.equal(
          adapted.canonical_key,
          cvik.canonical_key,
          `${envKey}/${nazev}: filtr prostředí vyměnil ${cvik.canonical_key} → ${adapted.canonical_key}`
        );
      }
    }
  }
});

test('A a B se po filtru prostředí pořád liší', () => {
  for (const bm of [GYM, HOME_BW, HOME_EQ]) {
    const env = startProgramEnvironment(bm);
    const equip = env === 'home_equipment' ? ['dumbbells', 'bench'] : [];
    const { days } = tyden(bm);
    const podpis = (day) => day.exercises
      .map((e) => adaptExerciseForTrainingEnvironment({ ...e }, env, equip).canonical_key)
      .join('|');

    assert.notEqual(podpis(days[0]), podpis(days[1]), `${env}: A a B jsou po filtru totožné`);
    assert.equal(podpis(days[0]), podpis(days[2]), `${env}: první a třetí trénink se rozešly`);
  }
});

test('první týden nehádá váhu', () => {
  const { prescriptions } = tyden(GYM);
  for (const p of prescriptions) {
    assert.equal(p.decision, 'first_time');
    assert.equal(p.prescribed_weight_kg, null, `${p.canonical_key}: váha se v prvním týdnu nehádá`);
  }
});

test('splnil všechny série → přidá se váha podle náčiní', () => {
  // Osa 2,5 kg, jednoručka 2 kg, leg press 5 kg.
  const cases = [
    ['bench_press', 40, 42.5],
    ['overhead_press', 20, 22],
    ['leg_press', 80, 85],
    ['lat_pulldown', 30, 32.5],
  ];
  for (const [key, from, expected] of cases) {
    const previous = {
      canonical_key: key, status: 'done', target_sets: 3,
      target_reps_min: 8, target_reps_max: 10,
      prescribed_weight_kg: from, reps_done: [10, 10, 9],
      consecutive_misses: 0, consecutive_no_data: 0,
    };
    const next = nextPrescription(previous, { canonical_key: key, target_sets: 3, target_reps_min: 8, target_reps_max: 10 });
    assert.equal(next.decision, 'progress_weight', key);
    assert.equal(next.prescribed_weight_kg, expected, `${key}: ${from} → ${expected}`);
  }
});

test('progrese staví na ODCVIČENÉ váze, ne na předepsané', () => {
  const baseline = { canonical_key: 'bench_press', target_sets: 3, target_reps_min: 8, target_reps_max: 10 };

  // První týden: předpis je null (váhu nehádáme), uživatel zapsal 40 kg
  // a všechny série splnil. Bez tohohle pravidla by se program navždy zasekl
  // na „doplň váhu“ — a přesně to by udělal.
  const prvniTyden = nextPrescription({
    canonical_key: 'bench_press', status: 'done', target_sets: 3,
    target_reps_min: 8, target_reps_max: 10,
    prescribed_weight_kg: null, weight_done_kg: 40, reps_done: [10, 10, 10],
    consecutive_misses: 0, consecutive_no_data: 0,
  }, baseline);
  assert.equal(prvniTyden.decision, 'progress_weight');
  assert.equal(prvniTyden.prescribed_weight_kg, 42.5);

  // Kdo předepsanou váhu překročí, dostane příště víc — ne o inkrement
  // od toho, co jsme mu předepsali.
  const prekrocil = nextPrescription({
    canonical_key: 'bench_press', status: 'done', target_sets: 3,
    target_reps_min: 8, target_reps_max: 10,
    prescribed_weight_kg: 40, weight_done_kg: 45, reps_done: [10, 10, 10],
    consecutive_misses: 0, consecutive_no_data: 0,
  }, baseline);
  assert.equal(prekrocil.prescribed_weight_kg, 47.5, '45 + 2,5, ne 40 + 2,5');

  // Splnil opakování, ale váhu nezadal → nemáme od čeho přidávat.
  const bezVahy = nextPrescription({
    canonical_key: 'bench_press', status: 'done', target_sets: 3,
    target_reps_min: 8, target_reps_max: 10,
    prescribed_weight_kg: null, weight_done_kg: null, reps_done: [10, 10, 10],
    consecutive_misses: 0, consecutive_no_data: 0,
  }, baseline);
  assert.equal(bezVahy.decision, 'repeat_weight_unknown');
  assert.equal(bezVahy.prescribed_weight_kg, null);
});

test('nesplnil → stejná váha; třikrát po sobě → deload 10 %', () => {
  const base = {
    canonical_key: 'bench_press', status: 'done', target_sets: 3,
    target_reps_min: 8, target_reps_max: 10, prescribed_weight_kg: 50,
    weight_done_kg: 50, reps_done: [8, 7, 5], consecutive_no_data: 0,
  };
  const baseline = { canonical_key: 'bench_press', target_sets: 3, target_reps_min: 8, target_reps_max: 10 };

  const first = nextPrescription({ ...base, consecutive_misses: 0 }, baseline);
  assert.equal(first.decision, 'repeat_missed');
  assert.equal(first.prescribed_weight_kg, 50, 'po prvním nezdaru se nesnižuje');
  assert.equal(first.consecutive_misses, 1);

  const second = nextPrescription({ ...base, consecutive_misses: 1 }, baseline);
  assert.equal(second.decision, 'repeat_missed');
  assert.equal(second.consecutive_misses, 2);

  const third = nextPrescription({ ...base, consecutive_misses: 2 }, baseline);
  assert.equal(third.decision, 'deload');
  assert.equal(third.prescribed_weight_kg, 45, '50 → 45 (−10 %, zaokrouhleno na 2,5)');
  assert.equal(third.consecutive_misses, 0, 'po deloadu se počítadlo nuluje');
});

test('nezadal nic → identický předpis, nikdy se nehádá', () => {
  const previous = {
    canonical_key: 'bench_press', status: 'prescribed', target_sets: 3,
    target_reps_min: 8, target_reps_max: 10, prescribed_weight_kg: 45,
    reps_done: null, consecutive_misses: 0, consecutive_no_data: 0,
  };
  const baseline = { canonical_key: 'bench_press', target_sets: 3, target_reps_min: 8, target_reps_max: 10 };

  const next = nextPrescription(previous, baseline);
  assert.equal(next.decision, 'repeat_no_data');
  assert.equal(next.prescribed_weight_kg, 45, 'stejná váha');
  assert.equal(next.target_sets, 3);
  assert.equal(next.target_reps_min, 8);
  assert.equal(next.consecutive_no_data, 1);

  // Po třech týdnech bez dat se progrese označí za zastavenou, ale předpis
  // se pořád jen opakuje — nesnižuje se ani nezvyšuje.
  const po2 = nextPrescription({ ...previous, consecutive_no_data: 2 }, baseline);
  assert.equal(po2.decision, 'paused_no_data');
  assert.equal(po2.prescribed_weight_kg, 45);

  // `skipped` je taky „nemáme data“ — uživatel řekl, že netrénoval.
  const skip = nextPrescription({ ...previous, status: 'skipped' }, baseline);
  assert.equal(skip.decision, 'repeat_no_data');
  assert.equal(skip.prescribed_weight_kg, 45);
});

test('cviky na čas se neposouvají kilogramy', () => {
  const baseline = { canonical_key: 'plank', target_sets: 3, target_duration_sec: 40 };
  const previous = {
    canonical_key: 'plank', status: 'done', target_sets: 3, target_duration_sec: 40,
    duration_done_sec: [40, 40, 40], consecutive_misses: 0, consecutive_no_data: 0,
  };

  const next = nextPrescription(previous, baseline);
  assert.equal(next.decision, 'progress_duration');
  assert.equal(next.target_duration_sec, 45, '+5 s');
  assert.equal(next.prescribed_weight_kg, null, 'prkno nikdy nedostane váhu');

  // Na stropu 60 s se přidá série a čas se vrátí na výchozí.
  const naStropu = nextPrescription(
    { ...previous, target_duration_sec: 60, duration_done_sec: [60, 60, 60] },
    baseline
  );
  assert.equal(naStropu.decision, 'add_set');
  assert.equal(naStropu.target_sets, 4);
  assert.equal(naStropu.target_duration_sec, 40);

  // Časový cvik se nikdy nedeloaduje — ubrat začátečníkovi sekundy nepomůže.
  const nesplnil = nextPrescription(
    { ...previous, duration_done_sec: [30, 25, 20], consecutive_misses: 2 },
    baseline
  );
  assert.equal(nesplnil.decision, 'repeat_missed');
  assert.equal(nesplnil.target_duration_sec, 40);
});

test('vlastní váha se posouvá opakováními, pak sérií', () => {
  const baseline = { canonical_key: 'pushup', target_sets: 3, target_reps_min: 8, target_reps_max: 12 };
  const done = (min, max, reps, sets = 3) => ({
    canonical_key: 'pushup', status: 'done', target_sets: sets,
    target_reps_min: min, target_reps_max: max, reps_done: reps,
    consecutive_misses: 0, consecutive_no_data: 0,
  });

  const next = nextPrescription(done(8, 12, [12, 12, 12]), baseline);
  assert.equal(next.decision, 'progress_reps');
  assert.deepEqual([next.target_reps_min, next.target_reps_max], [9, 13]);
  assert.equal(next.prescribed_weight_kg, null, 'kliky nedostanou kilogramy');

  // Na stropu opakování se přidá série a rozsah se vrátí na výchozí.
  const naStropu = nextPrescription(done(16, 20, [20, 20, 20]), baseline);
  assert.equal(naStropu.decision, 'add_set');
  assert.equal(naStropu.target_sets, 4);
  assert.deepEqual([naStropu.target_reps_min, naStropu.target_reps_max], [8, 12]);
});

test('splnil = VŠECHNY série na spodní hranici, ne jen některé', () => {
  const row = (reps) => ({
    canonical_key: 'bench_press', status: 'done', target_sets: 3,
    target_reps_min: 8, target_reps_max: 10, reps_done: reps,
  });
  assert.equal(prescriptionMet(row([8, 8, 8])), true);
  assert.equal(prescriptionMet(row([10, 10, 8])), true);
  assert.equal(prescriptionMet(row([10, 10, 7])), false, 'jedna série pod hranicí = nesplnil');
  assert.equal(prescriptionMet(row([10, 10])), false, 'chybějící série = nesplnil');
});

test('progrese se napojí přes canonical_key i po filtru prostředí', () => {
  // Simuluje se druhý týden: minulý týden uživatel splnil bench 40 kg.
  const lastByKey = new Map([['bench_press', {
    canonical_key: 'bench_press', status: 'done', target_sets: 3,
    target_reps_min: 8, target_reps_max: 10, prescribed_weight_kg: 40,
    reps_done: [10, 10, 10], consecutive_misses: 0, consecutive_no_data: 0,
  }]]);

  const { days } = tyden(GYM, 1, lastByKey);
  const bench = days.flatMap((d) => d.exercises).find((e) => e.canonical_key === 'bench_press');
  assert.ok(bench, 'bench press musí být v týdnu');
  assert.equal(bench.start_program.weight_kg, 42.5, 'progrese se napojila');
  assert.equal(bench.start_program.decision, 'progress_weight');

  // Cvik, o kterém progrese nic neví, začíná od výchozího předpisu.
  const drep = days.flatMap((d) => d.exercises).find((e) => e.canonical_key === 'goblet_squat');
  assert.equal(drep.start_program.decision, 'first_time');
});

test('zapsané pondělí nepřebije nezapsaný pátek', () => {
  // A/B se při 3× týdně opakuje: trénink A je v pondělí i v pátek. Kdyby se
  // bral „poslední řádek“, nezapsaný pátek by překryl zapsané pondělí
  // a progrese by hlásila „nezadal nic“. Změřeno na produkčních datech:
  // všech 10 cviků skončilo na repeat_no_data, přitom pondělí bylo vyplněné.
  const rowsDesc = [
    // pátek — předpis, nikdo nevyplnil (novější)
    {
      canonical_key: 'bench_press', performed_on: '2026-08-14', variant: 'A',
      target_sets: 3, target_reps_min: 8, target_reps_max: 10,
      prescribed_weight_kg: null, status: 'prescribed', reps_done: null,
      weight_done_kg: null, consecutive_misses: 0, consecutive_no_data: 0,
    },
    // pondělí — odcvičeno a zapsáno (starší, ale TÝŽ týden)
    {
      canonical_key: 'bench_press', performed_on: '2026-08-10', variant: 'A',
      target_sets: 3, target_reps_min: 8, target_reps_max: 10,
      prescribed_weight_kg: null, status: 'done', reps_done: [10, 10, 10],
      weight_done_kg: 40, consecutive_misses: 0, consecutive_no_data: 0,
    },
  ];

  const previous = pickPreviousPerExercise(rowsDesc).get('bench_press');
  assert.equal(previous.status, 'done', 'výsledek z pondělí se musí prosadit');
  assert.equal(previous.weight_done_kg, 40);

  const next = nextPrescription(previous, {
    canonical_key: 'bench_press', target_sets: 3, target_reps_min: 8, target_reps_max: 10,
  });
  assert.equal(next.decision, 'progress_weight');
  assert.equal(next.prescribed_weight_kg, 42.5);

  // Když ale v tom týdnu nikdo nevyplnil NIC, je to poctivé „nezadal nic“.
  const nicNezapsano = pickPreviousPerExercise([
    { ...rowsDesc[0] },
    { ...rowsDesc[1], status: 'prescribed', reps_done: null, weight_done_kg: null },
  ]).get('bench_press');
  assert.equal(nextPrescription(nicNezapsano, {
    canonical_key: 'bench_press', target_sets: 3, target_reps_min: 8, target_reps_max: 10,
  }).decision, 'repeat_no_data');

  // Starší TÝDEN se nepočítá — jinak by se progrese vezla na dávno odcvičeném
  // výsledku a počítadlo „bez dat“ by se nikdy nerozjelo.
  const staryTyden = pickPreviousPerExercise([
    { ...rowsDesc[0], performed_on: '2026-08-17' },
    { ...rowsDesc[1], performed_on: '2026-08-10' },
  ]).get('bench_press');
  assert.equal(staryTyden.status, 'prescribed', 'výsledek z minulého týdne se do tohoto nepřenáší');
});

test('týdenní index se počítá od začátku programu', () => {
  assert.equal(startProgramWeekIndex('2026-08-10', '2026-08-10'), 0);
  assert.equal(startProgramWeekIndex('2026-08-17', '2026-08-10'), 1);
  assert.equal(startProgramWeekIndex('2026-09-07', '2026-08-10'), 4);
  // Chybějící datum nesmí shodit plán — začne se od A.
  assert.equal(startProgramWeekIndex('2026-08-17', null), 0);
  assert.equal(startProgramWeekIndex(null, null), 0);
});

test('střídání A/B je deterministické napříč týdny', () => {
  // 3× týdně: A-B-A | B-A-B | A-B-A …
  const seq = [];
  for (let w = 0; w < 4; w += 1) {
    for (let s = 0; s < 3; s += 1) seq.push(startVariantForSession(w, s, 3));
  }
  assert.deepEqual(seq.join(''), 'ABABABABABAB');

  // 2× týdně: A-B | A-B — sudý počet tréninků pořadí neobrací.
  const seq2 = [];
  for (let w = 0; w < 2; w += 1) {
    for (let s = 0; s < 2; s += 1) seq2.push(startVariantForSession(w, s, 2));
  }
  assert.deepEqual(seq2.join(''), 'ABAB');
});

test('program se větví jen pro START', () => {
  assert.equal(usesStartStrengthProgram({ program: 'START' }), true);
  assert.equal(usesStartStrengthProgram({ program: 'ON_CLUB' }), false);
  assert.equal(usesStartStrengthProgram({ program: 'VIP' }), false);

  // memberships.tier přebíjí body_metrics.program — jinak by placený uživatel
  // s registračním „START“ dostal začátečnický program.
  assert.equal(resolveProgramTier({ program: 'START' }, { tier: 'VIP' }), 'VIP');
  assert.equal(usesStartStrengthProgram({ program: 'START' }, { tier: 'ON_CLUB' }), false);

  // Neznámá hodnota se chová jako START (nejopatrnější), ne jako placený program.
  assert.equal(resolveProgramTier({ program: 'NEZNAMY' }, null), 'START');
  assert.equal(resolveProgramTier(null, null), 'START');
  assert.equal(resolveProgramTier({}, { tier: 'nonsense' }), 'START');

  for (const tier of PROGRAM_TIERS) {
    assert.equal(resolveProgramTier({}, { tier }), tier);
  }
});

test('sets a reps jdou do plánu ve tvaru, který umí UI přečíst', () => {
  const { days } = tyden(GYM);
  for (const day of days) {
    assert.ok(day.workout_name.startsWith('Trénink '), 'trénink musí být pojmenovaný A/B');
    for (const e of day.exercises) {
      assert.ok(e.canonical_key, 'canonical_key je povinný pro resolveWorkoutExercises');
      assert.ok(e.search_term, 'search_term je povinný pro wger');
      assert.ok(Number.isInteger(e.sets) && e.sets > 0, `${e.canonical_key}: sets`);
      // Buď opakování, nebo čas — nikdy ani jedno.
      const maReps = typeof e.reps === 'string' && e.reps.length > 0;
      const maCas = Number.isFinite(e.duration_sec) && e.duration_sec > 0;
      assert.ok(maReps || maCas, `${e.canonical_key}: chybí reps i duration_sec`);
      assert.equal(e.start_program.progression_kind, progressionRuleFor(e.canonical_key).kind);
    }
  }
});
