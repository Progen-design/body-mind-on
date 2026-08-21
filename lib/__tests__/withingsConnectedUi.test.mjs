/**
 * PŘIPOJENO → UI ŘÍKÁ „PŘIPOJENO“.
 *
 * Účet janprikopa@gmail.com měl 18. 8. 2026 v `withings_connections` aktivní
 * řádek (connected_at 17. 8. 22:32, last_sync_at vyplněný, last_sync_error null)
 * a profil mu přesto nabízel „Připojit Withings“.
 *
 * Server nechyboval: `/api/profile` počítá `has_withings_connection` z existence
 * toho řádku a vracel `true`. Chyba byla o patro níž — `normalizeProfilePayload`
 * byl whitelist a klíč, který v něm nebyl vyjmenovaný, tiše zahodil. Klient tedy
 * dostal `undefined`, `undefined === true` je false a UI nakreslilo odpojený stav.
 *
 * Testuje se proto celý řetěz od odpovědi API po podmínky, které UI používá —
 * ne jen jedna funkce. A poslední test hlídá tu třídu chyby, ne jeden klíč:
 * co server pošle, to klientovi dojde.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfilePayload } from '../profileApi.js';
import { shouldPromoteDeviceConnect } from '../registrationDevices.js';
import { shouldShowWithingsSection, shouldShowWithingsConnectUi } from '../withingsProfileVisibility.js';

/** Odpověď `/api/profile` pro účet s aktivním připojením (tvar podle api/profile.js). */
function odpovedApi({ pripojeno }) {
  return {
    program: 'START',
    membershipStatus: 'active',
    membershipSince: '2026-07-01T00:00:00Z',
    can_create_calendar_events: false,
    has_withings_connection: pripojeno,
    show_withings_section: pripojeno,
    plan_renewal: { allowed: true, reason: 'active_membership', trial_ended: false },
    coach_messages: [{ id: 'm1', content: 'Ahoj' }],
    user: {
      id: 'e35e9013-b4c5-48e1-beb7-353d96d4cc79',
      email: 'janprikopa@gmail.com',
      name: 'Jan',
      // Zájem o váhu z registrace — kvůli němu se sekce tahá nahoru,
      // dokud není připojeno.
      wants_body_tracking: true,
      smart_scale_provider: 'withings',
    },
    // Zájem o zařízení se čte z `body_metrics[].devices`, ne z user_metadata.
    // Bez něj by `shouldPromoteDeviceConnect` vracel false z jiného důvodu
    // a test připojení by neověřoval nic.
    body_metrics: [{ created_at: '2026-07-01T00:00:00Z', devices: ['scale'] }],
    body_measurements: [],
    user_habits: [],
    plans: [],
    workouts: [],
  };
}

/** Přesná podmínka z ConnectDevicesSection.js — kdyby se změnila, test to má chytit. */
const uiUkazujePripojeno = (profile) => profile?.has_withings_connection === true;

test('připojený Withings přežije normalizaci a UI ho ukáže jako připojený', () => {
  const profile = normalizeProfilePayload(odpovedApi({ pripojeno: true }));

  assert.equal(profile.has_withings_connection, true, 'klíč se cestou z API ztratil');
  assert.equal(uiUkazujePripojeno(profile), true, 'UI by nakreslilo „Připojit Withings“');
  assert.equal(shouldShowWithingsSection(profile), true);
  assert.equal(shouldShowWithingsConnectUi(profile), true);
});

test('připojené zařízení už netahá „Připojit zařízení“ nahoru nad plán', () => {
  const profile = normalizeProfilePayload(odpovedApi({ pripojeno: true }));
  assert.equal(shouldPromoteDeviceConnect(profile, null), false,
    'zájem z registrace + připojeno = sekce nahoře jen překáží');
});

test('nepřipojený účet dál vidí nabídku k připojení', () => {
  const profile = normalizeProfilePayload(odpovedApi({ pripojeno: false }));
  assert.equal(uiUkazujePripojeno(profile), false);
  assert.equal(shouldPromoteDeviceConnect(profile, null), true, 'zájem a nepřipojeno = vytáhnout nahoru');
});

test('chybějící klíč se nesmí tvářit jako připojeno', () => {
  const bez = odpovedApi({ pripojeno: true });
  delete bez.has_withings_connection;
  assert.equal(uiUkazujePripojeno(normalizeProfilePayload(bez)), false,
    'undefined není připojeno — striktní === true tu má zůstat');
});

test('normalizace nesmí zahodit žádný klíč, který API poslalo', () => {
  // Tohle je ta vlastní chyba: ne „chybí has_withings_connection“, ale
  // „normalizátor tiše škrtá“. Whitelist takhle spolkl body_measurements
  // (15. 8.) i has_withings_connection (18. 8.).
  const raw = odpovedApi({ pripojeno: true });
  const profile = normalizeProfilePayload(raw);
  const ztracene = Object.keys(raw).filter((k) => !(k in profile));
  assert.deepEqual(ztracene, [], `normalizace zahodila klíče: ${ztracene.join(', ')}`);
});

test('klíče, na kterých visí jiné části profilu, taky projdou', () => {
  const profile = normalizeProfilePayload(odpovedApi({ pripojeno: true }));
  assert.equal(profile.plan_renewal?.reason, 'active_membership', 'brána dalšího plánu');
  assert.equal(profile.coach_messages?.length, 1, 'zprávy od trenéra');
  assert.equal(profile.show_withings_section, true, 'sekce Tělesný vývoj');
});
