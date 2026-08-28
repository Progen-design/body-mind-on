/**
 * Naměřený odstup místo nastaveného intervalu.
 *
 * PROČ. Karta Apple Health psala „Odesílá tvůj iPhone každou hodinu" a u dat
 * starých hodinu a půl svítilo „Aktuální". Změřeno 24. 8. 2026 08:20:
 * posledních 8 payloadů přišlo mezi 23:07:00 a 23:08:08 — jedna dávka za
 * 68 sekund, ne hodinová úloha. Pak devět hodin ticho, a spojení přesto
 * `active` bez chyby.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { odstupHodin, odstupMs, odstupText } from './odstup.ts';

/** Pevný „teď", aby test nezávisel na hodinách stroje. */
const TED = Date.parse('2026-08-25T12:26:00.000Z');

function pred(ms: number): string {
  return new Date(TED - ms).toISOString();
}

const MIN = 60_000;
const HOD = 60 * MIN;
const DEN = 24 * HOD;

// ---------------------------------------------------------------- format

test('hodiny i minuty, presne jak to ma stat na karte', () => {
  // Zadani: "Poslední odeslání před 1 h 26 min".
  assert.equal(odstupText(pred(1 * HOD + 26 * MIN), TED), 'před 1 h 26 min');
});

test('cele hodiny bez minut', () => {
  assert.equal(odstupText(pred(3 * HOD), TED), 'před 3 h');
});

test('pod hodinu jen minuty', () => {
  assert.equal(odstupText(pred(24 * MIN), TED), 'před 24 min');
  assert.equal(odstupText(pred(59 * MIN), TED), 'před 59 min');
});

test('cerstva data', () => {
  assert.equal(odstupText(pred(0), TED), 'právě teď');
  assert.equal(odstupText(pred(59_000), TED), 'právě teď');
});

test('od dne vys uz minuty nikoho nezajimaji', () => {
  // "před 2 dny 3 h 14 min" se do radku karty stejne nevejde.
  assert.equal(odstupText(pred(DEN), TED), 'před 1 dnem');
  assert.equal(odstupText(pred(2 * DEN + 3 * HOD), TED), 'před 2 dny');
  assert.equal(odstupText(pred(9 * DEN), TED), 'před 9 dny');
});

test('devitihodinova mezera z produkce se napise jako hodiny', () => {
  // Od 23:08 do 08:20 nepřišlo nic — devět propadlých slotů.
  assert.equal(odstupText(pred(9 * HOD + 12 * MIN), TED), 'před 9 h 12 min');
});

// ------------------------------------------------------------ "nevime"

test('bez casu se nic nevymysli', () => {
  assert.equal(odstupText(null, TED), '');
  assert.equal(odstupText(undefined, TED), '');
  assert.equal(odstupText('', TED), '');
  assert.equal(odstupText('nesmysl', TED), '');
  assert.equal(odstupMs(null, TED), null);
  assert.equal(odstupHodin(null, TED), null);
});

test('cas z budoucnosti je taky "nevime"', () => {
  // Rozejite hodiny telefonu a serveru. "před -3 min" by bylo horsi nez mlcet.
  const budoucnost = new Date(TED + 3 * MIN).toISOString();
  assert.equal(odstupMs(budoucnost, TED), null);
  assert.equal(odstupText(budoucnost, TED), '');
});

// ------------------------------------------------------------- prahy

test('odstupHodin da cislo pro prah zastarani', () => {
  assert.equal(odstupHodin(pred(12 * HOD), TED), 12);
  assert.equal(odstupHodin(pred(90 * MIN), TED), 1.5);
});

test('hodinu a pul stara data NEJSOU pres dvanactihodinovy prah', () => {
  // Presne ten pripad ze zadani: stav se ma brat z odstupu, ne z nastaveni.
  const stari = odstupHodin(pred(90 * MIN), TED);
  assert.ok(stari !== null && stari < 12);
});
