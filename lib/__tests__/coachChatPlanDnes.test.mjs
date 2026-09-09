// Dnesni plan v kontextu TEDa.
//
// PROC TENHLE TEST EXISTUJE. Do 9. 9. 2026 dostaval TED plan jako `plan_html`
// — 46 000 znaku orizlych na 12 000, cely tyden bez oznaceni dneska. Overeno
// naostro: na otazku „proc mam dnes zrovna tenhle trenink" odpovedel, ze plan
// pro dnesek nevidi, prestoze profil nad chatem ukazoval „Trenink B · 60 min".
//
// Regrese by se v testech neprojevila nijak jinak: chat by dal odpovidal,
// jen by porad rikal, ze plan nevidi. Proto se tady hlida jak vyber dneska,
// tak to, ze se do kontextu NEDOSTANOU tucne casti (postupy, GIFy, suroviny)
// — prave ty delaly z kontextu tisice tokenu.
import test from 'node:test';
import assert from 'node:assert/strict';

import { denZPlanu, dnesniDatum, MAX_CVIKU, MAX_JIDEL } from '../coachChatPlanDnes.js';

const PLAN = {
  ok: true,
  days: [
    {
      date: '2026-09-08',
      day_name: 'Úterý',
      workout: { exercises: [{ display_name_cs: 'Dřep', sets: 4, reps: '8-10' }] },
      meals: [],
    },
    {
      date: '2026-09-09',
      day_name: 'Středa',
      daily_target_kcal: 3120.4,
      workout: {
        name: 'Trénink B',
        duration_min: 60,
        exercises: [
          {
            display_name_cs: 'Rumunský mrtvý tah',
            name_cs: 'Rumunský mrtvý tah',
            sets: 3,
            reps: '12-14',
            obtiznost: 'střední',
            easier_key: 'kettlebell_one_legged_deadlift',
            harder_key: 'deadlift',
            gif_url: 'https://static.exercisedb.dev/media/wQ2c4XD.gif',
            canonical_key: 'romanian_deadlift',
            instructions_cs: ['Postav se…', 'Kolena…', 'Nadechni se…'],
          },
        ],
      },
      meals: [
        {
          type: 'breakfast',
          kcal: 478,
          protein_g: 49,
          recipe: {
            title_cs: 'Krůtí snídaňový sendvič s hummusem',
            calories: 478,
            protein_g: 49,
            ingredients: [{ name: 'krůtí prsa', amount: 115, unit: 'g' }],
          },
        },
      ],
    },
  ],
};

test('vybere DNESNI den, ne prvni v poradi', () => {
  const den = denZPlanu(PLAN, '2026-09-09');
  assert.equal(den.datum, '2026-09-09');
  assert.equal(den.den_v_tydnu, 'Středa');
  assert.equal(den.trenink.nazev, 'Trénink B');
  assert.equal(den.trenink.delka_min, 60);
});

test('cvik nese nazev, serie, opakovani a obtiznost', () => {
  const cvik = denZPlanu(PLAN, '2026-09-09').trenink.cviky[0];
  assert.equal(cvik.nazev, 'Rumunský mrtvý tah');
  assert.equal(cvik.serie, 3);
  assert.equal(cvik.opakovani, '12-14');
  assert.equal(cvik.obtiznost, 'střední');
  assert.equal(cvik.ma_lehci_variantu, true);
  assert.equal(cvik.ma_tezsi_variantu, true);
});

test('POSTUPY, GIFY ANI KLICE do kontextu nejdou — to je cela uspora', () => {
  const text = JSON.stringify(denZPlanu(PLAN, '2026-09-09'));
  assert.ok(!text.includes('instructions_cs'), 'postupy cviku patri do aplikace, ne do promptu');
  assert.ok(!text.includes('Postav se'), 'ani obsah postupu');
  assert.ok(!text.includes('gif_url'));
  assert.ok(!text.includes('exercisedb.dev'));
  assert.ok(!text.includes('canonical_key'));
  assert.ok(!text.includes('romanian_deadlift'), 'klice variant jsou uvnitrni, model je nepotrebuje');
  assert.ok(!text.includes('ingredients'), 'suroviny receptu jsou nejvetsi cast dat');
  assert.ok(!text.includes('krůtí prsa'));
});

test('jidlo nese nazev, typ a makra, nic vic', () => {
  const jidlo = denZPlanu(PLAN, '2026-09-09').jidla[0];
  assert.deepEqual(jidlo, {
    nazev: 'Krůtí snídaňový sendvič s hummusem',
    typ: 'breakfast',
    kcal: 478,
    bilkoviny_g: 49,
  });
});

test('denni kalicky cil se zaokrouhli', () => {
  assert.equal(denZPlanu(PLAN, '2026-09-09').denni_cil_kcal, 3120);
});

test('VOLNY DEN se lisi od chybejiciho planu', () => {
  // Bez tohohle rozliseni by TED rekl „trenink nevidim" a uzivatel by hledal
  // chybu tam, kde zadna neni — dnesek je proste volno.
  const plan = { days: [{ date: '2026-09-10', day_name: 'Čtvrtek', workout: null, meals: [] }] };
  const den = denZPlanu(plan, '2026-09-10');
  assert.equal(den.trenink, null);
  assert.equal(den.dnes_je_volny_den, true);
});

test('trenink s prazdnym seznamem cviku je taky volny den', () => {
  const plan = { days: [{ date: '2026-09-10', workout: { exercises: [] } }] };
  assert.equal(denZPlanu(plan, '2026-09-10').dnes_je_volny_den, true);
});

test('den, ktery v planu neni, vraci null — klic se do kontextu vubec neda', () => {
  assert.equal(denZPlanu(PLAN, '2026-09-20'), null);
});

test('prazdny nebo rozbity plan nespadne', () => {
  assert.equal(denZPlanu(null, '2026-09-09'), null);
  assert.equal(denZPlanu({}, '2026-09-09'), null);
  assert.equal(denZPlanu({ days: 'nesmysl' }, '2026-09-09'), null);
});

test('cvik bez nazvu se preskoci, ostatni projdou', () => {
  const plan = {
    days: [{
      date: '2026-09-09',
      workout: { exercises: [{ sets: 3 }, { display_name_cs: 'Klik', sets: 3 }] },
    }],
  };
  const cviky = denZPlanu(plan, '2026-09-09').trenink.cviky;
  assert.equal(cviky.length, 1);
  assert.equal(cviky[0].nazev, 'Klik');
});

test('seznamy se orezavaji na strop — kontext nesmi rust s delkou treninku', () => {
  const plan = {
    days: [{
      date: '2026-09-09',
      workout: {
        exercises: Array.from({ length: 40 }, (_, i) => ({ display_name_cs: `Cvik ${i}` })),
      },
      meals: Array.from({ length: 20 }, (_, i) => ({ recipe: { title_cs: `Jidlo ${i}` } })),
    }],
  };
  const den = denZPlanu(plan, '2026-09-09');
  assert.equal(den.trenink.cviky.length, MAX_CVIKU);
  assert.equal(den.jidla.length, MAX_JIDEL);
});

test('dnesniDatum vraci YYYY-MM-DD v prazske zone', () => {
  // 31. 12. 22:30 UTC uz je v Praze 1. 1. — plan by se jinak vzal ze
  // spatneho dne pokazde mezi 23:00 a pulnoci UTC.
  assert.equal(dnesniDatum(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.match(dnesniDatum(), /^\d{4}-\d{2}-\d{2}$/);
});
