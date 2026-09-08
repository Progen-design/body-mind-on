// Export & Tisk (PDF) musí nést i trénink dne — postup a obtížnost, ne jen
// jídelníček. Den volna (žádné cviky) sekci prostě nemá, není to chyba.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');

test('ExportMealPlanModal kreslí sekci "Trénink dne" jen když jsou cviky, s postupem a obtížností', () => {
  const modal = fs.readFileSync(path.join(KOREN, 'src', 'components', 'ExportMealPlanModal.tsx'), 'utf8');

  assert.match(modal, /exercises\?: ExerciseItem\[\]/, 'exercises je nepovinný prop, den volna nemá cviky vůbec');
  assert.match(modal, /\{exercises\.length > 0 && \(/, 'sekce se kreslí jen s cviky — žádná prázdná "Trénink dne"');
  assert.match(modal, /ex\.postup && ex\.postup\.length > 0 && \(/, 'postup se tiskne stejným pravidlem jako u jídel — bez kroků nic');
  assert.match(modal, /ex\.obtiznost && `/, 'obtížnost se tiskne, jen když ji cvik má');
  assert.match(modal, /className="cvik /, 'cvik má stejnou break-inside třídu jako .jidlo, ať se nerozpadne přes stránku');
});

test('tiskový styl (@media print) hlídá i .cvik, ne jen .jidlo', () => {
  const css = fs.readFileSync(path.join(KOREN, 'src', 'index.css'), 'utf8');
  const printBlok = css.slice(css.indexOf('@media print'));
  assert.match(printBlok, /\.jidlo,\s*\n\s*#tiskovy-dokument \.cvik/, 'break-inside: avoid musí platit i pro cviky');
});

test('App.tsx posílá do exportu dnešní trénink (todayWorkout.exercises), ne prázdné pole natvrdo', () => {
  const appTsx = fs.readFileSync(path.join(KOREN, 'src', 'App.tsx'), 'utf8');
  assert.match(appTsx, /exercises=\{todayWorkout\.exercises\}/);
});
