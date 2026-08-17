/**
 * Kdy patří „Připojit zařízení“ nahoru nad plán.
 *
 * Sekce byla vždycky dole pod plánem. Kdo si v registraci zaškrtl váhu nebo
 * hodinky, o ni zakopl až za pár dní — nebo vůbec. Nahoru se proto vytáhne
 * jen při shodě obou podmínek: JE zájem a NENÍ připojeno. Po připojení
 * predikát spadne a sekce zhora zmizí sama.
 *
 * Kryje to i tu chybu, kterou jsme řešili u zápisu tréninku: nikdy nesmí
 * vyjít pravda tak, aby se táž sekce ukázala nahoře i dole.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPromoteDeviceConnect } from '../registrationDevices.js';

/** Profil tak, jak ho vidí klient — `devices` sedí v posledním body_metrics. */
function profil(devices, { withings = false } = {}) {
  return {
    has_withings_connection: withings,
    body_metrics: [
      { created_at: '2026-08-01T10:00:00Z', devices: null },
      { created_at: '2026-08-18T10:00:00Z', devices },
    ],
  };
}
const APPLE_AKTIVNI = { active: { status: 'active' } };

test('zaškrtnuto a nepřipojeno → nahoru', () => {
  assert.equal(shouldPromoteDeviceConnect(profil(['scale']), null), true);
  assert.equal(shouldPromoteDeviceConnect(profil(['watch']), null), true);
  assert.equal(shouldPromoteDeviceConnect(profil(['scale', 'watch']), null), true);
});

test('nic nezaškrtnuto → zůstává dole', () => {
  assert.equal(shouldPromoteDeviceConnect(profil(null), null), false);
  assert.equal(shouldPromoteDeviceConnect(profil([]), null), false);
  assert.equal(shouldPromoteDeviceConnect({}, null), false);
  assert.equal(shouldPromoteDeviceConnect(null, null), false);
});

test('už připojeno → zůstává dole, i když si zařízení zaškrtl', () => {
  assert.equal(shouldPromoteDeviceConnect(profil(['scale'], { withings: true }), null), false,
    'Withings připojený');
  assert.equal(shouldPromoteDeviceConnect(profil(['watch']), APPLE_AKTIVNI), false,
    'Apple Health aktivní');
  assert.equal(shouldPromoteDeviceConnect(profil(['scale', 'watch'], { withings: true }), APPLE_AKTIVNI), false,
    'obojí připojené');
});

test('neaktivní Apple spojení promotion neblokuje', () => {
  assert.equal(shouldPromoteDeviceConnect(profil(['watch']), { active: { status: 'revoked' } }), true);
  assert.equal(shouldPromoteDeviceConnect(profil(['watch']), { active: null }), true);
});

test('po připojení predikát spadne — sekce zhora zmizí', () => {
  const pred = profil(['scale']);
  assert.equal(shouldPromoteDeviceConnect(pred, null), true);
  const po = { ...pred, has_withings_connection: true };
  assert.equal(shouldPromoteDeviceConnect(po, null), false);
});
