/**
 * TRUSTED_EXERCISE_GIF_BY_KEY a TRUSTED_EXTENDED_GIF_BY_KEY (lib/exerciseRegistryMedia.js)
 * jsou od 14. 9. 2026 natrvalo prázdné (docs/DALSI_KROK.md 9.12) — nezbyl žádný
 * natvrdo daný fallback GIF k ověření. Tenhle skript proto nemá co dělat;
 * nahrazuje ho scripts/audit-exercise-registry-urls.mjs, který kontroluje HEAD
 * status VŠECH řádků exercise_asset_registry (ne jen natvrdo daný seznam).
 * Usage: node scripts/audit-exercise-registry-urls.mjs
 */
import {
  TRUSTED_EXERCISE_GIF_BY_KEY,
  TRUSTED_EXTENDED_GIF_BY_KEY,
} from '../lib/exerciseRegistryMedia.js';

const keyCount =
  Object.keys(TRUSTED_EXERCISE_GIF_BY_KEY).length +
  Object.keys(TRUSTED_EXTENDED_GIF_BY_KEY).length;

if (keyCount > 0) {
  console.error(
    `❌ TRUSTED_EXERCISE_GIF_BY_KEY/TRUSTED_EXTENDED_GIF_BY_KEY mají ${keyCount} klíč(ů), ale měly by být natrvalo prázdné (docs/DALSI_KROK.md 9.12) — tenhle skript už nekontroluje jejich obsah. Použij scripts/audit-exercise-registry-urls.mjs.`
  );
  process.exit(1);
}

console.log(
  '✅ TRUSTED_EXERCISE_GIF_BY_KEY i TRUSTED_EXTENDED_GIF_BY_KEY jsou prázdné, jak mají být. '
  + 'Skutečná kontrola médií je v scripts/audit-exercise-registry-urls.mjs.'
);
