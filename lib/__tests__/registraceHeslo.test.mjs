/**
 * Registrace: krátké heslo NESMÍ vypadat jako „účet už existuje".
 *
 * Bug (auth_logs Supabase, 25. 9. 2026): naše pravidlo pouštělo heslo od 6
 * znaků, Supabase Auth projekt chce min. 10 → createUser vrátil 422
 * „Password should be at least 10 characters." a createAuthUserIfNew() bral
 * KAŽDOU 422 jako existující účet. Volný e-mail + heslo o 6–9 znacích →
 * „Účet s tímto e-mailem už existuje".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE_CS,
  validatePassword,
} from '../registrationRules.js';
import {
  PASSWORD_WEAK_MESSAGE_CS,
  createAuthUserIfNew,
  klasifikujChybuVytvoreniUctu,
} from '../authHelpers.js';
import { getStep1FieldErrors } from '../registration/registrationStepValidation.js';

const KOREN = join(import.meta.dirname, '..', '..');
const cti = (p) => readFileSync(join(KOREN, p), 'utf8');

/** Atrapa `supabase.auth.admin` — vrací předem danou chybu z createUser. */
function klientSChybou(error) {
  const volani = [];
  return {
    volani,
    auth: {
      admin: {
        async createUser(args) {
          volani.push(args);
          return { data: null, error };
        },
      },
    },
  };
}

// Skutečné odpovědi Supabase Auth (status 422).
const CHYBA_KRATKE_HESLO = { status: 422, code: 'weak_password', message: 'Password should be at least 10 characters.' };
const CHYBA_SLABE_HESLO = { status: 422, code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.' };
const CHYBA_EXISTUJE = { status: 422, code: 'email_exists', message: 'A user with this email address has already been registered' };

// ---------------------------------------------------------------- pravidlo délky

test('minimální délka hesla je 10 — stejně jako politika Supabase Auth', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 10);
  assert.equal(PASSWORD_TOO_SHORT_MESSAGE_CS, 'Heslo musí mít alespoň 10 znaků.');
});

test('validace: 6–9 znaků neprojde, 10 projde', () => {
  for (const heslo of ['123456', '1234567', '12345678', '123456789']) {
    assert.deepEqual(validatePassword(heslo), { valid: false, error: 'Heslo musí mít alespoň 10 znaků.' }, heslo);
  }
  assert.deepEqual(validatePassword('1234567890'), { valid: true });
  assert.equal(validatePassword('   12345678   ').valid, false, 'mezery kolem se nepočítají');
});

test('krok 1 registrace (frontend) hlásí délku hesla, ne nic jiného', () => {
  const chyby = getStep1FieldErrors({
    name: 'Jan', email: 'volny@example.cz', password: 'heslo12', passwordConfirm: 'heslo12',
  });
  assert.equal(chyby.password, 'Heslo musí mít alespoň 10 znaků.');
  assert.equal(chyby.email, undefined, 'krátké heslo nesmí dělat chybu u e-mailu');
});

// ---------------------------------------------------------------- klasifikace 422

test('422 „Password should be at least 10 characters." je krátké heslo, NE existující účet', () => {
  assert.equal(klasifikujChybuVytvoreniUctu(CHYBA_KRATKE_HESLO), 'password_short');
  // I bez kódu, jen se zprávou a 422.
  assert.equal(klasifikujChybuVytvoreniUctu({ status: 422, message: 'Password should be at least 10 characters.' }), 'password_short');
});

test('422 slabé heslo je chyba hesla', () => {
  assert.equal(klasifikujChybuVytvoreniUctu(CHYBA_SLABE_HESLO), 'password_weak');
});

test('existující účet jen podle obsahu (already / registered / email_exists)', () => {
  assert.equal(klasifikujChybuVytvoreniUctu(CHYBA_EXISTUJE), 'existing');
  assert.equal(klasifikujChybuVytvoreniUctu({ status: 422, message: 'User already registered' }), 'existing');
  assert.equal(klasifikujChybuVytvoreniUctu({ status: 400, code: 'user_already_exists', message: 'x' }), 'existing');
});

test('samotný status 422 bez obsahu NENÍ existující účet', () => {
  assert.equal(klasifikujChybuVytvoreniUctu({ status: 422, message: 'Unprocessable entity' }), 'other');
  assert.equal(klasifikujChybuVytvoreniUctu({ status: 422 }), 'other');
  assert.equal(klasifikujChybuVytvoreniUctu(null), 'other');
});

// ---------------------------------------------------------------- createAuthUserIfNew (atrapa Supabase)

test('KRÁTKÉ HESLO na volném e-mailu → chyba o délce hesla, ne „účet už existuje"', async () => {
  const klient = klientSChybou(CHYBA_KRATKE_HESLO);
  // 10 znaků projde naší kontrolou; Supabase ho v atrapě stejně odmítne 422 —
  // simuluje rozjetou politiku (kdyby ji někdo v projektu zvedl).
  const vysledek = await createAuthUserIfNew('volny@example.cz', 'Jan', 'heslo12345', klient);
  assert.deepEqual(vysledek, { error: 'Heslo musí mít alespoň 10 znaků.', passwordError: true });
  assert.notEqual(vysledek.existing, true, 'chyba hesla se nesmí vydávat za existující účet');
});

test('heslo kratší než 10 se Supabase vůbec neposílá a vrátí chybu hesla', async () => {
  const klient = klientSChybou(null);
  const vysledek = await createAuthUserIfNew('volny@example.cz', 'Jan', 'heslo12', klient);
  assert.deepEqual(vysledek, { error: 'Heslo musí mít alespoň 10 znaků.', passwordError: true });
  assert.equal(klient.volani.length, 0);
});

test('krátké heslo se už tiše nenahrazuje náhodným (dřív `>= 6`)', async () => {
  const klient = klientSChybou(null);
  await createAuthUserIfNew('volny@example.cz', 'Jan', 'heslo', klient);
  assert.equal(klient.volani.length, 0, 'se špatným heslem se účet nezakládá vůbec');
});

test('slabé heslo → vlastní hláška, ne „účet už existuje"', async () => {
  const vysledek = await createAuthUserIfNew('volny@example.cz', 'Jan', 'password12', klientSChybou(CHYBA_SLABE_HESLO));
  assert.deepEqual(vysledek, { error: PASSWORD_WEAK_MESSAGE_CS, passwordError: true });
});

test('jiná 422 chyba se vrací jako svá vlastní chyba', async () => {
  const vysledek = await createAuthUserIfNew('volny@example.cz', 'Jan', 'heslo12345', klientSChybou({ status: 422, message: 'Signups not allowed for this instance' }));
  assert.deepEqual(vysledek, { error: 'Signups not allowed for this instance' });
});

// ---------------------------------------------------------------- napojení

test('API: chyba hesla → 400 s hláškou o hesle, dřív než „účet už existuje"', () => {
  const api = cti('api/body-metrics.js');
  const heslo = api.indexOf("if (auth.authError === 'password')");
  const existuje = api.indexOf("if (auth.authError === 'existing_account' || auth.existingAccount)");
  assert.ok(heslo > -1 && heslo < existuje, 'chyba hesla se musí vyhodnotit před existujícím účtem');
  assert.match(api, /return res\.status\(400\)\.json\(\{ error: auth\.passwordError \}\)/);

  const reg = cti('lib/registration/bodyMetricsRegistration.js');
  assert.match(reg, /if \(authResult\.passwordError === true\) \{\s*return \{\s*authError: 'password'/);
});

test('authHelpers: o existujícím účtu nerozhoduje samotné status === 422', () => {
  const kod = cti('lib/authHelpers.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(kod, /status\s*===\s*422/);
});

test('registrace (UI): placeholder „Aspoň 10 znaků" a chyba hesla ze serveru vede na pole Heslo', () => {
  const ui = cti('src/components/registrace/StartRegistrace.tsx');
  assert.match(ui, /placeholder="Aspoň 10 znaků"/);
  assert.doesNotMatch(ui, /Aspoň 6 znaků/);
  assert.match(ui, /setChyby\(\{ password: zprava \}\); setKrok\(1\)/);
});
