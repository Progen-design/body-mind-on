// Regrese k padu, ktery shodil zalozku "Treninkovy plan" kazdemu uzivateli
// se 3 a mene treninky tydne: workouts[3] bylo undefined a komponenta pak
// cetla todayWorkout.title -> TypeError -> cerna obrazovka.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEN_BEZ_TRENINKU, dnesniTrenink, dnesniTreninkPresne, jeNaplanovany, treninkoveDny, vybranyTrenink,
  podilTreninku, jeTreninkHotovy, rozpracovaneCviky, textCviku, type Adherence
} from './trenink.ts';
import type { WorkoutDay } from '../types.ts';

const DNY = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];

function plan(pocetDni: number, indexDneska: number | null = null): WorkoutDay[] {
  return Array.from({ length: pocetDni }, (_, i) => ({
    dayName: DNY[i],
    dayShort: DNY[i].slice(0, 2).toUpperCase(),
    title: `Trénink ${i + 1}`,
    durationMin: 60,
    caloriesBurned: 400,
    isToday: i === indexDneska,
    isCompleted: false,
    focus: 'Síla',
    exercises: []
  }));
}

test('plán s 1, 3, 5 i 7 dny vrátí trénink, nikdy undefined', () => {
  for (const pocet of [1, 3, 5, 7]) {
    const workouts = plan(pocet);

    const dnesni = dnesniTrenink(workouts);
    assert.ok(dnesni, `${pocet} dni: dnesniTrenink vratil nic`);
    assert.equal(typeof dnesni.title, 'string', `${pocet} dni: chybi title`);
    assert.ok(Array.isArray(dnesni.exercises), `${pocet} dni: chybi exercises`);

    const vybrany = vybranyTrenink(workouts, null);
    assert.ok(vybrany && typeof vybrany.title === 'string', `${pocet} dni: vybranyTrenink selhal`);
  }
});

test('prázdný plán projde bez pádu a vrátí zástupce', () => {
  const dnesni = dnesniTrenink([]);

  assert.equal(dnesni.title, DEN_BEZ_TRENINKU.title);
  assert.deepEqual(dnesni.exercises, []);
  assert.equal(jeNaplanovany(dnesni), false);
});

test('den označený isToday má přednost před prvním dnem', () => {
  const workouts = plan(5, 2);
  assert.equal(dnesniTrenink(workouts).dayName, 'Středa');
});

test('bez isToday se vezme první den plánu, ne čtvrtý', () => {
  // Driv tu bylo workouts[3] natvrdo — u tridenniho planu undefined.
  const workouts = plan(3);
  assert.equal(dnesniTrenink(workouts).dayName, 'Pondělí');
});

test('vybraný den se najde podle jména', () => {
  const workouts = plan(5);
  assert.equal(vybranyTrenink(workouts, 'Čtvrtek').dayName, 'Čtvrtek');
});

test('vybraný den, který v plánu není, spadne na dnešek místo na undefined', () => {
  // Nastane po pregenerovani planu, kdy si UI drzelo stary nazev dne.
  const workouts = plan(3, 1);

  assert.equal(vybranyTrenink(workouts, 'Neděle').dayName, 'Úterý');
  assert.equal(vybranyTrenink([], 'Neděle').title, DEN_BEZ_TRENINKU.title);
});

test('jeNaplanovany odliší skutečný trénink od zástupce', () => {
  assert.equal(jeNaplanovany(DEN_BEZ_TRENINKU), false);
  assert.equal(jeNaplanovany(plan(1)[0]), true);
});

test('jeNaplanovany pozná den volna podle maTrenink, ne podle dayName (docs/DALSI_KROK.md 8.14)', () => {
  // Od 8.14 nese den volna z naTreninky() neprázdné dayName (viz WorkoutDay
  // v adaptery.ts) — bez explicitního maTrenink by ho jeNaplanovany omylem
  // vydávala za trénink, protože samotné dayName už nestačí odlišit.
  const denVolna: WorkoutDay = { ...plan(1)[0], maTrenink: false, exercises: [] };
  assert.equal(jeNaplanovany(denVolna), false);

  const skutecnyTrenink: WorkoutDay = { ...plan(1)[0], maTrenink: true };
  assert.equal(jeNaplanovany(skutecnyTrenink), true);
});

test('treninkoveDny vynechá dny volna, maTrenink chybějící se počítá jako trénink', () => {
  const workouts = plan(3);
  const sVolnem: WorkoutDay[] = [
    { ...workouts[0], maTrenink: false, exercises: [] },
    workouts[1],
    { ...workouts[2], maTrenink: true }
  ];
  assert.deepEqual(treninkoveDny(sVolnem).map(w => w.dayName), ['Úterý', 'Středa']);
});

test('dnesniTrenink záskok přeskočí pondělní volno a vrátí první SKUTEČNÝ trénink (docs/DALSI_KROK.md 8.14)', () => {
  // Dřív bylo workouts[0] vždy první TRÉNINKOVÝ den (naTreninky() filtrovala
  // dny bez tréninku pryč). Po 8.14 může workouts[0] být pondělní volno —
  // záskok bez isToday shody nesmí vrátit volno, musí najít první skutečný
  // trénink dál v týdnu.
  const workouts = plan(3); // zadny den neni isToday — "dnesek chybi"
  const sPondelnimVolnem: WorkoutDay[] = [
    { ...workouts[0], maTrenink: false, title: 'Volno', exercises: [] }, // Pondělí
    { ...workouts[1], maTrenink: true }, // Úterý
    { ...workouts[2], maTrenink: true }  // Středa
  ];

  const dnesni = dnesniTrenink(sPondelnimVolnem);
  assert.equal(dnesni.dayName, 'Úterý', 'zaskok vratil pondelni volno misto prvniho treninku');
  assert.notEqual(dnesni.title, 'Volno');

  // Kdyz je volno kazdy den, zaskok korektne spadne na zastupce.
  const samaVolna: WorkoutDay[] = sPondelnimVolnem.map(w => ({ ...w, maTrenink: false, exercises: [] }));
  assert.equal(dnesniTrenink(samaVolna).title, DEN_BEZ_TRENINKU.title);
});

test('zástupce nenese vymyšlená čísla', () => {
  // Prazdny plan nesmi tvarit, ze uzivatel ma naplanovanych 400 kcal.
  assert.equal(DEN_BEZ_TRENINKU.durationMin, 0);
  assert.equal(DEN_BEZ_TRENINKU.caloriesBurned, 0);
  assert.equal(DEN_BEZ_TRENINKU.focus, '');
});

test('v den volna se neukáže cizí trénink (docs/DALSI_KROK.md 6.9)', () => {
  // Plán po/st/pá zobrazený v neděli: žádný den nemá isToday, ale plán
  // neni prázdný. dnesniTrenink() tu schválně spadne na první den (jiné
  // volající — vybranyTrenink() pro záložku Tréninkový plán — to potřebují),
  // ale dnesniTreninkPresne() nesmí cizí den vydávat za dnešek.
  const workouts = plan(5); // zadny den neni isToday
  const presne = dnesniTreninkPresne(workouts);

  assert.equal(presne.title, DEN_BEZ_TRENINKU.title);
  assert.equal(presne.dayName, '');
  assert.equal(jeNaplanovany(presne), false);

  // Kontrolní důkaz, že rozdíl je opravdu jen v přesnosti: dnesniTrenink()
  // na tomtéž vstupu pořád spadne na první den (nezměněné chování).
  assert.equal(dnesniTrenink(workouts).dayName, 'Pondělí');
});

test('trénink označený jako dnešní je stejný v obou funkcích', () => {
  const workouts = plan(5, 2); // Streda je isToday
  assert.equal(dnesniTreninkPresne(workouts).dayName, 'Středa');
  assert.equal(dnesniTreninkPresne(workouts).dayName, dnesniTrenink(workouts).dayName);
});

test('prázdný plán vrátí zástupce i přes dnesniTreninkPresne()', () => {
  const presne = dnesniTreninkPresne([]);
  assert.equal(presne.title, DEN_BEZ_TRENINKU.title);
  assert.equal(jeNaplanovany(presne), false);
});

// ---- podíl tréninku (PROMPT_DOLADENI_DNES.md — jeden výpočet pro celé Dnes)

const cviky = (hotovo: number, celkem: number) =>
  Array.from({ length: celkem }, (_, i) => ({ name: `Cvik ${i + 1}`, completed: i < hotovo })) as unknown as WorkoutDay['exercises'];

const den = (hotovo: number, celkem: number, extra: Partial<WorkoutDay> = {}): WorkoutDay =>
  ({ ...plan(1, 0)[0], exercises: cviky(hotovo, celkem), ...extra });

const stav = (extra: Partial<Adherence> = {}): Adherence => ({
  planovanych_jidel: 5, splnenych_jidel: 0, treninkovy_den: true, trenink_splnen: false,
  pohyb_min: 0, watch_workout_count: 0, manual_workout_count: 0, ...extra,
});

test('podíl tréninku = odškrtnuté cviky z celku', () => {
  assert.equal(podilTreninku(den(0, 4)), 0);
  assert.equal(podilTreninku(den(2, 4)), 0.5);
  assert.equal(podilTreninku(den(4, 4)), 1);
});

test('adherence „trénink splněn" po prvním cviku Hotovo NEZAPNE (chyba z 21. 9. 2026)', () => {
  // get_daily_adherence hlásí trénink splněný po PRVNÍM cviku
  const s = stav({ trenink_splnen: true, manual_workout_count: 1 });
  assert.equal(podilTreninku(den(2, 4), s), 0.5);
  assert.equal(jeTreninkHotovy(den(2, 4), s), false);
  assert.equal(jeTreninkHotovy(den(4, 4), s), true);
});

test('hodinky uznají trénink celý, i bez odškrtnutých cviků', () => {
  assert.equal(jeTreninkHotovy(den(0, 4), stav({ watch_workout_count: 1 })), true);
});

test('den označený jako hotový serverem je hotový', () => {
  assert.equal(jeTreninkHotovy(den(3, 4, { isCompleted: true })), true);
});

test('den bez seznamu cviků bere ruční zápis / adherenci', () => {
  assert.equal(jeTreninkHotovy(den(0, 0), stav({ trenink_splnen: true })), true);
  assert.equal(jeTreninkHotovy(den(0, 0), stav({ manual_workout_count: 1 })), true);
  assert.equal(jeTreninkHotovy(den(0, 0), stav()), false);
  assert.equal(jeTreninkHotovy(den(0, 0)), false);
});

test('rozpracovaný trénink: „2 z 4 cviků", jinak null', () => {
  assert.deepEqual(rozpracovaneCviky(den(2, 4)), { hotovo: 2, celkem: 4 });
  assert.equal(rozpracovaneCviky(den(0, 4)), null, 'nic neodškrtnuto = nerozpracováno');
  assert.equal(rozpracovaneCviky(den(4, 4)), null, 'hotový není rozpracovaný');
  assert.equal(rozpracovaneCviky(den(0, 0)), null);
  assert.equal(rozpracovaneCviky(den(1, 4), stav({ watch_workout_count: 1 })), null, 'hodinky = hotovo');
});

test('textCviku skloňuje', () => {
  assert.equal(textCviku(2, 4), '2 z 4 cviků');
  assert.equal(textCviku(0, 1), '0 z 1 cviku');
});
