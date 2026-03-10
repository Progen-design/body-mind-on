/**
 * scripts/check-trusted-assets.mjs
 * Read-only inspection of the trusted asset resolver state.
 *
 * Usage:
 *   node scripts/check-trusted-assets.mjs <SUPABASE_PAT>
 *
 * What it checks:
 *   - meal_metadata_cache: trust level distribution
 *   - meal_metadata_cache: any "exact" entries with null image_url (broken exact)
 *   - exercise_asset_registry: canonical key coverage
 *   - exercise_asset_registry: trust level distribution
 *   - exercises with only pexels fallback (no exact GIF)
 *   - DB schema completeness for both tables
 */
import https from 'https';

const PROJECT_REF = 'ipfyavvmmxmsjupmfnes';
const pat = process.argv[2];

if (!pat) {
  console.error('Usage: node scripts/check-trusted-assets.mjs <SUPABASE_PAT>');
  process.exit(1);
}

function runQuery(pat, projectRef, query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data || '[]')); } catch { resolve([]); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function printSection(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function formatRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) { console.log('  (no data)'); return; }
  for (const row of rows) {
    console.log(' ', Object.entries(row).map(([k, v]) => `${k}=${v}`).join('  |  '));
  }
}

// Canonical keys from exerciseCanonicalMap.js
const CANONICAL_KEYS = [
  'squat', 'pushup', 'pull_up', 'bent_over_row', 'deadlift', 'romanian_deadlift',
  'bench_press', 'overhead_press', 'plank', 'lunges', 'lateral_raise', 'bicep_curl',
  'tricep_extension', 'leg_press', 'warmup', 'cooldown', 'plank_side', 'mountain_climber',
];

async function run() {
  console.log('\n🔍 Body & Mind ON — Trusted Asset Resolver Check');
  console.log(`🔗 Project: ${PROJECT_REF}`);
  console.log(`⏰ Time: ${new Date().toISOString()}`);

  // 1. Meal cache schema
  printSection('meal_metadata_cache — Schema');
  const mealSchema = await runQuery(pat, PROJECT_REF, `
    select column_name from information_schema.columns
    where table_name = 'meal_metadata_cache'
      and column_name in ('name_key', 'image_url', 'image_trust_level', 'exact_source', 'illustrative_source', 'confidence_score')
    order by column_name;
  `);
  const expectedMealCols = ['confidence_score', 'exact_source', 'illustrative_source', 'image_trust_level', 'image_url', 'name_key'];
  const foundMealCols = mealSchema.map((r) => r.column_name);
  for (const col of expectedMealCols) {
    console.log(`  ${foundMealCols.includes(col) ? '✅' : '❌'} meal_metadata_cache.${col}`);
  }

  // 2. Meal cache trust level distribution
  printSection('meal_metadata_cache — Trust Level Distribution');
  const mealTrust = await runQuery(pat, PROJECT_REF, `
    select
      image_trust_level,
      count(*) as count,
      round(count(*) * 100.0 / sum(count(*)) over (), 1) as pct
    from meal_metadata_cache
    group by image_trust_level
    order by count desc;
  `);
  formatRows(mealTrust);

  // 3. Broken exact entries (exact trust but null image)
  printSection('Broken Exact Entries (exact trust, null image)');
  const brokenExact = await runQuery(pat, PROJECT_REF, `
    select name_key, confidence_score
    from meal_metadata_cache
    where image_trust_level = 'exact' and image_url is null
    limit 10;
  `);
  if (!brokenExact.length) {
    console.log('  ✅ No broken exact entries');
  } else {
    console.log(`  ❌ ${brokenExact.length} entries with trust=exact but no image:`);
    formatRows(brokenExact);
  }

  // 4. Pexels marked as exact (should never happen)
  printSection('Pexels Marked as Exact (must be 0)');
  const pexelsExact = await runQuery(pat, PROJECT_REF, `
    select count(*) as count
    from meal_metadata_cache
    where image_trust_level = 'exact' and exact_source = 'pexels';
  `);
  const pe = Number(pexelsExact[0]?.count ?? 0);
  console.log(`  ${pe === 0 ? '✅' : '🚨'} ${pe} Pexels entries incorrectly marked as exact`);

  // 5. Exercise registry schema
  printSection('exercise_asset_registry — Schema');
  const exSchema = await runQuery(pat, PROJECT_REF, `
    select column_name from information_schema.columns
    where table_name = 'exercise_asset_registry'
      and column_name in ('canonical_key', 'gif_url', 'image_url', 'trust_level', 'source')
    order by column_name;
  `);
  const expectedExCols = ['canonical_key', 'gif_url', 'image_url', 'source', 'trust_level'];
  const foundExCols = exSchema.map((r) => r.column_name);
  for (const col of expectedExCols) {
    console.log(`  ${foundExCols.includes(col) ? '✅' : '❌'} exercise_asset_registry.${col}`);
  }

  // 6. Exercise registry trust distribution
  printSection('exercise_asset_registry — Trust Level Distribution');
  const exTrust = await runQuery(pat, PROJECT_REF, `
    select trust_level, source, count(*)
    from exercise_asset_registry
    group by trust_level, source
    order by count desc;
  `);
  formatRows(exTrust);

  // 7. Canonical key coverage
  printSection('Canonical Key Coverage');
  const regKeys = await runQuery(pat, PROJECT_REF, `
    select canonical_key from exercise_asset_registry order by canonical_key;
  `);
  const registeredKeys = new Set(regKeys.map((r) => r.canonical_key));
  let populated = 0;
  let missing = 0;
  for (const key of CANONICAL_KEYS) {
    const found = registeredKeys.has(key);
    if (found) populated++;
    else missing++;
    if (!found) console.log(`  ⬜ ${key} — not yet populated`);
  }
  console.log(`\n  ✅ ${populated}/${CANONICAL_KEYS.length} canonical keys in registry`);
  if (missing > 0) {
    console.log(`  ℹ️  ${missing} keys will be auto-populated on first plan enrichment call`);
  }

  // 8. Exercises with fallback-only (no GIF from ExerciseDB)
  printSection('Exercises with Pexels Fallback Only');
  const fallbackOnly = await runQuery(pat, PROJECT_REF, `
    select canonical_key, source, trust_level
    from exercise_asset_registry
    where trust_level = 'fallback'
    order by canonical_key;
  `);
  if (!fallbackOnly.length) {
    console.log('  ✅ No exercises using fallback-only (all have exact GIFs)');
  } else {
    console.log(`  ℹ️  ${fallbackOnly.length} exercise(s) using Pexels fallback:`);
    formatRows(fallbackOnly);
  }

  console.log('\n✅ Asset check complete.\n');
}

run().catch((err) => {
  console.error('❌ Check failed:', err.message);
  process.exit(1);
});
