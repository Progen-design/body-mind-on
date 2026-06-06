/**
 * Ověří funkčnost všech trusted ExerciseDB GIF URL (lokální CI / před deployem).
 * Usage: node scripts/verify-exercise-registry.mjs
 */
import {
  TRUSTED_EXERCISE_GIF_BY_KEY,
  TRUSTED_EXTENDED_GIF_BY_KEY,
} from '../lib/exerciseRegistryMedia.js';

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

let failed = 0;

console.log('Canonical exercises:');
for (const [key, url] of Object.entries(TRUSTED_EXERCISE_GIF_BY_KEY)) {
  const ok = await headOk(url);
  console.log(`  ${ok ? '✅' : '❌'} ${key}`);
  if (!ok) failed += 1;
}

console.log('\nExtended exercises:');
for (const [key, url] of Object.entries(TRUSTED_EXTENDED_GIF_BY_KEY)) {
  const ok = await headOk(url);
  console.log(`  ${ok ? '✅' : '❌'} ${key}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n❌ ${failed} broken GIF URL(s)`);
  process.exit(1);
}
console.log('\n✅ All trusted exercise GIF URLs OK');
