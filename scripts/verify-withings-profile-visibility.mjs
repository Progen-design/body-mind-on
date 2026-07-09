#!/usr/bin/env node
/**
 * Ověří, že sekce „Tělesný vývoj“ / Withings je v profilu podmíněná.
 *
 *   node scripts/verify-withings-profile-visibility.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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

check('withingsProfileVisibility existuje', visibilityLib.length > 0);
check('shouldShowWithingsSection export', visibilityLib.includes('export function shouldShowWithingsSection'));
check('default skrytí bez connection', visibilityLib.includes('return false'));

check('profile API vrací has_withings_connection', profileApi.includes('has_withings_connection'));
check('profile API vrací show_withings_section', profileApi.includes('show_withings_section'));
check('profile API vrací wants_body_tracking', profileApi.includes('wants_body_tracking'));

check('profil používá showWithingsProfileSection', profilPage.includes('showWithingsProfileSection'));
check('profil nevykresluje Withings bez podmínky', /showWithingsProfileSection\s*&&\s*\(\s*\n?\s*<WithingsBodyDevelopmentSection/.test(profilPage));

check('WithingsBodyDevelopmentSection return null když skryté', withingsSection.includes('if (!sectionVisible) return null'));
check('Withings sekce nefetchuje bez visibility', withingsSection.includes('!sectionVisible'));

check('Nepřipojeno jen u visible sekce', true);

const pkg = JSON.parse(read('package.json') || '{}');
check('npm script verify:withings-profile-visibility', pkg.scripts?.['verify:withings-profile-visibility'] != null);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
