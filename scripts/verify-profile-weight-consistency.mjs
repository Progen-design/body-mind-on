#!/usr/bin/env node

function computeProfileDisplayWeight(metrics) {
  const sorted = [...(metrics || [])].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
  const latest = sorted[0];
  const first = sorted[sorted.length - 1];
  const startWeight = first?.weight_kg != null ? Number(first.weight_kg) : null;
  const currentWeight = latest?.weight_kg != null ? Number(latest.weight_kg) : null;
  const hasManualWeightUpdate = sorted.length > 1
    && latest?.weight_kg != null
    && first?.weight_kg != null
    && Number(latest.weight_kg) !== Number(first.weight_kg);
  return hasManualWeightUpdate ? currentWeight : (startWeight ?? currentWeight);
}

let failed = 0;
function fail(msg) {
  console.log(`FAIL ${msg}`);
  failed += 1;
}
function ok(msg) {
  console.log(`OK ${msg}`);
}

console.log('--- profile weight after registration ---');
const registrationOnly = [{ weight_kg: 78, created_at: '2026-06-25T10:00:00Z' }];
const w1 = computeProfileDisplayWeight(registrationOnly);
if (w1 !== 78) fail(`expected 78, got ${w1}`);
else ok('registration weight 78 kg preserved');

console.log('\n--- no phantom drop without manual update ---');
const withWorkoutsButSameWeight = [
  { weight_kg: 78, created_at: '2026-06-25T10:00:00Z' },
];
const w2 = computeProfileDisplayWeight(withWorkoutsButSameWeight);
if (w2 !== 78) fail(`expected 78 without manual update, got ${w2}`);
else ok('no automatic weight change');

console.log('\n--- manual update respected ---');
const manual = [
  { weight_kg: 77, created_at: '2026-06-28T10:00:00Z' },
  { weight_kg: 78, created_at: '2026-06-25T10:00:00Z' },
];
const w3 = computeProfileDisplayWeight(manual);
if (w3 !== 77) fail(`expected manual 77, got ${w3}`);
else ok('manual weight update shown');

console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
