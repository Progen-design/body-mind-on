/**
 * Pestrost tréninků při 4+ za týden a vliv cíle na předpis.
 *
 * Změřeno na čtyřech čerstvých registracích v produkci. Žena / nabírání svalů,
 * 5× týdně: A, B, B, A, B — dva různé tréninky na pět dnů. Muž / redukce:
 * B, A, A. Obě pohlaví i oba cíle přitom dostaly IDENTICKÉ cviky ve stejném
 * pořadí, protože `goal` se do skladby nepromítal vůbec.
 *
 * A/B při 1–3 trénincích je záměr (rozhodnuto 10. 8. 2026) a testy ho hlídají,
 * aby se „oprava pestrosti“ nepřelila i tam, kam nepatří.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRAH_ROZSIRENE_ROTACE,
  START_PROGRAM_VARIANTS,
  buildStartWorkoutDays,
  cilTreninku,
  pocetVariantProTyden,
  startVariantForSession,
  upravProCil,
} from '../workoutStartProgram.js';

const varianty = (perWeek, weekIndex = 0) =>
  Array.from({ length: perWeek }, (_, i) => startVariantForSession(weekIndex, i, perWeek));

test('1–3 tréninky týdně zůstávají na A/B', () => {
  assert.equal(pocetVariantProTyden(3), 2);
  assert.deepEqual(varianty(3), ['A', 'B', 'A'], 'klasické A-B-A');
  assert.deepEqual(varianty(3, 1), ['B', 'A', 'B'], 'další týden se prohodí');
  assert.deepEqual(varianty(2), ['A', 'B']);
  assert.deepEqual(varianty(1), ['A']);
});

test('4+ tréninků týdně rotuje přes čtyři varianty', () => {
  assert.equal(PRAH_ROZSIRENE_ROTACE, 4);
  assert.equal(pocetVariantProTyden(4), 4);
  assert.equal(pocetVariantProTyden(5), 4);
  assert.deepEqual(varianty(4), ['A', 'B', 'C', 'D']);
});

test('pět tréninků týdně dá aspoň čtyři různé — to byl ten změřený problém', () => {
  const v = varianty(5);
  assert.equal(v.length, 5);
  assert.ok(new Set(v).size >= 4, `dostal jen ${new Set(v).size} různých: ${v.join(', ')}`);
});

test('rotace pokračuje přes hranici týdne, netočí se dokola stejně', () => {
  assert.notDeepEqual(varianty(5, 0), varianty(5, 1),
    'druhý týden nesmí být kopie prvního');
});

test('každé prostředí má všechny čtyři varianty a každá pět cviků', () => {
  for (const [env, v] of Object.entries(START_PROGRAM_VARIANTS)) {
    assert.deepEqual(Object.keys(v).sort(), ['A', 'B', 'C', 'D'], env);
    for (const [klic, cviky] of Object.entries(v)) {
      assert.equal(cviky.length, 5, `${env}/${klic}`);
    }
  }
});

test('varianty se navzájem liší skladbou', () => {
  for (const [env, v] of Object.entries(START_PROGRAM_VARIANTS)) {
    const podpisy = Object.values(v).map((cviky) => cviky.map((c) => c.canonical_key).sort().join('|'));
    assert.equal(new Set(podpisy).size, 4, `${env}: dvě varianty mají stejné cviky`);
  }
});

// ── CÍL ─────────────────────────────────────────────────────────────────────

test('cíl se normalizuje, neznámý spadne na udržování', () => {
  assert.equal(cilTreninku({ goal: 'nabirani_svaly' }), 'nabirani_svaly');
  assert.equal(cilTreninku({ goal: 'redukce' }), 'redukce');
  assert.equal(cilTreninku({ goal: 'nesmysl' }), 'udrzovani');
  assert.equal(cilTreninku({}), 'udrzovani');
  assert.equal(cilTreninku(null), 'udrzovani');
});

test('nabírání svalů: nižší opakování a série navíc u hlavního cviku', () => {
  const zaklad = { canonical_key: 'bench_press', sets: 3, reps_min: 8, reps_max: 10, duration_sec: null };
  const hlavni = upravProCil(zaklad, 'nabirani_svaly', 0);
  assert.equal(hlavni.reps_min, 6);
  assert.equal(hlavni.reps_max, 8);
  assert.equal(hlavni.sets, 4, 'první dva cviky dne dostanou sérii navíc');

  const izolace = upravProCil(zaklad, 'nabirani_svaly', 3);
  assert.equal(izolace.sets, 3, 'čtvrtá série bicepsu je objem bez efektu');
});

test('redukce: vyšší opakování a delší výdrž', () => {
  const zaklad = { canonical_key: 'leg_press', sets: 3, reps_min: 8, reps_max: 10, duration_sec: null };
  const r = upravProCil(zaklad, 'redukce', 0);
  assert.equal(r.reps_min, 12);
  assert.equal(r.reps_max, 14);
  assert.equal(r.sets, 3, 'redukce nepřidává série, přidává opakování');

  const prkno = upravProCil({ canonical_key: 'plank', sets: 3, reps_min: null, duration_sec: 40 }, 'redukce', 0);
  assert.equal(prkno.duration_sec, 50);
});

test('udržování nechává šablonu beze změny', () => {
  const zaklad = { canonical_key: 'squat', sets: 3, reps_min: 10, reps_max: 12, duration_sec: null };
  const u = upravProCil(zaklad, 'udrzovani', 0);
  assert.equal(u.reps_min, 10);
  assert.equal(u.reps_max, 12);
  assert.equal(u.sets, 3);
});

test('rozsahy se drží v bezpečných mezích', () => {
  const nizky = upravProCil({ sets: 3, reps_min: 5, reps_max: 8, duration_sec: null }, 'nabirani_svaly', 0);
  assert.ok(nizky.reps_min >= 5, 'pod 5 opakování už je to síla, ne začátečnický objem');

  const vysoky = upravProCil({ sets: 3, reps_min: 18, reps_max: 20, duration_sec: null }, 'redukce', 0);
  assert.ok(vysoky.reps_max <= 20, 'nad 20 už to není posilování');
  assert.ok(vysoky.reps_min <= vysoky.reps_max, 'min nesmí přeskočit max');
});

// ── CELÝ TÝDEN ──────────────────────────────────────────────────────────────

const bm = (goal, env = 'gym') => ({ goal, training_environment: env, user_id: 'u1' });

test('reálný týden: 5 tréninků, čtyři různé skladby', () => {
  const { days } = buildStartWorkoutDays({
    bodyMetrics: bm('nabirani_svaly'), workoutDays: [1, 2, 3, 4, 5],
  });
  assert.equal(days.length, 5);
  const podpisy = days.map((d) => d.exercises.map((e) => e.canonical_key).join('|'));
  assert.ok(new Set(podpisy).size >= 4, `jen ${new Set(podpisy).size} různých tréninků`);
});

test('stejné cviky, jiný předpis podle cíle', () => {
  const nabirani = buildStartWorkoutDays({ bodyMetrics: bm('nabirani_svaly'), workoutDays: [1, 3, 5] });
  const redukce = buildStartWorkoutDays({ bodyMetrics: bm('redukce'), workoutDays: [1, 3, 5] });

  const prvniN = nabirani.days[0].exercises[0];
  const prvniR = redukce.days[0].exercises[0];
  assert.equal(prvniN.canonical_key, prvniR.canonical_key, 'cviky určuje prostředí, ne cíl');
  assert.notEqual(prvniN.reps, prvniR.reps, 'předpis se ale lišit MUSÍ');
  assert.ok(prvniN.sets > prvniR.sets, 'nabírání má u hlavního cviku sérii navíc');
});

test('cíl je v plánu dohledatelný', () => {
  const { days } = buildStartWorkoutDays({ bodyMetrics: bm('redukce'), workoutDays: [1, 3] });
  assert.equal(days[0].start_program_goal, 'redukce');
});

test('žádná varianta nesmí mít po filtru prostředí tentýž cvik dvakrát', async () => {
  const { filterWorkoutPlanForTrainingEnvironment } = await import('../trainingEnvironment.js');
  // Posilovna s prázdným `available_equipment` — to je běžný stav, protože
  // ten sloupec popisuje DOMÁCÍ vybavení. Kvůli tomu se ve variantě D vyměnily
  // shyby za přítahy, které v ní už byly, a trénink měl bent_over_row dvakrát.
  const prostredi = [
    { training_environment: 'gym', available_equipment: [] },
    { training_environment: 'home', available_equipment: ['dumbbells', 'bench'] },
    { training_environment: 'home', available_equipment: [] },
  ];
  for (const p of prostredi) {
    const bodyMetrics = { user_id: 'u1', goal: 'udrzovani', ...p };
    const { days } = buildStartWorkoutDays({ bodyMetrics, workoutDays: [1, 2, 3, 4] });
    const plan = { workout_days: [1, 2, 3, 4], days };
    filterWorkoutPlanForTrainingEnvironment(plan, bodyMetrics);
    for (const d of plan.days) {
      const keys = d.exercises.map((e) => e.canonical_key);
      assert.equal(new Set(keys).size, keys.length,
        `${p.training_environment}/${d.workout_name}: ${keys.join(', ')}`);
    }
  }
});
