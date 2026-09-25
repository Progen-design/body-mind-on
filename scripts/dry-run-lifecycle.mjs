#!/usr/bin/env node
/**
 * DRY-RUN LIFECYCLE E-MAILŮ — KDO BY DOSTAL CO. NIC NEPOSÍLÁ, NIC NEZAPISUJE.
 *
 * Projde stejné kandidáty a stejná pravidla jako cron /api/cron/lifecycle-email
 * (krok evaluate), ale místo zařazení do fronty jen vypíše řádek:
 *
 *   user_id  trigger  kdy
 *
 * Jen čtení: memberships, lifecycle_emails (historie) a auth (kvůli vyřazení
 * testovacích adres — ty se nevypisují). E-mailové adresy se nevypisují.
 *
 * Použití:
 *   node scripts/dry-run-lifecycle.mjs                 # podle LIFECYCLE_TRIAL_ENDED_ENABLED v env
 *   node scripts/dry-run-lifecycle.mjs --trial-ended   # jako by byl flag zapnutý
 */
import { loadLocalEnv } from './audit-utils.mjs';

loadLocalEnv();

const { isSyntheticEmail, isTrialEndedEmailEnabled, pickNextLifecycleEmail } =
  await import('../lib/lifecycleEmailRules.js');
const { getUserEmail, getUserEmailHistory, listCandidateMemberships } =
  await import('../lib/lifecycleEmailStore.js');

const trialEndedEnabled = process.argv.includes('--trial-ended') || isTrialEndedEmailEnabled();
const now = new Date();

const memberships = await listCandidateMemberships();
const radky = [];
let testovacich = 0;

for (const m of memberships) {
  const { allKeys, sentKeys, lastSentAt } = await getUserEmailHistory(m.user_id);
  const akce = pickNextLifecycleEmail(m, { now, alreadySent: allKeys, sentKeys, lastSentAt, trialEndedEnabled });
  if (!akce) continue;
  const email = await getUserEmail(m.user_id);
  if (!email || isSyntheticEmail(email)) { testovacich += 1; continue; }
  radky.push({ user_id: m.user_id, trigger: akce.triggerKey, kdy: akce.scheduledAt.toISOString() });
}

console.log(`DRY-RUN ${now.toISOString()} · flag trial_ended: ${trialEndedEnabled ? 'ZAP' : 'VYP'} · kandidátů ${memberships.length}`);
if (radky.length) console.table(radky);
else console.log('Nikdo by teď nic nedostal.');
if (testovacich) console.log(`(vynecháno ${testovacich} testovacích nebo bez e-mailu)`);
console.log('Nic se neodeslalo ani nezařadilo do fronty.');
