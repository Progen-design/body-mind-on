// PROMPT_UX_DNES.md bod F — karta cviku se pod `sm` rozpadala: odznak
// "4 × 6–8" a tlačítko "Jak na to" se lámaly do tří řádků, protože vnější
// řádek byl vodorovný flex bez zalomení.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const WORKOUT = cti('src/components/WorkoutSection.tsx');

test('karta cviku je pod sm svislá — flex-col, ne flex bez zalomení', () => {
  const zacatek = WORKOUT.indexOf('onToggleExercise(selectedWorkout.dayName, ex.id)');
  assert.ok(zacatek > -1, 'řádek s onToggleExercise chybí');
  const blok = WORKOUT.slice(zacatek, zacatek + 800);
  assert.match(blok, /flex flex-col sm:flex-row sm:items-center sm:justify-between/, 'karta cviku není pod sm svislá');
});

test('tlačítko "Jak na to" se nikdy nezalomí — whitespace-nowrap a shrink-0', () => {
  const zacatek = WORKOUT.indexOf('Ukázat provedení cviku');
  assert.ok(zacatek > -1, 'tlačítko Jak na to chybí');
  const blok = WORKOUT.slice(Math.max(0, zacatek - 700), zacatek + 100);
  assert.match(blok, /shrink-0 whitespace-nowrap/, 'tlačítko nemá shrink-0 + whitespace-nowrap');
});
