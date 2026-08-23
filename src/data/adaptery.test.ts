// Fixture je doslovny vyrez skutecneho planu z produkce (ai_generated_plans),
// vcetne tvaru recipe a shopping_ingredient_lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { naJidla, naTreninky, naNavyky, naZlozvyky, vyberPlan } from './adaptery.ts';

const DNES = new Date().toISOString().slice(0, 10);

const PLAN = {
  id: 'test-plan',
  is_active: true,
  valid_until: DNES,
  structured_plan_json: {
    targets: { calories_per_day: 3173, protein_g: 234, carbs_g: 337, fat_g: 99 },
    days: [
      {
        date: DNES,
        day_name: 'Pátek',
        day_index: 5,
        daily_target_kcal: 3173,
        workout: {
          workout_name: 'Trénink A',
          duration_minutes: 60,
          start_program_variant: 'A',
          exercises: [
            { name: 'Dřepy', name_cs: 'Dřepy', display_name_cs: 'Dřepy', sets: 3, reps: '14-16', canonical_key: 'squat' },
            { name: 'Prkno', display_name_cs: 'Prkno', sets: 3, reps: '50 s', canonical_key: 'plank' }
          ]
        },
        meals: [
          {
            type: 'breakfast', kcal: 650, protein_g: 23.2, carbs_g: 72, fat_g: 34.3,
            catalog_id: 1015, display_name_cs: 'Avokádovo-banánový toast s arašídovým máslem',
            shopping_ingredient_lines: ['75 g celozrnný chléb', '60 g avokádo'],
            recipe: { id: 1015, title_cs: 'Avokádovo-banánový toast', ingredients: [] }
          },
          { type: 'snack', kcal: 300, protein_g: 10, carbs_g: 30, fat_g: 12, catalog_id: 2, display_name_cs: 'Jogurt s ořechy', shopping_ingredient_lines: ['150 g jogurt'] },
          { type: 'lunch', kcal: 900, protein_g: 60, carbs_g: 90, fat_g: 30, catalog_id: 3, display_name_cs: 'Kuře s rýží', shopping_ingredient_lines: ['200 g kuřecí prsa'] },
          { type: 'snack', kcal: 250, protein_g: 8, carbs_g: 28, fat_g: 9, catalog_id: 4, display_name_cs: 'Banán s máslem', shopping_ingredient_lines: ['1 ks banán'] },
          { type: 'dinner', kcal: 800, protein_g: 55, carbs_g: 60, fat_g: 28, catalog_id: 5, display_name_cs: 'Losos se zeleninou', shopping_ingredient_lines: ['180 g losos'] }
        ]
      }
    ]
  }
};

test('vyberPlan vezme plán, který pokrývá dnešek', () => {
  const stary = { id: 'stary', is_active: true, valid_until: '2020-01-01' };
  assert.equal(vyberPlan([stary, PLAN] as any).id, 'test-plan');
});

test('jídla se mapují na typy podle pořadí svačin', () => {
  const j = naJidla(PLAN);
  assert.equal(j.length, 5);
  assert.deepEqual(j.map((x) => x.type), [
    'Snídaně', 'Dopolední svačina', 'Oběd', 'Odpolední svačina', 'Večeře'
  ]);
});

test('jídlo nese název, makra a suroviny z plánu', () => {
  const [snidane] = naJidla(PLAN);
  assert.equal(snidane.title, 'Avokádovo-banánový toast s arašídovým máslem');
  assert.equal(snidane.calories, 650);
  assert.equal(snidane.protein, 23.2);
  assert.deepEqual(snidane.ingredients, ['75 g celozrnný chléb', '60 g avokádo']);
  assert.equal(snidane.completed, false);
});

test('každé jídlo má čas a nechybí žádný název', () => {
  const j = naJidla(PLAN);
  assert.equal(j.filter((x) => !x.time).length, 0);
  assert.equal(j.filter((x) => !x.title || x.title === 'Jídlo').length, 0);
});

test('trénink se mapuje včetně cviků a dnešního dne', () => {
  const t = naTreninky(PLAN);
  assert.equal(t.length, 1);
  assert.equal(t[0].title, 'Trénink A');
  assert.equal(t[0].durationMin, 60);
  assert.equal(t[0].isToday, true);
  assert.equal(t[0].dayShort, 'Pá');
  assert.equal(t[0].exercises.length, 2);
  assert.equal(t[0].exercises[0].name, 'Dřepy');
  assert.equal(t[0].exercises[0].reps, '14-16');
});

test('nemeřená čísla zůstávají nulová, aby je UI skrylo', () => {
  const t = naTreninky(PLAN);
  assert.equal(t[0].caloriesBurned, 0, 'spálené kalorie generátor nevrací');
  assert.equal(t[0].exercises[0].restSec, 0, 'pauzu generátor nevrací');
  assert.equal(t[0].exercises[0].targetMuscle, '', 'cílový sval generátor nevrací');
});

test('návyky se dělí na pozitivní a zlozvyky a mají české popisky', () => {
  const vstup = [
    { habit_id: 'healthy_diet', is_positive: true, sort_order: 0 },
    { habit_id: 'hydration', is_positive: true, sort_order: 1 },
    { habit_id: 'smoking', is_positive: false, sort_order: 0 }
  ];
  const dobre = naNavyky(vstup as any);
  const spatne = naZlozvyky(vstup as any);
  assert.equal(dobre.length, 2);
  assert.equal(spatne.length, 1);
  assert.equal(dobre[0].title, 'Zdravá strava');
  assert.equal(dobre[1].iconType, 'water');
  assert.equal(spatne[0].title, 'Kouření');
  assert.equal(dobre.filter((h) => h.title === h.id).length, 0, 'žádný návyk bez popisku');
});

test('plán bez struktury nespadne a vrátí prázdno', () => {
  assert.deepEqual(naJidla(null), []);
  assert.deepEqual(naTreninky({ id: 'x' }), []);
  assert.deepEqual(naNavyky(undefined), []);
});

// ------------------------------------------------------------ postup receptu

/** Plán s jedním jídlem; `recipe` odpovídá tvaru z /api/profile. */
function planSReceptem(recipe: unknown) {
  return {
    id: 'p1',
    structured_plan_json: {
      days: [{
        date: new Date().toISOString().slice(0, 10),
        meals: [{ type: 'breakfast', catalog_id: 1, display_name_cs: 'Ovesná kaše', recipe }]
      }]
    }
  };
}

test('postup z katalogu se propíše do jídla', () => {
  const kroky = [
    'V hrnci přiveďte mléko k mírnému varu a vsypte ovesné vločky.',
    'Vařte 5 minut a průběžně míchejte.',
    'Kaši přendejte do misky a ozdobte banánem.'
  ];
  const [jidlo] = naJidla(planSReceptem({ instructions_cs: kroky, prep_minutes: 12 }));

  assert.deepEqual(jidlo.recipe?.instructions, kroky);
  assert.equal(jidlo.recipe?.prepTimeMin, 12);
});

test('jídlo bez postupu nedostane recept, ani prázdný', () => {
  // RecipeModal se ridi pritomnosti `recipe` — kdyz je undefined, sekci
  // vubec nevykresli. Driv tu byly ctyri natvrdo psane vety pro kazde jidlo.
  for (const bezPostupu of [undefined, null, {}, { instructions_cs: [] }, { instructions_cs: ['', ' '] }]) {
    const [jidlo] = naJidla(planSReceptem(bezPostupu));
    assert.equal(jidlo.recipe, undefined, `${JSON.stringify(bezPostupu)} nesmi dat recept`);
  }
});

test('chybějící doba přípravy je null, ne vymyšlených 10 minut', () => {
  const [jidlo] = naJidla(planSReceptem({ instructions_cs: ['Uvař vejce natvrdo.'] }));

  assert.equal(jidlo.recipe?.prepTimeMin, null);
  assert.equal(jidlo.recipe?.instructions.length, 1);
});

test('v postupu nezůstanou prázdné kroky', () => {
  const [jidlo] = naJidla(
    planSReceptem({ instructions_cs: ['Uvař vejce natvrdo.', '', '  ', 'Oloupej je.'] })
  );

  assert.deepEqual(jidlo.recipe?.instructions, ['Uvař vejce natvrdo.', 'Oloupej je.']);
});

/**
 * Kontrakt server ↔ UI. Server čte `prep_minutes_estimated`, zapisuje do plánu
 * `recipe.prep_minutes` a adaptér čte `prep_minutes`. Tři různé názvy v jedné
 * cestě. Testy jednotlivých stran to nezachytí — každá si podstrčí vlastní
 * tvar. Tenhle test jede přes celý řetěz včetně názvu sloupce v `.select()`.
 */
test('doba přípravy projde celým řetězem katalog → plán → UI', async () => {
  const { postupZKatalogu, pridejPostupyDoPlanu, SLOUPCE_KATALOGU_PRO_POSTUP } =
    await import('../../lib/profile/postupyDoPlanu.js');

  // Řádek přesně v tom tvaru, jaký vrací `.select()` v api/profile.js.
  const radekKatalogu = {
    id: 1023,
    instructions_cs: ['Pitu nakrájej na klínky.', 'Avokádo rozmačkej s citronem.'],
    prep_minutes_estimated: 12
  };

  // Sloupce, ze kterých server čte, musí `.select()` opravdu vozit.
  for (const sloupec of ['id', 'instructions_cs', 'prep_minutes_estimated']) {
    assert.ok(
      SLOUPCE_KATALOGU_PRO_POSTUP.includes(sloupec),
      `${sloupec} chybi v SLOUPCE_KATALOGU_PRO_POSTUP`
    );
  }

  const postup = postupZKatalogu(radekKatalogu);
  assert.ok(postup, 'radek s kroky musi dat postup');

  const plany = [{
    id: 'p1',
    structured_plan_json: {
      days: [{
        date: DNES,
        meals: [{ type: 'breakfast', catalog_id: 1023, display_name_cs: 'Pita s avokádem' }]
      }]
    }
  }];
  assert.equal(pridejPostupyDoPlanu(plany, new Map([['1023', postup]])), 1);

  const [jidlo] = naJidla(plany[0]);
  assert.equal(jidlo.recipe?.prepTimeMin, 12, 'doba pripravy se ztratila po ceste');
  assert.deepEqual(jidlo.recipe?.instructions, radekKatalogu.instructions_cs);
});

test('nákupní seznam sečte stejnou surovinu napříč jídly', async () => {
  const { naNakupniSeznam } = await import('./adaptery.ts');
  const plan = {
    structured_plan_json: {
      days: [
        { date: DNES, meals: [
          { shopping_ingredient_lines: ['75 g celozrnný chléb', '60 g avokádo'] },
          { shopping_ingredient_lines: ['200 g kuřecí prsa'] }
        ] },
        { date: '2026-01-02', meals: [
          { shopping_ingredient_lines: ['25 g celozrnný chléb', '1 ks banán'] }
        ] }
      ]
    }
  };
  const s = naNakupniSeznam(plan);
  const chleb = s.find((p) => p.name.includes('chléb'));
  assert.equal(chleb?.amount, '100 g', '75 g + 25 g se sečte');
  assert.equal(chleb?.category, 'Přílohy & Pečivo');
  assert.equal(s.find((p) => p.name.includes('kuřecí'))?.category, 'Maso & Ryby');
  assert.equal(s.find((p) => p.name.includes('banán'))?.category, 'Zelenina & Ovoce');
  assert.equal(s.every((p) => p.checked === false), true);
});

test('nákupní seznam z prázdného plánu je prázdný', async () => {
  const { naNakupniSeznam } = await import('./adaptery.ts');
  assert.deepEqual(naNakupniSeznam(null), []);
});


// ------------------------------------------------- nákupní seznam (Etapa 4.1)
//
// Vzorky jsou doslovné řádky z produkčního nákupního seznamu 23. 8. 2026,
// včetně vad, které v uložených plánech zůstaly zmražené.

test('rozbor řádku zvládne všechny tvary, které v uložených plánech jsou', async () => {
  const { rozeberRadekSuroviny } = await import('./adaptery.ts');

  // Dnešní tvar.
  assert.deepEqual(rozeberRadekSuroviny('150 g ananas'),
    { nazev: 'ananas', mnozstvi: 150, jednotka: 'g' });

  // Starší plány psaly množství až za název.
  assert.deepEqual(rozeberRadekSuroviny('olivový olej 0.9 lžíce'),
    { nazev: 'olivový olej', mnozstvi: 0.9, jednotka: 'lžíce' });

  // Bez jednotky.
  assert.deepEqual(rozeberRadekSuroviny('3× vejce'),
    { nazev: 'vejce', mnozstvi: 3, jednotka: 'ks' });

  // Zlomek znakem.
  const pul = rozeberRadekSuroviny('½ lžičky cukru');
  assert.equal(pul?.mnozstvi, 0.5);
  assert.equal(pul?.nazev, 'cukru');

  // Bez množství — a to je v pořádku, není to chyba.
  assert.deepEqual(rozeberRadekSuroviny('sůl dle chuti'),
    { nazev: 'sůl dle chuti', mnozstvi: null, jednotka: '' });
});

test('rozseknutý zlomek se nepoužije jako množství', async () => {
  const { rozeberRadekSuroviny } = await import('./adaptery.ts');

  // Pozustatek po stare cistici regularce nad anglickym `original`.
  assert.equal(rozeberRadekSuroviny('1 /'), null);
  assert.equal(rozeberRadekSuroviny('1 /2 lžičky cukru')?.mnozstvi, null);
  assert.equal(rozeberRadekSuroviny('1 /2 lžičky cukru')?.nazev, 'lžičky cukru');
});

test('stejná surovina se sečte, nespojí do řetězce', async () => {
  const { naNakupniSeznam } = await import('./adaptery.ts');

  const plan = {
    structured_plan_json: {
      days: [
        { date: DNES, meals: [
          { shopping_ingredient_lines: ['olivový olej 0.9 lžíce', '150 g ananas'] },
          { shopping_ingredient_lines: ['olivový olej 0.9 lžíce'] }
        ] },
        { date: '2026-01-02', meals: [
          { shopping_ingredient_lines: ['olivový olej 0.9 lžíce', '50 g ananas'] }
        ] }
      ]
    }
  };

  const seznam = naNakupniSeznam(plan);
  const olej = seznam.find((p) => p.name === 'olivový olej');
  const ananas = seznam.find((p) => p.name === 'ananas');

  // Driv tu bylo „olivový olej 0.9 lžíce, olivový olej 0.9 lžíce, olivový olej 0.9 lžíce".
  assert.equal(olej?.amount, '2,7 lžíce');
  assert.equal(ananas?.amount, '200 g');
  assert.equal(seznam.length, 2, 'stejna surovina se nesmi rozpadnout na vic polozek');
});

test('surovina bez množství nemá v množství svoje jméno', async () => {
  const { naNakupniSeznam } = await import('./adaptery.ts');

  const plan = {
    structured_plan_json: {
      days: [
        { date: DNES, meals: [{ shopping_ingredient_lines: ['mandle', 'mandle'] }] },
        { date: '2026-01-02', meals: [{ shopping_ingredient_lines: ['mandle'] }] }
      ]
    }
  };

  const [polozka] = naNakupniSeznam(plan);
  // Driv: „mandle, mandle, mandle" ve sloupci pro mnozstvi.
  assert.equal(polozka.name, 'mandle');
  assert.equal(polozka.amount, '');
});

test('nesečitatelné jednotky se vypíšou vedle sebe, ale jen jednou', async () => {
  const { naNakupniSeznam } = await import('./adaptery.ts');

  const plan = {
    structured_plan_json: {
      days: [{ date: DNES, meals: [
        { shopping_ingredient_lines: ['150 g rajčata', '2 ks rajčata', '2 ks rajčata'] }
      ] }]
    }
  };

  const [polozka] = naNakupniSeznam(plan);
  assert.equal(polozka.amount, '150 g + 2 ks');
});
