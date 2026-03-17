#!/usr/bin/env node
/**
 * Smazat illustrative/none z meal_metadata_cache pro re-enrichment s novými pravidly obrázků.
 * Spustit: node scripts/clear-meal-cache-illustrative.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.local or .env if exists
for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (existsSync(p)) {
    const c = readFileSync(p, 'utf8');
    for (const line of c.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    break;
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  let total = 0;
  const { data: d1, error: e1 } = await supabase
    .from('meal_metadata_cache')
    .delete()
    .in('image_trust_level', ['illustrative', 'none'])
    .select('name_key');
  if (e1) {
    console.error('Chyba:', e1.message);
    process.exit(1);
  }
  total += (d1 || []).length;

  const { data: d2, error: e2 } = await supabase
    .from('meal_metadata_cache')
    .delete()
    .is('image_trust_level', null)
    .select('name_key');
  if (e2) {
    console.error('Chyba null:', e2.message);
  } else {
    total += (d2 || []).length;
  }
  console.log('Smazáno', total, 'záznamů z meal_metadata_cache (illustrative/none/null)');
}

main();
