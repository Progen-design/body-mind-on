// docs/DALSI_KROK.md 9.8 — jídelníček má přepínač dnů jako trénink.
//
// Jádro bodu: karta „Denní příjem & Makronutrienty" počítá VYBRANÝ den,
// ne pořád dnešek — jinak přepínač lže. K tomu řazení Po–Ne (dny plánu
// chodí v pořadí valid_from, klidně od čtvrtka) a dlaždice dne bez jídel
// se chová jako „Volno" u tréninku.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  pocetJidelSlovy,
  seradDnyPoNe,
  souhrnDneJidel,
  vybranyDenJidel
} from './jidelnicekDny.ts';
import type { TydenniDenJidel } from '../data/adaptery.ts';
import type { MealItem } from '../types.ts';

function jidlo(cast: Partial<MealItem>): MealItem {
  return {
    id: 'r1', type: 'Oběd', time: '12:00', title: 'Jídlo',
    calories: 500, protein: 30, carbs: 50, fat: 15,
    ingredients: [], completed: false,
    ...cast
  } as MealItem;
}

function den(cast: Partial<TydenniDenJidel>): TydenniDenJidel {
  return { datum: '2026-09-07', denNazev: 'Pondělí', jeDnes: false, meals: [], ...cast };
}

test('dny se řadí Po–Ne, i když plán začíná ve čtvrtek', () => {
  const dny = [
    den({ datum: '2026-09-03', denNazev: 'Čtvrtek' }),
    den({ datum: '2026-09-04', denNazev: 'Pátek' }),
    den({ datum: '2026-09-07', denNazev: 'Pondělí', jeDnes: true }),
    den({ datum: '2026-09-05', denNazev: 'Sobota' })
  ];
  assert.deepEqual(seradDnyPoNe(dny).map(d => d.denNazev), ['Pondělí', 'Čtvrtek', 'Pátek', 'Sobota']);
  // Vstup zůstává netknutý — řadí se kopie.
  assert.equal(dny[0].denNazev, 'Čtvrtek');
});

test('vybraný den: kliknuté datum, jinak dnešek, jinak první', () => {
  const dny = [
    den({ datum: '2026-09-07', denNazev: 'Pondělí' }),
    den({ datum: '2026-09-08', denNazev: 'Úterý', jeDnes: true })
  ];
  assert.equal(vybranyDenJidel(dny, '2026-09-07')?.denNazev, 'Pondělí');
  assert.equal(vybranyDenJidel(dny, null)?.denNazev, 'Úterý');
  // Datum, které v plánu není (po přegenerování), spadne na dnešek — stejný
  // důvod, proč WorkoutSection neukládá vybraný den natrvalo.
  assert.equal(vybranyDenJidel(dny, '2020-01-01')?.denNazev, 'Úterý');
  assert.equal(vybranyDenJidel([], null), null);
});

test('souhrn dne počítá TEN den: plán celý, snědené jen odškrtnuté', () => {
  const d = den({
    meals: [
      jidlo({ calories: 600, protein: 40, carbs: 60, fat: 20, completed: true }),
      jidlo({ calories: 500, protein: 30, carbs: 50, fat: 15, completed: false })
    ]
  });
  const s = souhrnDneJidel(d);
  assert.equal(s.kcalPlan, 1100, 'dlaždice ukazuje velikost plánu dne, jako 60m u tréninku');
  assert.equal(s.kcalSnedeno, 600, 'karta makro ukazuje jen snědené');
  assert.equal(s.bilkovinyG, 40);
  assert.equal(s.sacharidyG, 60);
  assert.equal(s.tukyG, 20);
  assert.equal(s.vseSplneno, false);

  const hotovy = den({ meals: [jidlo({ completed: true })] });
  assert.equal(souhrnDneJidel(hotovy).vseSplneno, true);

  const prazdny = souhrnDneJidel(den({}));
  assert.equal(prazdny.maJidla, false);
  assert.equal(prazdny.vseSplneno, false, 'den bez jídel není „splněný", je neklikací');
  assert.equal(souhrnDneJidel(null).maJidla, false);
});

test('počet jídel česky: 1 jídlo, 3 jídla, 5 jídel, bez jídel', () => {
  assert.equal(pocetJidelSlovy(0), 'Bez jídel');
  assert.equal(pocetJidelSlovy(1), '1 jídlo');
  assert.equal(pocetJidelSlovy(3), '3 jídla');
  assert.equal(pocetJidelSlovy(5), '5 jídel');
});

// ── Tvar komponent: pruh je SDÍLENÝ a odškrtává se jen dnešek ────────────────

const KOREN = path.join(import.meta.dirname, '..', '..');
const workoutSection = fs.readFileSync(path.join(KOREN, 'src', 'components', 'WorkoutSection.tsx'), 'utf8');
const nutritionSection = fs.readFileSync(path.join(KOREN, 'src', 'components', 'NutritionSection.tsx'), 'utf8');

test('pruh dnů je vytažený do sdílené komponenty, ne opsaný', () => {
  // Obě sekce kreslí dlaždice přes PruhDnu…
  assert.match(workoutSection, /<PruhDnu/);
  assert.match(nutritionSection, /<PruhDnu/);
  // …a mřížka dlaždic žije JEN v něm. Dvě kopie by se rozešly při první
  // změně vzhledu, přesně jako formát data v 9.4.
  assert.doesNotMatch(workoutSection, /grid-cols-2 sm:grid-cols-4 lg:grid-cols-7/);
  assert.doesNotMatch(nutritionSection, /grid-cols-2 sm:grid-cols-4 lg:grid-cols-7/);
  const pruh = fs.readFileSync(path.join(KOREN, 'src', 'components', 'PruhDnu.tsx'), 'utf8');
  assert.match(pruh, /grid-cols-2 sm:grid-cols-4 lg:grid-cols-7/);
});

test('jídla jiného dne než dneška se neodškrtávají — checkbox je neaktivní', () => {
  assert.match(nutritionSection, /disabled=\{!jeDnesek\}/);
  assert.match(nutritionSection, /jeDnesek \? \(\) => onToggleMeal\(meal\) : undefined/);
  // Hláška o prohlížení jiného dne + návrat, stejně jako u tréninku.
  assert.match(nutritionSection, /zpět na dnešek/);
  assert.match(workoutSection, /zpět na dnešek/);
});
