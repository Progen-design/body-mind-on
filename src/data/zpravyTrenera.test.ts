// Banner trenera bere zpravy z ai_messages, ne ze seedu.
// Driv tam svitil natvrdo psany text "pri vaze 104,6 kg klesl tuk na 11,6 %,
// +2,7 kg svalu" — skutecna vaha je 103,0 kg a tuk 12,9 %.
import test from 'node:test';
import assert from 'node:assert/strict';

import { naZpravyTrenera } from './adaptery.ts';

// Tvar overeny proti produkci: vsech 9 zprav ma task_type onboarding_message,
// titulek i obsah (268-444 znaku).
const ZE_SERVERU = [
  {
    id: 'a1',
    title: 'Vítej v programu',
    content: 'Tvůj plán je připravený, začni prvním tréninkem.',
    created_at: '2026-08-21T16:37:18Z',
    task_type: 'onboarding_message'
  }
];

test('zpráva ze serveru se namapuje na banner', () => {
  const t = naZpravyTrenera({ coach_messages: ZE_SERVERU } as never);

  assert.equal(t.length, 1);
  assert.equal(t[0].id, 'a1');
  assert.equal(t[0].headline, 'Vítej v programu');
  assert.match(t[0].content, /^Tvůj plán/);
  assert.ok(t[0].timestamp, 'chybi cas vzniku zpravy');
});

test('bez zpráv je pole prázdné a banner se nezobrazí', () => {
  // Platny stav, ne chyba napojeni: ai_trigger_rules ma zapnute jen
  // user_registered -> initial_plan, takze nove coach zpravy nevznikaji.
  assert.deepEqual(naZpravyTrenera({} as never), []);
  assert.deepEqual(naZpravyTrenera({ coach_messages: [] } as never), []);
});

test('zpráva bez obsahu se zahodí, ne zobrazí prázdná', () => {
  const t = naZpravyTrenera({
    coach_messages: [
      { id: '1', title: 'Titulek', content: '   ', created_at: '2026-08-21T16:00:00Z' },
      { id: '2', title: 'Titulek', content: null, created_at: '2026-08-21T16:00:00Z' },
      ...ZE_SERVERU
    ]
  } as never);

  assert.equal(t.length, 1);
  assert.equal(t[0].id, 'a1');
});

test('chybějící titulek nezpůsobí prázdný nadpis', () => {
  const t = naZpravyTrenera({
    coach_messages: [{ id: '3', title: null, content: 'Něco k tréninku.', created_at: '2026-08-21T16:00:00Z' }]
  } as never);

  assert.equal(t[0].headline, 'Zpráva od trenéra');
});

test('kategorie se nedopočítává z task_type', () => {
  // Mapovat onboarding_message na "regenerace / vyziva / vykon / kompozice"
  // by znamenalo tvrdit neco, co v datech neni.
  const t = naZpravyTrenera({ coach_messages: ZE_SERVERU } as never) as Record<string, unknown>[];
  assert.equal('category' in t[0], false);
});

test('pořadí ze serveru zůstává (nejnovější první)', () => {
  const t = naZpravyTrenera({
    coach_messages: [
      { id: 'nova', title: 'A', content: 'A', created_at: '2026-08-21T16:00:00Z' },
      { id: 'stara', title: 'B', content: 'B', created_at: '2026-06-01T10:00:00Z' }
    ]
  } as never);

  assert.deepEqual(t.map((z) => z.id), ['nova', 'stara']);
});
