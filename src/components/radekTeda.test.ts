// Řádek TEDa — PROMPT_DNES_HERO.md bod 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const RADEK = cti('src/components/RadekTeda.tsx');

test('bez zprávy a bez chatu se karta vůbec nekreslí; bez chatu nemá tlačítko', () => {
  assert.match(RADEK, /if \(!tip && !dostupny\) return null;/, 'chybí guard na prázdné tips bez chatu');
  assert.match(RADEK, /\{dostupny && \(/, 'tlačítko se kreslí, i když chat neexistuje');
  assert.match(RADEK, /Napsat TEDovi/, 'chybí tlačítko Napsat TEDovi');
});

test('žádné nové volání AI — jen existující coachTips a otevření chatu', () => {
  // Ne holé „openai" (to je legitimně v komentáři, proč se to takhle dělá) —
  // kontroluje se, že řádek nemá VLASTNÍ apiFetch/import navíc k otevření
  // chatu. Data (`tips`) dostává hotová jako prop, žádná nemá vlastní fetch.
  assert.ok(!/apiFetch/.test(RADEK), 'řádek TEDa si sám něco fetchuje — má jen dostat hotová `tips` jako prop');
  const importRadky = RADEK.split('\n').filter((r) => r.trim().startsWith('import'));
  assert.ok(!importRadky.some((r) => /openai/i.test(r)), 'importuje OpenAI klienta přímo místo otevření existujícího chatu');
  assert.match(RADEK, /useTed/, 'chybí napojení na CoachChatModal přes TedContext');
  assert.match(RADEK, /zeptejSe\(\)/, 'tlačítko nevolá zeptejSe()');
});
