// Změna dnešního tréninku — „mám jen 15 minut", „dnes to nedám v posilovně".
//
// Endpointy replace-today / confirm-replacement / restore-today byly hotové
// od začátku, ale v aplikaci na ně nevedlo tlačítko. Test hlídá, že cesta
// k nim existuje a že si UI nedrží vlastní kopii pravidel výběru partií.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const MODAL = cti('src/components/ZmenitDnesniTrenink.tsx');
const TRENINK = cti('src/components/WorkoutSection.tsx');
const APP = cti('src/App.tsx');

test('trénink dne jde změnit z aplikace, ne jen přes API', () => {
  assert.match(TRENINK, /import \{ ZmenitDnesniTrenink \}/, 'sekce modal neimportuje');
  assert.match(TRENINK, /<ZmenitDnesniTrenink/, 'sekce modal nekreslí');
  assert.match(APP, /onPlanZmenen=\{znovuNacistProfil\}/, 'App po změně plán znovu nenačte');
});

test('modal volá všechny tři kroky, které server nabízí', () => {
  for (const cesta of [
    '/api/workout/replace-today',
    '/api/workout/confirm-replacement',
    '/api/workout/restore-today',
  ]) {
    assert.ok(MODAL.includes(cesta), `chybí volání ${cesta}`);
  }
});

test('pravidla výběru partií se sdílejí se serverem, nekopírují', () => {
  // Vlastní kopie presetů by se při první úpravě rozešla a uživatel by
  // dostal odmítnutí až po odeslání.
  assert.match(MODAL, /from '@lib\/workoutMuscleGroupRules\.js'/, 'preset se neimportuje z lib');
  assert.match(MODAL, /from '@lib\/workoutTrainingSetup\.js'/, 'místo a vybavení se neimportuje z lib');
  assert.match(MODAL, /getMaxMuscleGroupsForDuration/, 'limit partií na délku se nepoužívá');
  assert.ok(
    !/'chest_triceps'|'back_biceps'/.test(MODAL),
    'presety jsou natvrdo v UI místo importu z lib'
  );
});

test('tlačítko se nenabízí tam, kde server změnu odmítne', () => {
  // 400 u dne bez tréninku, 409 u odcvičeného. Tlačítko, které skončí
  // chybou, je horší než žádné.
  assert.match(TRENINK, /maDnesTrenink && todayWorkout\.isToday && !todayWorkout\.isCompleted/, 'chybí podmínka na dnešek a nedokončený trénink');
  assert.match(TRENINK, /todayWorkout\.planId && todayWorkout\.planDay != null/, 'chybí kontrola plan_id a plan_day');
});

test('modal umí říct, proč server změnu odmítl', () => {
  assert.match(MODAL, /429/, 'chybí hláška k limitu návrhů na den');
  assert.match(MODAL, /409/, 'chybí hláška k už odcvičenému tréninku');
});

test('dialog jde zavřít klávesnicí, ale ne uprostřed zápisu', () => {
  assert.match(MODAL, /role="dialog"/, 'chybí role dialogu');
  assert.match(MODAL, /aria-modal="true"/, 'chybí aria-modal');
  assert.match(MODAL, /e\.key === 'Escape' && !pracuji/, 'Escape zavírá i během odesílání');
});
