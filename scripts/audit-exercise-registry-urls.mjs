/**
 * Audit exercise_asset_registry URLs (HEAD check).
 * Usage: node scripts/audit-exercise-registry-urls.mjs
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or run via Supabase MCP output)
 */
import { createClient } from '@supabase/supabase-js';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkUrl(url) {
  if (!url || typeof url !== 'string') return { url, status: 'missing' };
  try {
    const res = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' }, FETCH_TIMEOUT.GET);
    return { url, status: res.ok ? 'ok' : `http_${res.status}` };
  } catch (e) {
    return { url, status: `error:${formatFetchError(e, url)}` };
  }
}

async function main() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('exercise_asset_registry')
    .select('canonical_key, display_name_cs, gif_url, image_url, wger_exercise_image_url')
    .eq('trust_level', 'exact')
    .order('canonical_key');
  if (error) throw error;

  const broken = [];
  const noMedia = [];
  for (const row of data || []) {
    const gif = await checkUrl(row.gif_url);
    const img = await checkUrl(row.image_url);
    const wgerImg = await checkUrl(row.wger_exercise_image_url);
    const hasOkGif = gif.status === 'ok';
    const hasOkImg = img.status === 'ok' || wgerImg.status === 'ok';
    if (!hasOkGif && !hasOkImg) {
      noMedia.push({ key: row.canonical_key, name: row.display_name_cs, gif: gif.status, img: img.status });
    }
    if (row.gif_url && gif.status !== 'ok') {
      broken.push({ key: row.canonical_key, field: 'gif_url', ...gif });
    }
    if (row.image_url && img.status !== 'ok') {
      broken.push({ key: row.canonical_key, field: 'image_url', ...img });
    }
    if (row.wger_exercise_image_url && wgerImg.status !== 'ok') {
      broken.push({ key: row.canonical_key, field: 'wger_exercise_image_url', ...wgerImg });
    }
  }
  console.log(JSON.stringify({ total: data?.length, noMedia, broken }, null, 2));
  process.exit(noMedia.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
