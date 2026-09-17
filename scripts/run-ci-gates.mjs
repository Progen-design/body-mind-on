#!/usr/bin/env node
/**
 * Spouští všechny skripty ze skupiny A (docs/BRANY_KVALITY.md) — bez sítě,
 * bez service_role, bez prohlížeče, dnes zelené. Volané z `npm run check`
 * a z CI (Blok 3, PROMPT_UKLID.md 2026-09-17).
 *
 * Seznam se needituje ručně na dvou místech: zdroj pravdy je
 * docs/BRANY_KVALITY.md, tenhle soubor jen vypisuje, co z něj vzniklo přes
 * `grep "^| verify-" docs/BRANY_KVALITY.md` (skupina `**A**`, ne `A*` ani B).
 * Když se klasifikace skriptu změní, uprav tabulku i tenhle seznam spolu.
 */
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const GROUP_A_SCRIPTS = [
  'verify-birthdate-persistence.mjs',
  'verify-dietary-exclusions.mjs',
  'verify-email-config.mjs',
  'verify-email-cta-profile-access.mjs',
  'verify-exercise-integrity.mjs',
  'verify-exercise-registry.mjs',
  'verify-footer-legal-links.mjs',
  'verify-google-calendar-config.mjs',
  'verify-lifecycle-emails.mjs',
  'verify-macro-kcal-consistency.mjs',
  'verify-meal-replacement-actions.mjs',
  'verify-plan-kcal-roundtrip.mjs',
  'verify-plan-quality-invariants.mjs',
  'verify-product-consistency.mjs',
  'verify-profile-macro-chart.mjs',
  'verify-profile-real-user-bugfixes.mjs',
  'verify-profile-today-ux.mjs',
  'verify-profile-weight-consistency.mjs',
  'verify-progress-integrity.mjs',
  'verify-simple-meals.mjs',
  'verify-start-meal-variability.mjs',
  'verify-start-meals-library-only.mjs',
  'verify-stripe-tier-mapping.mjs',
  'verify-training-environment-strictness.mjs',
  'verify-weekly-structured-source.mjs',
  'verify-workout-exercise-copy.mjs',
  'verify-workout-muscle-selection.mjs',
  'verify-workout-publishable-gate.mjs',
  'verify-workout-replacement-actions.mjs',
];

let failed = 0;
for (const script of GROUP_A_SCRIPTS) {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts', script)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) {
    failed += 1;
    console.error(`\nFAIL gate: ${script}\n`);
  }
}

console.log(
  failed
    ? `\nCI GATES: ${failed}/${GROUP_A_SCRIPTS.length} skript(ů) selhalo`
    : `\nCI GATES: všech ${GROUP_A_SCRIPTS.length} skupiny A PASS`
);
process.exit(failed ? 1 : 0);
