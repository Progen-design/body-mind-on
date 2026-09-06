/**
 * Pestrost tréninků a vliv cíle na předpis.
 *
 * Změřeno na čtyřech čerstvých registracích v produkci. Žena / nabírání svalů,
 * 5× týdně: A, B, B, A, B — dva různé tréninky na pět dnů. Muž / redukce:
 * B, A, A. Obě pohlaví i oba cíle přitom dostaly IDENTICKÉ cviky ve stejném
 * pořadí, protože `goal` se do skladby nepromítal vůbec.
 *
 * docs/DALSI_KROK.md 8.15 (5. 9. 2026): do té doby platilo, že do čtyř
 * tréninků týdně (`PRAH_ROZSIRENE_ROTACE`, teď zrušeno) se rotovaly jen A/B —
 * C a D byly hotové pro všechna tři prostředí, ale při běžných 3× týdně se
 * nikdy nepoužily. Změřeno na produkci: 9 různých cviků na plán, „Prkno“
 * 42× napříč 21 plány. Teď se rotuje přes všechny čtyři vždy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  START_PROGRAM_VARIANTS,
  applyStartProgression,
  buildStartWorkoutDays,
  cilTreninku,
  startVariantForSession,
  upravProCil,
} from '../workoutStartProgram.js';

const varianty = (perWeek, weekIndex = 0) =>
  Array.from({ length: perWeek }, (_, i) => startVariantForSession(weekIndex, i, perWeek));

test('1–3 tréninky týdně teď rotují přes všechny čtyři varianty (docs/DALSI_KROK.md 8.15)', () => {
  assert.deepEqual(varianty(3), ['A', 'B', 'C'], 'týden 1');
  assert.deepEqual(varianty(3, 1), ['D', 'A', 'B'], 'týden 2 pokračuje přes hranici týdne');
  assert.deepEqual(varianty(3, 2), ['C', 'D', 'A'], 'týden 3');
  assert.deepEqual(varianty(2), ['A', 'B']);
  assert.deepEqual(varianty(1), ['A']);
});

test('za tři týdny při 3 trénincích týdně uvidí uživatel všechny čtyři varianty', () => {
  const triTydny = [0, 1, 2].flatMap((week) => varianty(3, week));
  assert.equal(new Set(triTydny).size, 4, `videl jen ${new Set(triTydny).size}: ${triTydny.join(', ')}`);
});

test('rotace je deterministická — stejný vstup dá stejný výstup', () => {
  assert.deepEqual(varianty(3, 1), varianty(3, 1));
  assert.equal(startVariantForSession(7, 2, 3), startVariantForSession(7, 2, 3));
});

test('4+ tréninků týdně se chová stejně jako dřív (beze změny)', () => {
  assert.deepEqual(varianty(4), ['A', 'B', 'C', 'D']);
  assert.deepEqual(varianty(5), ['A', 'B', 'C', 'D', 'A']);
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

// docs/DALSI_KROK.md 8.16 — 8.15 rozšířila rotaci na čtyři varianty všude,
// ale u home_bodyweight nebylo CO rotovat: A-D sdílely skoro všechno (20
// pozic, 9 unikátních cviků). Body 1 a 2 ze zadání 8.16, ověřené ze šablon.
test('home_bodyweight má po 8.16 aspoň 13 unikátních cviků a žádný nad 2 ze 4 variant', () => {
  const v = START_PROGRAM_VARIANTS.home_bodyweight;
  const vsechny = Object.values(v).flatMap((cviky) => cviky.map((c) => c.canonical_key));
  assert.equal(vsechny.length, 20, '4 varianty × 5 cviků');

  const unikatni = new Set(vsechny);
  assert.ok(
    unikatni.size >= 13,
    `home_bodyweight má jen ${unikatni.size} unikátních cviků za čtyři varianty, čekáno aspoň 13`
  );

  const cetnost = new Map();
  for (const klic of vsechny) cetnost.set(klic, (cetnost.get(klic) || 0) + 1);
  for (const [klic, pocet] of cetnost) {
    assert.ok(pocet <= 2, `${klic} je v ${pocet} ze 4 variant home_bodyweight, čekáno nejvýš 2`);
  }
});

test('home_bodyweight: A a B zůstaly nezměněné (8.16 smí sahat jen na C a D)', () => {
  const { A, B } = START_PROGRAM_VARIANTS.home_bodyweight;
  assert.deepEqual(A.map((c) => c.canonical_key), ['squat', 'pushup', 'superman', 'glute_bridge', 'plank']);
  assert.deepEqual(B.map((c) => c.canonical_key), ['lunges', 'pushup', 'superman', 'russian_twist', 'plank_side']);
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

// ── PROGRESE PŘES ZMĚNU ROTACE (docs/DALSI_KROK.md 8.15) ────────────────────

test('uživatel uprostřed programu nedostane jiný předpis pro tentýž cvik, i když ho teď potká pod jinou variantou', () => {
  // `start_workout_progression` se hledá jen podle canonical_key (viz
  // lib/workoutProgressionStore.js — unique na user_id+canonical_key+
  // performed_on, `variant` je na řádku jen popisek). Rozšíření rotace proto
  // nesmí resetovat progresi cviku, který dřív žil jen v A/B a teď se objeví
  // i v C/D se svým vlastním baseline předpisem v šabloně.
  //
  // "Prkno" (plank) je v GYM_A i GYM_C, ale GYM_C ho zavádí s duration_sec: 40
  // — stejně jako GYM_A. Kdyby se progrese řídila šablonou nové varianty
  // místo předchozím týdnem, uživatel, který už měl odcvičeno 45 s, by se
  // vrátil na 40 s zpátky.
  const predchoziTyden = new Map([
    ['plank', {
      canonical_key: 'plank',
      variant: 'A',
      target_sets: 3,
      target_reps_min: null,
      target_reps_max: null,
      target_duration_sec: 45,
      prescribed_weight_kg: null,
      status: 'done',
      reps_done: null,
      duration_done_sec: [45, 45, 45],
      decision: 'progress_duration',
      consecutive_misses: 0,
      consecutive_no_data: 0,
    }],
  ]);

  // Týden 3 při 3× týdně dá C-D-A (viz test výš) — den 0 je tedy varianta C.
  const { days } = buildStartWorkoutDays({
    bodyMetrics: bm('udrzovani', 'gym'), workoutDays: [1, 3, 5], weekIndex: 2,
  });
  const denC = days.find((d) => d.start_program_variant === 'C');
  assert.ok(denC, 'test předpokládá, že tenhle týden obsahuje variantu C');
  assert.ok(
    denC.exercises.some((e) => e.canonical_key === 'plank'),
    'GYM_C musí obsahovat plank, jinak test nic neověřuje'
  );

  const prescriptions = applyStartProgression([denC], predchoziTyden);
  const plankPredpis = prescriptions.find((p) => p.canonical_key === 'plank');

  assert.ok(plankPredpis, 'plank chybí v předpisu nové varianty');
  assert.equal(
    plankPredpis.target_duration_sec, 50,
    'progrese musí pokračovat od minulého týdne (45 + 5 s), ne se resetovat na baseline nové varianty (40 s)'
  );
  assert.equal(plankPredpis.decision, 'progress_duration');
});
