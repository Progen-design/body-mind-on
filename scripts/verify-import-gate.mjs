#!/usr/bin/env node
/**
 * Live smoke test — production import cron returns gate summary counters.
 *
 *   node scripts/verify-import-gate.mjs
 *   BASE_URL=https://app.bodyandmindon.cz node scripts/verify-import-gate.mjs
 *
 * Requires CRON_SECRET in .env.local (not committed).
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { fetchWithTimeout } from './lib/fetchWithTimeout.mjs';

for (const name of ['.env.local', '.env.production.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  break;
}

const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const secret = process.env.CRON_SECRET;

let failed = 0;

function fail(msg) {
  console.log(`FAIL ${msg}`);
  failed += 1;
}

function pass(msg) {
  console.log(`OK ${msg}`);
}

if (!secret) {
  console.error('Chybí CRON_SECRET v .env.local');
  process.exit(1);
}

console.log(`--- verify-import-gate @ ${BASE_URL} ---`);

let res;
let body;
try {
  res = await fetchWithTimeout(`${BASE_URL}/api/cron/import-spoonacular`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
  }, 120000);
  body = await res.json();
} catch (err) {
  console.error('Request failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

if (res.status !== 200) {
  fail(`HTTP ${res.status}`);
  console.log(JSON.stringify(body, null, 2));
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
pass(`HTTP ${res.status}`);

const fetched = Number(body.fetched ?? 0);
const imported = Number(body.imported ?? 0);
const updated = Number(body.updated ?? 0);
const skippedComplex = Number(body.skipped_complex ?? 0);
const skippedNotRecipe = Number(body.skipped_not_recipe ?? 0);
const skippedMissingNutrition = Number(body.skipped_missing_nutrition ?? 0);
const skippedProtected = Number(body.skipped_protected ?? 0);
const rejected = Number(body.rejected ?? 0);

console.log('\nGate summary:');
console.log(`  fetched:                  ${fetched}`);
console.log(`  imported (inserted):      ${imported}`);
console.log(`  updated:                  ${updated}`);
console.log(`  skipped_complex:          ${skippedComplex}`);
console.log(`  skipped_not_recipe:       ${skippedNotRecipe}`);
console.log(`  skipped_missing_nutrition:${skippedMissingNutrition}`);
console.log(`  skipped_protected:        ${skippedProtected}`);
console.log(`  rejected (total):         ${rejected}`);
if (body.rejectedReason) {
  console.log(`  rejectedReason:           ${JSON.stringify(body.rejectedReason)}`);
}
if (body.stoppedReason) {
  console.log(`  stoppedReason:            ${body.stoppedReason}`);
}

const skippedTotal = skippedComplex + skippedNotRecipe + skippedMissingNutrition + skippedProtected;
const importedTotal = imported + updated;
const gateAccounted = importedTotal + skippedTotal;

if (Number.isFinite(fetched) && fetched >= 0) {
  pass('fetched is present');
} else {
  fail('fetched missing or invalid');
}

if (gateAccounted === fetched) {
  pass(`imported+updated+skipped_* (${gateAccounted}) === fetched (${fetched})`);
} else {
  const simplicityOnly = Math.max(0, rejected - skippedTotal);
  const fullAccounted = gateAccounted + simplicityOnly;
  if (fullAccounted === fetched) {
    pass(
      `imported+updated+skipped_*+simplicity (${fullAccounted}) === fetched (${fetched}); `
      + `simplicity-only rejected: ${simplicityOnly}`,
    );
  } else {
    fail(
      `accounting mismatch: imported+updated (${importedTotal}) + skipped_* (${skippedTotal}) `
      + `+ simplicity (${simplicityOnly}) = ${fullAccounted}, fetched = ${fetched}`,
    );
  }
}

console.log(failed === 0 ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(failed === 0 ? 0 : 1);
