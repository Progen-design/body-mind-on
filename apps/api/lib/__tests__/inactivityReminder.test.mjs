/**
 * Připomínka při neaktivitě — kdy se ozvat a kdy mlčet.
 *
 * Nejdražší chyba u tohohle typu e-mailu není „neposlal se“, ale „poslal se
 * podruhé“. Testy proto tlačí hlavně na to, kdy se mlčí: čerstvá registrace,
 * aktivní uživatel, neaktivní členství, druhý běh v témže týdnu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DNU_NEAKTIVITY,
  isoTyden,
  klicPripominky,
  maPoslatPripominku,
  posledniAktivita,
  textPripominky,
} from '../inactivityReminder.js';

const NOW = new Date('2026-08-18T09:00:00Z');
const predDny = (n) => new Date(NOW.getTime() - n * 86400000);
const zaklad = { membershipStatus: 'trial', now: NOW, registrovanAt: predDny(30) };

test('3 dny bez aktivity → poslat', () => {
  const r = maPoslatPripominku({ ...zaklad, posledniAktivitaAt: predDny(DNU_NEAKTIVITY) });
  assert.equal(r.poslat, true);
  assert.equal(r.dnuBezAktivity, DNU_NEAKTIVITY);
});

test('včerejší aktivita → mlčet', () => {
  const r = maPoslatPripominku({ ...zaklad, posledniAktivitaAt: predDny(1) });
  assert.equal(r.poslat, false);
  assert.equal(r.duvod, 'jeste_je_brzy');
});

test('kdo nikdy nic neudělal: měří se od registrace, ne od nekonečna', () => {
  // Registrace před hodinou — e-mail „pár dní jsme se neviděli“ by byl nesmysl.
  const cerstvy = maPoslatPripominku({ ...zaklad, posledniAktivitaAt: null, registrovanAt: new Date(NOW.getTime() - 3600000) });
  assert.equal(cerstvy.poslat, false, 'čerstvá registrace nesmí dostat připomínku');

  const stary = maPoslatPripominku({ ...zaklad, posledniAktivitaAt: null, registrovanAt: predDny(10) });
  assert.equal(stary.poslat, true);
  assert.equal(stary.duvod, 'nikdy_nezacal');
});

test('druhý běh v témže týdnu už neposílá', () => {
  const r = maPoslatPripominku({ ...zaklad, posledniAktivitaAt: predDny(9), jizPoslanoTentoTyden: true });
  assert.equal(r.poslat, false);
  assert.equal(r.duvod, 'uz_odeslano_tento_tyden');
});

test('neaktivní členství se neobtěžuje', () => {
  for (const status of ['canceled', 'pending_payment', 'expired', null]) {
    const r = maPoslatPripominku({ ...zaklad, membershipStatus: status, posledniAktivitaAt: predDny(30) });
    assert.equal(r.poslat, false, `status ${status}`);
    assert.equal(r.duvod, 'clenstvi_neni_aktivni');
  }
});

test('aktivita se bere ze všech tří os', () => {
  assert.equal(posledniAktivita({ completions: [{ completed_at: '2026-08-17T10:00:00Z' }] })?.toISOString(),
    '2026-08-17T10:00:00.000Z', 'jídlo/trénink');
  assert.equal(posledniAktivita({ habitLogs: [{ created_at: '2026-08-16T10:00:00Z' }] })?.toISOString(),
    '2026-08-16T10:00:00.000Z', 'návyk');
  // Nejnovější vyhrává napříč osami.
  const nej = posledniAktivita({
    completions: [{ completed_at: '2026-08-10T10:00:00Z' }],
    habitLogs: [{ created_at: '2026-08-15T10:00:00Z' }],
    checkins: [{ checkin_date: '2026-08-12' }],
  });
  assert.equal(nej?.toISOString().slice(0, 10), '2026-08-15');
  assert.equal(posledniAktivita({}), null, 'žádná data = null, ne dnešek');
});

test('klíč nese ISO týden — unikát v DB tím drží 1× týdně', () => {
  assert.equal(isoTyden(new Date('2026-08-18T00:00:00Z')), '2026-W34');
  assert.match(klicPripominky(NOW), /^inactivity_reminder:\d{4}-W\d{2}$/);
  // Stejný týden = stejný klíč, jiný týden = jiný.
  assert.equal(klicPripominky(new Date('2026-08-20T23:00:00Z')), klicPripominky(NOW));
  assert.notEqual(klicPripominky(new Date('2026-08-25T09:00:00Z')), klicPripominky(NOW));
});

test('text drží tón: bez výčitek, bez zdravotních tvrzení, s odkazem', () => {
  const { subject, text } = textPripominky({
    jmeno: 'Viky Klajník', dnuBezAktivity: 5,
    ctaUrl: 'https://app.bodyandmindon.cz/login?redirect=/profil',
  });
  assert.ok(subject.length > 0 && subject.length <= 60, 'předmět krátký');
  // Viky nekončí na -a → jméno se vynechá, aby nevznikl špatný 5. pád.
  assert.match(text, /^Ahoj,/, 'nejisté skloňování = raději bez jména');
  assert.match(text, /login\?redirect=\/profil/, 'odkaz do profilu');
  for (const zakazane of [/musíš/i, /selhal/i, /zklamal/i, /lenost/i, /spálíš/i, /zhubneš/i, /zdravotn/i]) {
    assert.doesNotMatch(text, zakazane, `zakázaný tón: ${zakazane}`);
  }
});

test('oslovení používá 5. pád jen tam, kde je pravidlo spolehlivé', () => {
  const osloveni = (j) => textPripominky({ jmeno: j, ctaUrl: 'https://x' }).text.split('\n')[0];
  // jména na -a mají pravidelný vokativ
  assert.equal(osloveni('Ondra Novák'), 'Ahoj Ondro,');
  assert.equal(osloveni('Jana'), 'Ahoj Jano,');
  assert.equal(osloveni('Petra Nová'), 'Ahoj Petro,');
  // nepravidelná se raději vynechají, než aby se zkomolila
  for (const j of ['Jan', 'Petr', 'Tomáš', 'Marek', 'Viky', null, '   ', 'X']) {
    assert.equal(osloveni(j), 'Ahoj,', `jméno ${JSON.stringify(j)} se nemá skloňovat`);
  }
});
