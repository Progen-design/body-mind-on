// Ostry beh automatu na cviky. Merime, ne odhadujeme.
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && process.env[m[1].trim()] == null) {
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { objednejChybejiciPokryti } = await import('../lib/exerciseImportQueue.js');
const { runExerciseImport } = await import('../lib/exerciseImportRun.js');
const { supabaseServer } = await import('../lib/supabaseServer.js');

const pred = await supabaseServer.from('exercise_asset_registry')
  .select('id', { count: 'exact', head: true }).eq('usable_in_plan', true);
console.log('PRED: pouzitelnych cviku v katalogu =', pred.count);

const objednano = await objednejChybejiciPokryti();
console.log('objednano dvojic:', objednano.length);

const v = await runExerciseImport({ dryRun: process.argv.includes('--dry') });
console.log('vysledek:', JSON.stringify({
  dry_run: v.dry_run, objednavek: v.objednavek, zapsano: v.zapsano,
  skipped: v.skipped ?? false, reason: v.reason ?? null,
  chyby: v.chyby, zahozeno: v.zahozeno,
}, null, 1));

const po = await supabaseServer.from('exercise_asset_registry')
  .select('id', { count: 'exact', head: true }).eq('usable_in_plan', true);
console.log('PO: pouzitelnych cviku v katalogu =', po.count);
