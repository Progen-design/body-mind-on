#!/usr/bin/env node
/**
 * scripts/generateRecipeImages.mjs
 * Doplnění image_url u receptů v recipes_catalog (active, image_url IS NULL).
 * Pro recepty bez Spoonacular ID (typicky source='meal_cache') generuje food foto
 * přes OpenAI Images API (gpt-image-1), uloží do Supabase Storage a zapíše public URL.
 *
 * DEFAULT = DRY-RUN (3 vzorky, generuje obrázky + preview HTML, NIC nezapisuje do DB):
 *   node scripts/generateRecipeImages.mjs
 *
 * Plný zápis (idempotentní — jen řádky s image_url IS NULL):
 *   node scripts/generateRecipeImages.mjs --apply
 *
 * Volitelně:
 *   --sample N   počet vzorků v dry-run (default 3)
 *   --limit N    max receptů v --apply režimu
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const APPLY = process.argv.includes('--apply');
const sampleArgIdx = process.argv.indexOf('--sample');
const limitArgIdx = process.argv.indexOf('--limit');
const DRY_RUN_SAMPLE = sampleArgIdx > -1 ? Math.max(1, Number(process.argv[sampleArgIdx + 1]) || 3) : 3;
const LIMIT = limitArgIdx > -1 ? Math.max(1, Number(process.argv[limitArgIdx + 1]) || 0) : null;

const BUCKET = 'recipe-images';
const OPENAI_IMAGE_MODEL = process.env.RECIPE_IMAGE_MODEL || 'gpt-image-1';
const OPENAI_IMAGE_SIZE = process.env.RECIPE_IMAGE_SIZE || '1024x1024';
const OPENAI_IMAGE_QUALITY = process.env.RECIPE_IMAGE_QUALITY || 'medium';
/** Odhad $/obrázek pro log (gpt-image-1 medium 1024 ≈ 0.042 USD — uprav dle faktury). */
const ESTIMATED_COST_PER_IMAGE_USD = Number(process.env.RECIPE_IMAGE_COST_USD || '0.042');

/** Načte env — Supabase z production, OpenAI z .env/.env.local (prod klíč bývá jiný/neplatný). */
function loadEnvFiles() {
  const loadFile = (name, keysFilter = null) => {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) return;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      if (keysFilter && !keysFilter.includes(k)) continue;
      process.env[k] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  };
  loadFile('.env');
  loadFile('.env.local');
  loadFile('.env.production.local', [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);
}

loadEnvFiles();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('Chybí OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const stats = {
  candidates: 0,
  processed: 0,
  generated: 0,
  uploaded: 0,
  db_updated: 0,
  skipped_existing_url: 0,
  failed: 0,
  openai_images_calls: 0,
  estimated_cost_usd: 0,
};

function dishLabel(row) {
  return String(row.name_cs || row.name_en || 'jídlo').trim();
}

function buildPrompt(row) {
  const name = dishLabel(row);
  return (
    `profesionální food fotografie: ${name}, na talíři, pohled shora, ` +
    'přirozené světlo, čisté světlé pozadí, bez textu'
  );
}

function storagePath(row, dryRun) {
  const prefix = dryRun ? '_dry-run' : String(row.source || 'catalog');
  return `${prefix}/${row.id}.webp`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 1×1 px WebP pro probe upload (ověření bucketu bez listBuckets). */
const PROBE_WEBP = Buffer.from(
  'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=',
  'base64'
);

async function ensureRecipeImagesBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const listed = (buckets || []).some((b) => b.name === BUCKET);
  if (listed) {
    console.log(`✓ Storage bucket „${BUCKET}“ existuje (public read přes getPublicUrl).`);
    return;
  }

  // listBuckets často vrací [] i se service role — ověř skutečný upload
  const probePath = '_probe/bucket-check.webp';
  const { error: probeErr } = await supabase.storage.from(BUCKET).upload(probePath, PROBE_WEBP, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (!probeErr) {
    console.log(`✓ Bucket „${BUCKET}“ dostupný (ověřeno uploadem, listBuckets nevrátilo seznam).`);
    return;
  }

  if (!/not found|does not exist|Bucket not found/i.test(probeErr.message || '')) {
    console.error(`Bucket „${BUCKET}“ — probe upload selhal:`, probeErr.message);
    process.exit(1);
  }

  console.log(`Bucket „${BUCKET}“ neexistuje — zakládám veřejný bucket…`);
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'],
  });
  if (createErr) {
    console.error(`createBucket „${BUCKET}“ selhalo:`, createErr.message);
    console.error(
      'Založ bucket v Supabase Dashboard (Storage → New bucket → public „recipe-images“) ' +
        'nebo spusť SQL INSERT do storage.buckets.'
    );
    process.exit(1);
  }
  console.log(`✓ Bucket „${BUCKET}“ vytvořen (public).`);
}

async function fetchCandidates() {
  const { data, error } = await supabase
    .from('recipes_catalog')
    .select('id, source, source_id, name_cs, name_en, meal_type, kcal, image_url')
    .eq('active', true)
    .is('image_url', null)
    .order('id', { ascending: true });
  if (error) {
    console.error('Načtení recipes_catalog selhalo:', error.message);
    process.exit(1);
  }
  return data || [];
}

async function generateImageBuffer(prompt) {
  stats.openai_images_calls++;
  const response = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: OPENAI_IMAGE_SIZE,
    quality: OPENAI_IMAGE_QUALITY,
    output_format: 'webp',
  });
  const b64 = response?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI nevrátilo b64_json');
  stats.generated++;
  stats.estimated_cost_usd += ESTIMATED_COST_PER_IMAGE_USD;
  return Buffer.from(b64, 'base64');
}

async function uploadToStorage(path, buffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: 'image/webp',
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) throw new Error(`Storage upload: ${error.message}`);
  stats.uploaded++;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

async function updateImageUrl(rowId, publicUrl) {
  const { error } = await supabase
    .from('recipes_catalog')
    .update({ image_url: publicUrl })
    .eq('id', rowId)
    .is('image_url', null);
  if (error) throw new Error(`DB update id=${rowId}: ${error.message}`);
  stats.db_updated++;
}

function writePreviewHtml(results, outPath) {
  const rows = results
    .map(
      (r) => `
    <article style="margin:24px 0;padding:16px;border:1px solid #334155;border-radius:12px;background:#1e293b;color:#e2e8f0;">
      <h3 style="margin:0 0 8px;">#${r.id} — ${escapeHtml(r.name_cs)}</h3>
      <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">source=${escapeHtml(r.source)} · ${r.meal_type} · ${r.kcal} kcal</p>
      <p style="margin:0 0 12px;font-size:12px;"><a href="${escapeHtml(r.publicUrl)}" style="color:#a78bfa;">${escapeHtml(r.publicUrl)}</a></p>
      <img src="${escapeHtml(r.publicUrl)}" alt="${escapeHtml(r.name_cs)}" style="max-width:320px;width:100%;border-radius:12px;" />
      <pre style="margin-top:12px;font-size:11px;white-space:pre-wrap;color:#cbd5e1;">${escapeHtml(r.prompt)}</pre>
    </article>`
    )
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><title>Recipe images dry-run preview</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;padding:24px;max-width:720px;margin:0 auto;">
<h1>generateRecipeImages — dry-run preview (${results.length} vzorků)</h1>
<p style="color:#94a3b8;">DB nebyla upravena. Pro zápis: <code>node scripts/generateRecipeImages.mjs --apply</code></p>
${rows}
</body></html>`;
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function processRow(row, { dryRun }) {
  stats.processed++;
  const prompt = buildPrompt(row);
  const path = storagePath(row, dryRun);
  console.log(`\n→ #${row.id} ${dishLabel(row)}`);
  console.log(`  prompt: ${prompt.slice(0, 120)}…`);
  try {
    const buffer = await generateImageBuffer(prompt);
    const publicUrl = await uploadToStorage(path, buffer);
    if (!publicUrl) throw new Error('getPublicUrl vrátilo prázdnou URL');
    console.log(`  storage: ${path}`);
    console.log(`  public URL: ${publicUrl}`);
    if (APPLY) {
      await updateImageUrl(row.id, publicUrl);
      console.log('  ✓ image_url zapsáno do DB');
    } else {
      console.log('  (dry-run — DB beze změny)');
    }
    return { ...row, prompt, publicUrl, storagePath: path };
  } catch (err) {
    stats.failed++;
    console.error(`  ✗ ${err.message || err}`);
    return null;
  }
}

async function main() {
  console.log(`=== generateRecipeImages.mjs — režim: ${APPLY ? 'APPLY (zápis do DB)' : 'DRY-RUN (bez DB)'} ===`);
  console.log(`OpenAI model: ${OPENAI_IMAGE_MODEL}, size: ${OPENAI_IMAGE_SIZE}, quality: ${OPENAI_IMAGE_QUALITY}`);
  console.log(`Odhad nákladů: $${ESTIMATED_COST_PER_IMAGE_USD}/obrázek\n`);

  await ensureRecipeImagesBucket();

  const candidates = await fetchCandidates();
  stats.candidates = candidates.length;
  const bySource = candidates.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1;
    return acc;
  }, {});
  console.log(`Kandidátů (active + image_url IS NULL): ${candidates.length}`);
  console.log('  podle source:', bySource);

  if (!candidates.length) {
    console.log('Nic k doplnění.');
    return;
  }

  const toProcess = APPLY
    ? (LIMIT ? candidates.slice(0, LIMIT) : candidates)
    : candidates.slice(0, DRY_RUN_SAMPLE);

  console.log(`Zpracuji: ${toProcess.length} recept(ů)${APPLY && LIMIT ? ` (--limit ${LIMIT})` : ''}${!APPLY ? ` (dry-run --sample ${DRY_RUN_SAMPLE})` : ''}`);

  const previewResults = [];
  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const result = await processRow(row, { dryRun: !APPLY });
    if (result) previewResults.push(result);
    if (i < toProcess.length - 1) await sleep(800);
  }

  if (!APPLY && previewResults.length) {
    const previewPath = resolve(process.cwd(), 'scripts/e2e-output/recipe-images-preview.html');
    writePreviewHtml(previewResults, previewPath);
    console.log(`\n📄 HTML preview: ${previewPath}`);
  }

  console.log('\n=== SOUHRN ===');
  console.log(`  kandidátů celkem:     ${stats.candidates}`);
  console.log(`  zpracováno:           ${stats.processed}`);
  console.log(`  OpenAI images volání: ${stats.openai_images_calls}`);
  console.log(`  vygenerováno:         ${stats.generated}`);
  console.log(`  nahráno do Storage:   ${stats.uploaded}`);
  console.log(`  DB image_url update:  ${stats.db_updated}`);
  console.log(`  selhalo:              ${stats.failed}`);
  console.log(`  odhad nákladů USD:    $${stats.estimated_cost_usd.toFixed(3)} (${stats.openai_images_calls}× $${ESTIMATED_COST_PER_IMAGE_USD})`);
  if (!APPLY) {
    console.log('\n⚠️  DRY-RUN — do recipes_catalog nebylo nic zapsáno.');
    console.log('    Pro plný běh: node scripts/generateRecipeImages.mjs --apply');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
