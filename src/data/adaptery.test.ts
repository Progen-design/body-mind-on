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
