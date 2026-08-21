/**
 * Slovník českých názvů cviků.
 *
 * Testy hlídají hlavně BRÁNU, ne úspěšné překlady: nejdražší chyba tady není
 * neexistující název, ale název, který dává smysl a je špatně. Uživatel ho
 * nemá jak poznat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nazevCviku } from '../exerciseNameCs.js';

test('složí jádro, polohu, vybavení a variantu ve správném pořadí', () => {
  assert.equal(nazevCviku('Seated Dumbbell Shoulder Press').nazev,
    'Tlak nad hlavu vsedě s jednoručkami');
  assert.equal(nazevCviku('Barbell Bench Press').nazev,
    'Tlak na lavici s velkou činkou');
  assert.equal(nazevCviku('Alternate Incline Dumbbell Curl').nazev,
    'Bicepsový zdvih na šikmé lavici s jednoručkami střídavě');
});

test('delší fráze vyhrává nad kratší', () => {
  // Kdyby se „incline bench press“ rozpadlo na „bench press“ + volné „incline“,
  // vznikl by „Tlak na lavici na šikmé lavici“.
  assert.equal(nazevCviku('Incline Bench Press').nazev, 'Tlak na šikmé lavici');
});

test('vybavení už obsažené v jádru se neopakuje', () => {
  // Regrese: „Cable Crossover“ dávalo „Stahování kladek na kladce“.
  assert.equal(nazevCviku('Cable Crossover').nazev, 'Stahování kladek');
});

test('„bent“ znamená předklon jen ve spojení „bent over“', () => {
  // Regrese: „Bent-Knee Hip Raise“ dávalo „Zvedání pánve v předklonu“, což je
  // jiný cvik než ten na obrázku.
  assert.equal(nazevCviku('Bent Over Barbell Row').nazev,
    'Přítahy v předklonu s velkou činkou');
  assert.equal(nazevCviku('Bent-Knee Hip Raise').nazev,
    'Zvedání pánve s pokrčenými koleny');
});

test('neznámé slovo cvik zahodí, nedomýšlí se', () => {
  const r = nazevCviku('Zercher Kroc Carry');
  assert.equal(r.nazev, null);
  assert.ok(r.nezname.length > 0, 'má vypsat, co neumí');
});

test('obecné jádro bez upřesnění neprojde', () => {
  // „Body Tricep Press“ by dalo holý „Tlak“ — to uživateli nic neřekne.
  assert.equal(nazevCviku('Body Tricep Press').nazev, null);
  // S upřesněním je stejné jádro v pořádku.
  assert.equal(nazevCviku('Alternating Kettlebell Press').nazev,
    'Tlak s kettlebellem střídavě');
});

test('prázdný vstup neprojde', () => {
  assert.equal(nazevCviku('').nazev, null);
  assert.equal(nazevCviku(null).nazev, null);
});

/**
 * Anglická slova, která se do českého názvu nesmí dostat. Nejde o úplný
 * seznam — stačí ta nejčastější, protože kdyby překlad protekl, protekla by
 * s ním celá fráze, ne jedno vzácné slovo.
 */
const ANGLICKE_ZBYTKY = [
  'dumbbell', 'barbell', 'cable', 'machine', 'bench', 'press', 'curl', 'row',
  'squat', 'raise', 'seated', 'standing', 'lying', 'incline', 'grip', 'arm',
  'leg', 'pull', 'push', 'with', 'the', 'extension', 'deadlift', 'shoulder',
];

test('do českého názvu neprosákne anglické slovo', () => {
  const vzorky = [
    'Barbell Squat', 'Dumbbell Lunges', 'Seated Cable Rows', 'Standing Calf Raises',
    'Hammer Curls', 'Romanian Deadlift', 'Push Ups', 'Hanging Leg Raise',
    'Close-Grip Bench Press', 'One Arm Dumbbell Row', 'Wide-Grip Lat Pulldown',
  ];
  for (const v of vzorky) {
    const { nazev } = nazevCviku(v);
    if (!nazev) continue;
    const slova = nazev.toLowerCase().split(/[^a-zěščřžýáíéúůňťďó]+/i).filter(Boolean);
    for (const zbytek of ANGLICKE_ZBYTKY) {
      assert.ok(!slova.includes(zbytek), `„${v}“ → „${nazev}“ obsahuje anglické „${zbytek}“`);
    }
  }
});
