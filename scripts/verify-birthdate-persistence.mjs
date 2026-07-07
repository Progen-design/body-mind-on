#!/usr/bin/env node
/**
 * Statická kontrola: datum narození z registrace se ukládá, čte a zobrazuje konzistentně,
 * bez fake fallbacku (např. 1. 1. 2005 dopočteného z věku).
 *   node scripts/verify-birthdate-persistence.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`OK ${label}${detail ? ` — ${detail}` : ''}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(relPath) {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8');
}

const startPage = read('pages/start.js');
const bodyMetricsApi = read('pages/api/body-metrics.js');
const profileApi = read('pages/api/profile.js');
const profileBodyDataApi = read('pages/api/profile-body-data.js');
const quickWeightApi = read('pages/api/quick-weight.js');
const profilPage = read('pages/profil.js');
const prefsOverlay = read('components/profile/PreferencesOverlay.jsx');
const birthLib = read('lib/bodyMetricsBirthDate.js');
const packageJson = read('package.json');

// --- Registrace posílá datum narození ---
check('registrace má pole birth_date', startPage.includes('name="birth_date"') && startPage.includes('type="date"'));
check('registrace validuje birth_date', startPage.includes('validateBirthDate(formData.birth_date)'));
check('registrace vyžaduje birth_date pro pokračování', startPage.includes('formData.birth_date &&') || /canProceedStep2[\s\S]{0,200}birth_date/.test(startPage));
check('registrace posílá payload na /api/body-metrics', startPage.includes('"/api/body-metrics"') || startPage.includes("'/api/body-metrics'"));

// --- API přijímá a ukládá ---
check('/api/body-metrics čte b.birth_date', bodyMetricsApi.includes('b.birth_date'));
check('/api/body-metrics validuje birth_date', bodyMetricsApi.includes('validateBirthDate(birthDateRaw)'));
check('/api/body-metrics ukládá birth_date do body_metrics', /birth_date:\s*birthDateRaw/.test(bodyMetricsApi));
check('/api/body-metrics ukládá birth_date i do user_metadata', bodyMetricsApi.includes('user_metadata') && /user_metadata:\s*\{[^}]*birth_date/.test(bodyMetricsApi));
check('věk se počítá z birth_date při registraci', bodyMetricsApi.includes('birthValidation.age'));

// --- Profil čte stejný source ---
check('/api/profile vrací user.birth_date', /birth_date:\s*birthDateFromMeta \|\| birthDateFromMetrics \|\| null/.test(profileApi));
check('/api/profile čte birth_date z user_metadata', profileApi.includes('meta.birth_date'));
check('/api/profile má fallback na body_metrics.birth_date', profileApi.includes('birthDateFromMetrics'));
check('profil čte birth_date z /api/profile user objektu', profilPage.includes('userMeta.birth_date'));

// --- Žádný fake fallback ---
check('profil nedopočítává datum z věku', !profilPage.includes('approximateBirthDateFromAge'));
check('lib nemá approximateBirthDateFromAge', !birthLib.includes('approximateBirthDateFromAge'));
check('žádný hardcoded rok 2005 fallback v profilu', !/2005/.test(profilPage));
check('žádný hardcoded 1. 1. default v overlay', !/2005|-01-01/.test(prefsOverlay));
check('chybějící datum = prázdná hodnota (ne default)', prefsOverlay.includes("form.birth_date ?? ''"));
check('věk se počítá jen ze skutečného data', prefsOverlay.includes('form.birth_date ? calculateAgeFromBirthDate(form.birth_date) : null'));

// --- Update v profilu se uloží a drží ---
check('profil posílá birth_date do /api/profile-body-data', profilPage.includes('bodyPayload.birth_date = preferencesForm.birth_date'));
check('/api/profile-body-data validuje birth_date', profileBodyDataApi.includes('validateBirthDate(birth_date)'));
check('/api/profile-body-data ukládá do body_metrics', /metricsUpdate\.birth_date\s*=\s*birth_date/.test(profileBodyDataApi));
check('/api/profile-body-data ukládá do user_metadata', /\.\.\.\(birth_date \? \{ birth_date \} : \{\}\)/.test(profileBodyDataApi));

// --- Nové body_metrics řádky neztrácí birth_date ---
check('quick-weight přenáší birth_date do nového řádku', quickWeightApi.includes('birth_date: latest?.birth_date'));

check('npm script verify:birthdate-persistence', packageJson.includes('"verify:birthdate-persistence"'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
