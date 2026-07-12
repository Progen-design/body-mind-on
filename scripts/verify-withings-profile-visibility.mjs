#!/usr/bin/env node
/**
 * Ověří, že sekce „Tělesný vývoj“ / Withings je v profilu podmíněná.
 *
 *   node scripts/verify-withings-profile-visibility.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  shouldShowWithingsSection,
  shouldShowWithingsConnectUi,
} from '../lib/withingsProfileVisibility.js';
import {
  parseSmartScalePreference,
  metadataToSmartScaleChoice,
  smartScaleChoiceToMetadata,
} from '../lib/smartScalePreference.js';

const root = process.cwd();
let failed = 0;

function check(label, ok) {
  if (ok) console.log(`OK ${label}`);
  else {
    console.log(`FAIL ${label}`);
    failed += 1;
  }
}

function read(rel) {
  const p = resolve(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

const visibilityLib = read('lib/withingsProfileVisibility.js');
const profileApi = read('pages/api/profile.js');
const profilPage = read('pages/profil.js');
const withingsSection = read('components/profile/WithingsBodyDevelopmentSection.js');
const startPage = read('pages/start.js');
const bodyMetricsApi = read('pages/api/body-metrics.js');
const profileSettingsApi = read('pages/api/profile-settings.js');
const prefsOverlay = read('components/profile/PreferencesOverlay.jsx');

check('withingsProfileVisibility existuje', visibilityLib.length > 0);
check('shouldShowWithingsSection export', visibilityLib.includes('export function shouldShowWithingsSection'));
check('shouldShowWithingsConnectUi export', visibilityLib.includes('export function shouldShowWithingsConnectUi'));
check('default skrytí bez connection', visibilityLib.includes('return false'));
check('bez withings_import fallback v shouldShow', !/hasWithingsImportInMetrics\(profile\)/.test(visibilityLib.split('shouldShowWithingsSection')[1] || ''));

check('profile API vrací has_withings_connection', profileApi.includes('has_withings_connection'));
check('profile API vrací show_withings_section', profileApi.includes('show_withings_section'));
check('profile API vrací wants_body_tracking', profileApi.includes('wants_body_tracking'));

check('profil používá showWithingsProfileSection', profilPage.includes('showWithingsProfileSection'));
check('profil nevykresluje Withings bez podmínky', /showWithingsProfileSection\s*&&\s*\(\s*\n?\s*<WithingsBodyDevelopmentSection/.test(profilPage));

check('WithingsBodyDevelopmentSection return null když skryté', withingsSection.includes('if (!sectionVisible) return null'));
check('Withings sekce nefetchuje bez visibility', withingsSection.includes('!sectionVisible'));
check('CTA Připojit Withings', withingsSection.includes('Připojit Withings'));
check('shouldShowWithingsConnectUi v sekci', withingsSection.includes('shouldShowWithingsConnectUi'));

check('registrace START má smart scale otázku', startPage.includes('SmartScaleChoiceField'));
const bodyMetricsRegistration = read('lib/registration/bodyMetricsRegistration.js');
check('body-metrics ukládá smart scale metadata', `${bodyMetricsApi}\n${bodyMetricsRegistration}`.includes('parseSmartScalePreference'));
check('profile-settings ukládá smart scale', profileSettingsApi.includes('parseSmartScalePreference'));
check('Nastavení má blok Chytrá váha', prefsOverlay.includes('Chytrá váha'));

// --- runtime visibility matrix ---
const noneProfile = { has_withings_connection: false, user: { wants_body_tracking: false, smart_scale_provider: null } };
check('user bez preference: skrytý', shouldShowWithingsSection(noneProfile) === false);
check('user bez preference: bez Withings UI', shouldShowWithingsConnectUi(noneProfile) === false);

const withingsNoConn = {
  has_withings_connection: false,
  user: { wants_body_tracking: true, smart_scale_provider: 'withings' },
};
check('withings preference bez connection: viditelný', shouldShowWithingsSection(withingsNoConn) === true);
check('withings preference bez connection: Withings UI', shouldShowWithingsConnectUi(withingsNoConn) === true);

const connected = {
  has_withings_connection: true,
  user: { wants_body_tracking: false, smart_scale_provider: null },
};
check('user s connection: viditelný', shouldShowWithingsSection(connected) === true);
check('user s connection: Withings UI', shouldShowWithingsConnectUi(connected) === true);

const otherScale = {
  has_withings_connection: false,
  user: { wants_body_tracking: true, smart_scale_provider: 'other' },
};
check('jiná váha: viditelný (wants_body_tracking)', shouldShowWithingsSection(otherScale) === true);
check('jiná váha: bez Withings connect UI', shouldShowWithingsConnectUi(otherScale) === false);

// --- metadata helpers ---
check('default registrace = none', metadataToSmartScaleChoice({}) === 'none');
check('withings choice metadata', smartScaleChoiceToMetadata('withings').smart_scale_provider === 'withings');
check('none choice metadata', smartScaleChoiceToMetadata('none').wants_body_tracking === false);
check('parse registration withings', parseSmartScalePreference({ smart_scale_choice: 'withings' }).smart_scale_provider === 'withings');

const pkg = JSON.parse(read('package.json') || '{}');
check('npm script verify:withings-profile-visibility', pkg.scripts?.['verify:withings-profile-visibility'] != null);
check('npm script verify:withings-visibility alias', pkg.scripts?.['verify:withings-visibility'] != null);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
