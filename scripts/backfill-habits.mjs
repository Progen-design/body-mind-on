#!/usr/bin/env node
/**
 * Jednorázový backfill: daily_activity_completions (activity_type=habit) → habit_logs.
 *
 * Mapuje activity_key na kanonické habit_id z lib/habits.js (ALL_HABIT_IDS).
 * Neznámé / nemapovatelné klíče = fail fast (exit 1), žádný tichý zápis.
 *
 * Výchozí režim je dry-run (bez zápisu). Pro zápis: --apply
 *
 *   node scripts/backfill-habits.mjs
 *   node scripts/backfill-habits.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv } from './audit-utils.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { calendarDateIsoInPrague } from '../lib/czechCalendar.js';
import { ALL_HABIT_IDS } from '../lib/habits.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(ROOT);

const apply = process.argv.includes('--apply');

/** Kanonický seznam — stejný jako HabitTracker / isValidHabitId v lib/habits.js */
const CANONICAL_HABIT_IDS = Object.freeze([...ALL_HABIT_IDS]);
const CANONICAL_SET = new Set(CANONICAL_HABIT_IDS);

/**
 * Legacy klíče z daily_activity_completions, které nejsou 1:1 s kanonickým ID.
 * Klíč = activity_key ve zdroji, hodnota = kanonické habit_id nebo null (= přeskočit, nevkládat).
 */
const LEGACY_HABIT_ID_MAP = Object.freeze({
  // Známé legacy aliasy (zatím prázno — produkční data jsou 1:1).
  // movement: 'training',
});

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL (nebo NEXT_PUBLIC_SUPABASE_URL) a SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

function rowKey({ user_id, habit_id, log_date }) {
  return `${user_id}|${log_date}|${habit_id}`;
}

/**
 * @returns {{ canonicalId: string, action: 'passthrough'|'remap'|'unmapped' }}
 */
function resolveCanonicalHabitId(sourceKey) {
  const raw = String(sourceKey || '').trim();
  if (!raw) {
    return { canonicalId: null, action: 'unmapped', reason: 'prázdný activity_key' };
  }

  if (CANONICAL_SET.has(raw)) {
    return { canonicalId: raw, action: 'passthrough', reason: 'kanonické ID' };
  }

  if (Object.prototype.hasOwnProperty.call(LEGACY_HABIT_ID_MAP, raw)) {
    const target = LEGACY_HABIT_ID_MAP[raw];
    if (target == null) {
      return { canonicalId: null, action: 'unmapped', reason: 'legacy klíč bez ekvivalentu (explicitně přeskočit)' };
    }
    if (!CANONICAL_SET.has(target)) {
      return { canonicalId: null, action: 'unmapped', reason: `legacy map cíl "${target}" není kanonický` };
    }
    return { canonicalId: target, action: 'remap', reason: `legacy → ${target}` };
  }

  return { canonicalId: null, action: 'unmapped', reason: 'mimo kanonický seznam i LEGACY_HABIT_ID_MAP' };
}

async function fetchSourceRows() {
  const { data, error } = await admin
    .from('daily_activity_completions')
    .select('id, user_id, activity_key, completed_at, created_at')
    .eq('activity_type', 'habit')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Načtení daily_activity_completions: ${error.message}`);
  return data || [];
}

async function fetchExistingKeys(payloads) {
  const userIds = [...new Set(payloads.map((p) => p.user_id))];
  if (userIds.length === 0) return new Set();

  const { data, error } = await admin
    .from('habit_logs')
    .select('user_id, habit_id, log_date')
    .in('user_id', userIds);
  if (error) throw new Error(`Načtení habit_logs: ${error.message}`);

  const keys = new Set();
  for (const row of data || []) {
    keys.add(rowKey(row));
  }
  return keys;
}

async function main() {
  console.log(apply ? 'Režim: APPLY (zápis do habit_logs)' : 'Režim: DRY-RUN (bez zápisu)');
  console.log('');
  console.log(`Kanonických habit_id (habits.js): ${CANONICAL_HABIT_IDS.length}`);
  console.log(CANONICAL_HABIT_IDS.join(', '));
  console.log('');

  const sourceRows = await fetchSourceRows();
  const readCount = sourceRows.length;

  const mappingDecisions = [];
  const unmapped = [];
  const payloads = [];

  for (const row of sourceRows) {
    const sourceKey = String(row.activity_key || '').trim();
    const resolved = resolveCanonicalHabitId(sourceKey);
    const log_date = calendarDateIsoInPrague(row.completed_at || row.created_at);

    mappingDecisions.push({
      source_id: row.id,
      source_key: sourceKey,
      canonical_id: resolved.canonicalId,
      action: resolved.action,
      reason: resolved.reason,
      log_date,
      user_id: row.user_id,
    });

    if (resolved.action === 'unmapped') {
      unmapped.push({ source_id: row.id, source_key: sourceKey, reason: resolved.reason });
      continue;
    }

    payloads.push({
      user_id: row.user_id,
      habit_id: resolved.canonicalId,
      log_date,
      completed: true,
      _source_key: sourceKey,
      _action: resolved.action,
    });
  }

  console.log('Mapovací tabulka (distinct source → canonical):');
  const distinctSources = [...new Set(mappingDecisions.map((m) => m.source_key))];
  for (const src of distinctSources) {
    const sample = mappingDecisions.find((m) => m.source_key === src);
    const canonical = sample.canonical_id ?? '—';
    const actionLabel =
      sample.action === 'passthrough' ? 'passthrough (1:1)'
        : sample.action === 'remap' ? `remap → ${canonical}`
          : 'unmapped (nevkládat)';
    console.log(`  ${src.padEnd(22)} → ${String(canonical).padEnd(22)} | ${actionLabel}`);
    if (sample.reason) console.log(`    důvod: ${sample.reason}`);
  }
  console.log('');

  console.log('Řádky:');
  for (const m of mappingDecisions) {
    console.log(
      `  [${m.source_id.slice(0, 8)}…] ${m.source_key} → ${m.canonical_id ?? 'SKIP'} (${m.action}, ${m.log_date})`,
    );
  }
  console.log('');

  if (unmapped.length > 0) {
    console.error('FAIL FAST: nalezeny nemapovatelné activity_key:');
    for (const u of unmapped) {
      console.error(`  - "${u.source_key}" [${u.source_id}]: ${u.reason}`);
    }
    console.error('');
    console.error('Oprav LEGACY_HABIT_ID_MAP nebo vyčisti zdrojová data před --apply.');
    process.exit(1);
  }

  const existingKeys = await fetchExistingKeys(payloads);
  const toInsert = [];
  let alreadyPresent = 0;

  for (const p of payloads) {
    if (existingKeys.has(rowKey(p))) {
      alreadyPresent += 1;
    } else {
      toInsert.push(p);
    }
  }

  let inserted = 0;

  if (apply && toInsert.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize).map(({ user_id, habit_id, log_date, completed }) => ({
        user_id,
        habit_id,
        log_date,
        completed,
      }));
      const { error } = await admin.from('habit_logs').upsert(chunk, {
        onConflict: 'user_id,log_date,habit_id',
        ignoreDuplicates: true,
      });
      if (error) throw new Error(`Zápis habit_logs: ${error.message}`);
      inserted += chunk.length;
    }
  }

  const wouldInsert = apply ? inserted : toInsert.length;
  const skippedUnmapped = unmapped.length;
  const skipped = alreadyPresent + skippedUnmapped;

  console.log('Souhrn:');
  console.log(`  přečteno (daily_activity_completions habit): ${readCount}`);
  console.log(`  vloženo: ${wouldInsert}`);
  console.log(`  přeskočeno: ${skipped} (již v habit_logs: ${alreadyPresent}, unmapped: ${skippedUnmapped})`);

  if (!apply && toInsert.length > 0) {
    console.log('');
    console.log('Pro zápis spusť: node scripts/backfill-habits.mjs --apply');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
