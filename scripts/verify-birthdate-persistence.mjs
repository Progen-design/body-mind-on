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

// PROMPT_UKLID.md (2026-09-17) — `_legacy-next/pages/{start,on-club,chci-vip,
// profil}.js` a `.../PreferencesOverlay.jsx` smazány v Bloku 1. Registrace je
// dnes JEDNA komponenta pro všechny tiery (StartRegistrace.tsx, ne tři
// oddělené stránky — App.tsx ji renderuje pro celé CESTY_REGISTRACE), proto
// jedna kontrola místo smyčky přes tři soubory. Editace data narození PO
// registraci nemá live UI (PreferencesModal.tsx pole birth_date nemá,
// ověřeno greppem) — API (/api/profile-body-data) ho pořád umí uložit, jen
// se k tomu nedá dostat z profilu. Pinováno jako GAP, ne vymyšleno.
const startPage = read('src/components/registrace/StartRegistrace.tsx');
const bodyMetricsApi = read('api/body-metrics.js');
const bodyMetricsRegistration = read('lib/registration/bodyMetricsRegistration.js');
const bodyMetricsRegistrationChain = `${bodyMetricsApi}\n${bodyMetricsRegistration}`;
const profileApi = read('api/profile.js');
const profileBodyDataApi = read('api/profile-body-data.js');
const birthLib = read('lib/bodyMetricsBirthDate.js');
const packageJson = read('package.json');
const prefsModal = read('src/components/PreferencesModal.tsx');
const appTsx = read('src/App.tsx');
const adapteryTs = read('src/data/adaptery.ts');

// --- Registrace posílá datum narození ---
check('registrace má pole birth_date', startPage.includes('id="birth_date"') && startPage.includes('type="date"'));
check('registrace posílá payload na /api/body-metrics', startPage.includes('"/api/body-metrics"') || startPage.includes("'/api/body-metrics'"));
check('GAP: birth_date se v profilu editovat nedá, jen při registraci', !prefsModal.includes('birth_date'));
check('věk se v profilu dnes zobrazuje z birth_date (App.tsx -> vekZDataNarozeni)', appTsx.includes('vekZDataNarozeni(profilData?.user?.birth_date'));

// --- API přijímá a ukládá ---
check('/api/body-metrics čte b.birth_date', bodyMetricsRegistrationChain.includes('b.birth_date'));
check('/api/body-metrics validuje birth_date', bodyMetricsRegistrationChain.includes('validateBirthDate(birthDateRaw)'));
check('/api/body-metrics ukládá birth_date do body_metrics', /birth_date:\s*birthDateRaw/.test(bodyMetricsRegistrationChain));
check('/api/body-metrics ukládá birth_date i do user_metadata', bodyMetricsRegistrationChain.includes('user_metadata') && /user_metadata:\s*\{[^}]*birth_date/.test(bodyMetricsRegistrationChain));
check('věk se počítá z birth_date při registraci', bodyMetricsRegistrationChain.includes('birthValidation.age'));

// --- Profil čte stejný source ---
check('/api/profile vrací user.birth_date', /birth_date:\s*birthDateFromMeta \|\| birthDateFromMetrics \|\| null/.test(profileApi));
check('/api/profile čte birth_date z user_metadata', profileApi.includes('meta.birth_date'));
check('/api/profile má fallback na body_metrics.birth_date', profileApi.includes('birthDateFromMetrics'));

// --- Žádný fake fallback ---
check('lib nemá approximateBirthDateFromAge', !birthLib.includes('approximateBirthDateFromAge'));
// Živý ekvivalent: src/data/adaptery.ts's vekZDataNarozeni() — chybějící
// nebo nesmyslné datum vrací null, ne dopočítaný/natvrdo psaný rok.
check('věk se počítá jen ze skutečného data (vekZDataNarozeni vrací null, ne default)', /return vek >= 0 && vek < 130 \? vek : null/.test(adapteryTs));

// --- Update v profilu se uloží a drží (API pořád funguje, i bez UI — viz GAP výš) ---
check('/api/profile-body-data validuje birth_date', profileBodyDataApi.includes('validateBirthDate(birth_date)'));
check('/api/profile-body-data ukládá do body_metrics', /metricsUpdate\.birth_date\s*=\s*birth_date/.test(profileBodyDataApi));
check('/api/profile-body-data ukládá do user_metadata', /\.\.\.\(birth_date \? \{ birth_date \} : \{\}\)/.test(profileBodyDataApi));

// --- Nové body_metrics řádky neztrácí birth_date ---
// lib/quickWeightRow.js (29. 8. 2026, docs/DALSI_KROK.md 6.4) přešlo z
// ručního výčtu polí na `...latestFields` — birth_date se nese s celým
// řádkem, ne jmenovitě. Silnější záruka: i BUDOUCÍ nové pole se přenese
// samo, ne že ho někdo zapomene přidat do seznamu.
const quickWeightRowLib = read('lib/quickWeightRow.js');
check('quick-weight přenáší birth_date do nového řádku (celý poslední řádek přes ...latestFields)', quickWeightRowLib.includes('...latestFields'));

check('npm script verify:birthdate-persistence', packageJson.includes('"verify:birthdate-persistence"'));

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(failed ? 1 : 0);
