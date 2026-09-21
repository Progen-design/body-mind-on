import test from 'node:test';
import assert from 'node:assert/strict';
import { denProgramu } from './denProgramu.ts';

test('den registrace je Den 1', () => {
  assert.equal(
    denProgramu('2026-09-21T08:00:00Z', new Date('2026-09-21T10:00:00Z')),
    1
  );
});

test('další kalendářní den v Praze je Den 2', () => {
  assert.equal(
    denProgramu('2026-09-21T08:00:00Z', new Date('2026-09-22T08:00:00Z')),
    2
  );
});

// PŘES PŮLNOC V EUROPE/PRAGUE — jádro testu. Registrace 2026-01-15T23:30:00Z
// je v UTC pořád 15. leden, ale Praha je v lednu UTC+1 (CET, bez letního
// času) — místní čas je 2026-01-16T00:30, tedy UŽ 16. leden. Naivní výpočet
// nad syrovým UTC datem (15. leden) by dal jiný den registrace než výpočet
// nad pražským kalendářním dnem (16. leden) — a tenhle test by o den chybně
// posunul „Den N" i pro čas, který v Praze žádnou půlnoc nepřekračuje.
test('den registrace se počítá v Europe/Prague, ne v syrovém UTC datu', () => {
  const registrace = '2026-01-15T23:30:00Z'; // Praha: 2026-01-16 00:30 (CET, UTC+1)
  const tedTentyzPrazskyDen = new Date('2026-01-16T12:00:00Z'); // Praha: 2026-01-16 13:00
  assert.equal(denProgramu(registrace, tedTentyzPrazskyDen), 1, 'stejný pražský den jako registrace musí být Den 1, ne Den 2');
});

test('bez data registrace se Den N nepočítá', () => {
  assert.equal(denProgramu(null, new Date('2026-09-21T10:00:00Z')), null);
  assert.equal(denProgramu(undefined, new Date('2026-09-21T10:00:00Z')), null);
});
