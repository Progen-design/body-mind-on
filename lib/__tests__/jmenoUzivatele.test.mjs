/**
 * Jedno jméno, jeden zdroj, jeden tvar.
 *
 * Na profilu se jméno objevovalo dvakrát a pokaždé jinak: hlavička „Jan“,
 * karta Tělesný vývoj „Jan Příkopa“. Dva tvary téhož člověka vedle sebe
 * vypadají jako chyba v datech, i když data v pořádku jsou.
 *
 * Nejcitlivější je pořadí zdrojů: jméno z registrace musí přebít
 * `user_metadata.name`, což bývá přezdívka od poskytovatele přihlášení.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAHRADNI_JMENO, celeJmeno, krestniJmeno } from '../profile/jmenoUzivatele.js';

const profil = (over = {}) => ({
  user: { name: 'Ondra Novák', email: 'ondra@example.com' },
  body_metrics: [
    { created_at: '2026-07-01T10:00:00Z', name: 'Ondřej Novák' },
    { created_at: '2026-08-01T10:00:00Z', name: 'Pozdější záznam' },
  ],
  ...over,
});

test('vyhrává jméno z registrace, ne přezdívka z přihlášení', () => {
  assert.equal(celeJmeno(profil()), 'Ondřej Novák');
});

test('z registrace se bere NEJSTARŠÍ záznam', () => {
  assert.equal(celeJmeno(profil()), 'Ondřej Novák', 'pozdější body_metrics nesmí přebít vstupní');
});

test('bez registrace se sáhne po user_metadata', () => {
  assert.equal(celeJmeno(profil({ body_metrics: [] })), 'Ondra Novák');
});

test('bez jména zbývá e-mail, ale bez domény', () => {
  const p = profil({ body_metrics: [], user: { name: '', email: 'jan.novak@example.com' } });
  assert.equal(celeJmeno(p), 'jan.novak');
});

test('když nevíme nic, oslovíme neutrálně — ne prázdnem', () => {
  assert.equal(celeJmeno(null), NAHRADNI_JMENO);
  assert.equal(celeJmeno({}), NAHRADNI_JMENO);
  assert.equal(celeJmeno({ user: { name: '   ' }, body_metrics: [{ name: '  ' }] }), NAHRADNI_JMENO);
});

test('křestní jméno je první slovo téhož zdroje', () => {
  assert.equal(krestniJmeno(profil()), 'Ondřej');
  assert.equal(krestniJmeno(profil({ body_metrics: [] })), 'Ondra');
});

test('obě podoby vycházejí ze STEJNÉHO jména — to byl ten bug', () => {
  const p = profil();
  assert.ok(celeJmeno(p).startsWith(krestniJmeno(p)),
    'hlavička a karta se nesmí rozejít na jiný zdroj');
});

test('jednoslovné jméno projde beze změny', () => {
  const p = profil({ body_metrics: [{ created_at: '2026-07-01', name: 'Ondřej' }] });
  assert.equal(celeJmeno(p), 'Ondřej');
  assert.equal(krestniJmeno(p), 'Ondřej');
});
