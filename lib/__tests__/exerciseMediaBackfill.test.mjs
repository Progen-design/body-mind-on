import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maMedium,
  vyberRadkyBezMedia,
  wgerHledaciTermProRadek,
  wgerObrazekZVysledku,
} from '../exerciseMediaBackfill.js';

test('vyberRadkyBezMedia vybere jen řádky bez gif_url, image_url i wger_exercise_image_url', () => {
  const radky = [
    { canonical_key: 'squat', gif_url: 'https://static.exercisedb.dev/media/a.gif', image_url: null, wger_exercise_image_url: null },
    { canonical_key: 'bench_press', gif_url: null, image_url: 'https://wger.de/x.jpg', wger_exercise_image_url: null },
    { canonical_key: 'box_jump', gif_url: null, image_url: null, wger_exercise_image_url: 'https://wger.de/y.jpg' },
    { canonical_key: 'face_pull', gif_url: null, image_url: null, wger_exercise_image_url: null },
    { canonical_key: 'dips', gif_url: '', image_url: '', wger_exercise_image_url: '' },
    { canonical_key: 'step_up', gif_url: '   ', image_url: undefined, wger_exercise_image_url: null },
  ];

  const vybrane = vyberRadkyBezMedia(radky);
  assert.deepEqual(vybrane.map((r) => r.canonical_key), ['face_pull', 'dips', 'step_up']);
});

test('vyberRadkyBezMedia na prázdném poli vrátí prázdné pole', () => {
  assert.deepEqual(vyberRadkyBezMedia([]), []);
  assert.deepEqual(vyberRadkyBezMedia(undefined), []);
});

test('maMedium: whitespace řetězec se počítá jako prázdný', () => {
  assert.equal(maMedium({ gif_url: '   ' }), false);
  assert.equal(maMedium({ image_url: 'https://x' }), true);
});

test('wgerHledaciTermProRadek: přednost má wger_search_name z canonical mapy', () => {
  const getCanonicalExercise = (k) => (k === 'squat' ? { wger_search_name: 'squat' } : null);
  const term = wgerHledaciTermProRadek(
    { canonical_key: 'squat', display_name_cs: 'Dřepy', exercisedb_name: 'ignore me' },
    getCanonicalExercise
  );
  assert.equal(term, 'squat');
});

test('wgerHledaciTermProRadek: bez definice v mapě padá na exercisedb_name', () => {
  const getCanonicalExercise = () => null;
  const term = wgerHledaciTermProRadek(
    { canonical_key: 'box_jump', display_name_cs: 'Výskok na bednu', exercisedb_name: 'box jump' },
    getCanonicalExercise
  );
  assert.equal(term, 'box jump');
});

test('wgerHledaciTermProRadek: bez exercisedb_name padá na display_name_cs', () => {
  const getCanonicalExercise = () => null;
  const term = wgerHledaciTermProRadek(
    { canonical_key: 'face_pull', display_name_cs: 'Face pull', exercisedb_name: null },
    getCanonicalExercise
  );
  assert.equal(term, 'Face pull');
});

test('wgerHledaciTermProRadek: úplně bez dat padá na canonical_key s podtržítky jako mezerami', () => {
  const getCanonicalExercise = () => null;
  const term = wgerHledaciTermProRadek(
    { canonical_key: 'tricep_dip', display_name_cs: null, exercisedb_name: null },
    getCanonicalExercise
  );
  assert.equal(term, 'tricep dip');
});

test('wgerObrazekZVysledku: vrátí image_url, jinak gif_url, jinak null (nikdy prázdný řetězec)', () => {
  assert.equal(wgerObrazekZVysledku({ image_url: 'https://a', gif_url: 'https://b' }), 'https://a');
  assert.equal(wgerObrazekZVysledku({ image_url: null, gif_url: 'https://b' }), 'https://b');
  assert.equal(wgerObrazekZVysledku({ image_url: null, gif_url: null }), null);
  assert.equal(wgerObrazekZVysledku(null), null);
  assert.equal(wgerObrazekZVysledku({ image_url: '   ' }), null);
});
