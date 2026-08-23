// Banner trenera bere zpravy z ai_messages, ne ze seedu.
// Driv tam svitil natvrdo psany text "pri vaze 104,6 kg klesl tuk na 11,6 %,
// +2,7 kg svalu" — skutecna vaha je 103,0 kg a tuk 12,9 %.
import test from 'node:test';
import assert from 'node:assert/strict';

import { naZpravyTrenera, PLATNOST_ZPRAVY_DNI } from './adaptery.ts';

/**
 * Data se pocitaji ode dneska, ne natvrdo.
 *
 * Pevne datum by test drzelo jen do konce platnosti zpravy — po tydnu by
 * zacal padat sam od sebe a nikdo by nevedel proc.
 */
function predDny(dnu: number): string {
  return new Date(Date.now() - dnu * 24 * 60 * 60 * 1000).toISOString();
}

const NEDAVNO = predDny(1);

// Tvar overeny proti produkci: vsech 9 zprav ma task_type onboarding_message,
// titulek i obsah (268-444 znaku).
const ZE_SERVERU = [
  {
    id: 'a1',
    title: 'Vítej v programu',
    content: 'Tvůj plán je připravený, začni prvním tréninkem.',
    created_at: NEDAVNO,
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
      { id: '1', title: 'Titulek', content: '   ', created_at: NEDAVNO },
      { id: '2', title: 'Titulek', content: null, created_at: NEDAVNO },
      ...ZE_SERVERU
    ]
  } as never);

  assert.equal(t.length, 1);
  assert.equal(t[0].id, 'a1');
});

test('chybějící titulek nezpůsobí prázdný nadpis', () => {
  const t = naZpravyTrenera({
    coach_messages: [{ id: '3', title: null, content: 'Něco k tréninku.', created_at: NEDAVNO }]
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
      { id: 'nova', title: 'A', content: 'A', created_at: NEDAVNO },
      { id: 'starsi', title: 'B', content: 'B', created_at: predDny(3) }
    ]
  } as never);

  assert.deepEqual(t.map((z) => z.id), ['nova', 'starsi']);
});

test('zastaralá zpráva se nezobrazí', () => {
  // Uvitaci zprava z registrace rika „Dnes zacni tim, ze si pripravis prvni
  // jidlo z planu". Po trech tydnech to v profilu porad svitilo nahore jako
  // dnesni pokyn. Datum u ni bylo, ale karta ho svym umistenim prebijela.
  const t = naZpravyTrenera({
    coach_messages: [
      { id: 'nova', title: 'A', content: 'A', created_at: predDny(PLATNOST_ZPRAVY_DNI - 1) },
      { id: 'stara', title: 'B', content: 'B', created_at: predDny(PLATNOST_ZPRAVY_DNI + 14) }
    ]
  } as never);

  assert.deepEqual(t.map((z) => z.id), ['nova']);
});

test('zpráva bez použitelného data se nezobrazí', () => {
  // Bez data nejde poznat, jestli je aktualni — a stary pokyn tvarici se
  // jako dnesni je horsi nez prazdny banner.
  for (const datum of [null, undefined, '', 'nesmysl']) {
    const t = naZpravyTrenera({
      coach_messages: [{ id: 'x', title: 'A', content: 'A', created_at: datum }]
    } as never);
    assert.deepEqual(t, [], `datum ${JSON.stringify(datum)} nemelo projit`);
  }
});
