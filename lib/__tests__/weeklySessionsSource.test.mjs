/**
 * Frekvence tréninků: zdroj pravdy je VOLBA UŽIVATELE, ne dopočet.
 *
 * REGRESE Z 18. 8. 2026. Sloupec `body_metrics.weekly_sessions` nepíše
 * aplikace, ale databázový trigger `bm_fill_calculated_fields`. Ten mapuje
 * `freq_choice` slovníkem '0-1' / '2-3' / '4plus', jenže registrace ukládá
 * „2-3x týdně“ a „4-5x týdně“ — nic z toho se netrefí a trigger spadne na
 * náhradu ODVOZENOU ZE STRESU (low→5, medium→4, high→3).
 *
 * Změřeno: účet se `stress_level='medium'` a volbou „4-5x týdně“ má
 * `weekly_sessions_user = 5`, ale `weekly_sessions = 4`. Ondra (25b7017a)
 * má `weekly_sessions = 5` proti čtyřem dnům ve `workout_days`.
 * Plán se tím stavěl na frekvenci, kterou uživatel nikdy nezvolil.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeeklySessions } from '../preferenceConstants.js';
import { bodyMetricsToPlanInput } from '../bodyMetricsToPlanInput.js';

test('volba uživatele přebije hodnotu dopočtenou triggerem', () => {
  // Přesně stav z produkce: trigger zapsal 4 (ze stresu), uživatel zvolil 5.
  const bm = {
    weekly_sessions_user: 5,
    weekly_sessions: 4,
    freq_choice: '4-5x týdně',
    stress_level: 'medium',
    workout_days: '1,2,3,5,6',
    goal: 'nabirani_svaly',
    weight_kg: 95,
  };
  const vstup = bodyMetricsToPlanInput(bm);
  assert.equal(vstup.workouts_per_week, 5,
    `plán dostal ${vstup.workouts_per_week}, ale uživatel zaškrtl 5`);
});

test('nesoulad sessions × workout_days: rozhoduje volba, ne počet dnů', () => {
  // Ondrův stav: volba 5, ale ve workout_days jsou jen 4 dny.
  const bm = {
    weekly_sessions_user: 5,
    weekly_sessions: 5,
    freq_choice: '4-5x týdně',
    workout_days: '1,2,4,5',
    goal: 'nabirani_svaly',
    weight_kg: 92,
  };
  const vstup = bodyMetricsToPlanInput(bm);
  assert.equal(vstup.workouts_per_week, 5, 'počet dnů nesmí přebít volbu');
  assert.equal(vstup.preferred_workout_days.length, 4, 'dny zůstávají, jak je uživatel zadal');
});

test('getWeeklySessions čte holé číslo doslova', () => {
  // „5x tydne“ dřív propadlo na výchozí 3, protože se testovalo jen '1','2','4'.
  assert.equal(getWeeklySessions('5x tydne'), 5);
  assert.equal(getWeeklySessions('4x tydne'), 4);
  assert.equal(getWeeklySessions(5), 5);
  assert.equal(getWeeklySessions('6'), 6);
});

test('rozsahy zůstávají na horní hranici — původní chování', () => {
  assert.equal(getWeeklySessions('2-3x týdně'), 3);
  assert.equal(getWeeklySessions('4-5x týdně'), 5);
  assert.equal(getWeeklySessions('0-1'), 1);
  assert.equal(getWeeklySessions('4plus'), 5);
});

test('prázdná a nesmyslná volba padá na 3, ne na nulu', () => {
  assert.equal(getWeeklySessions(null), 3);
  assert.equal(getWeeklySessions(''), 3);
  assert.equal(getWeeklySessions('nevim'), 3);
});
