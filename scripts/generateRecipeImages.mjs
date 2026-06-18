#!/usr/bin/env node
/**
 * scripts/generateRecipeImages.mjs
 * OpenAI food fotky → Supabase Storage → recipes_catalog.image_url
 *
 * Režim A — chybějící obrázky (meal_cache atd.):
 *   node scripts/generateRecipeImages.mjs              # dry-run, 3 vzorky
 *   node scripts/generateRecipeImages.mjs --apply
 *
 * Režim B — migrace Spoonacular CDN → vlastní storage:
 *   node scripts/generateRecipeImages.mjs --migrate-spoonacular           # dry-run, 5 vzorků
 *   node scripts/generateRecipeImages.mjs --migrate-spoonacular --apply   # všech ~131
 *
 * Volitelně: --sample N, --limit N
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const APPLY = process.argv.includes('--apply');
const MIGRATE_SPOONACULAR = process.argv.includes('--migrate-spoonacular');
const sampleArgIdx = process.argv.indexOf('--sample');
const limitArgIdx = process.argv.indexOf('--limit');
const defaultSample = MIGRATE_SPOONACULAR ? 5 : 3;
const DRY_RUN_SAMPLE = sampleArgIdx > -1 ? Math.max(1, Number(process.argv[sampleArgIdx + 1]) || defaultSample) : defaultSample;
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

function storagePath(row, { dryRun, migrateSpoonacular }) {
  if (dryRun) {
    return migrateSpoonacular ? `_dry-run/spoonacular-${row.id}.webp` : `_dry-run/${row.id}.webp`;
  }
  if (migrateSpoonacular) return `spoonacular/${row.id}.webp`;
  return `${String(row.source || 'catalog')}/${row.id}.webp`;
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

async function fetchCandidatesMissing() {
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

async function fetchCandidatesSpoonacular() {
  const { data, error } = await supabase
    .from('recipes_catalog')
    .select('id, source, source_id, name_cs, name_en, meal_type, kcal, image_url')
    .eq('active', true)
    .like('image_url', '%spoonacular%')
    .order('id', { ascending: true });
  if (error) {
    console.error('Načtení recipes_catalog (spoonacular) selhalo:', error.message);
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

async function updateImageUrlMissing(rowId, publicUrl) {
  const { error } = await supabase
    .from('recipes_catalog')
    .update({ image_url: publicUrl })
    .eq('id', rowId)
    .is('image_url', null);
  if (error) throw new Error(`DB update id=${rowId}: ${error.message}`);
  stats.db_updated++;
}

async function updateImageUrlSpoonacularMigrate(rowId, publicUrl) {
  const { data, error } = await supabase
    .from('recipes_catalog')
    .update({ image_url: publicUrl })
    .eq('id', rowId)
    .like('image_url', '%spoonacular%')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`DB update id=${rowId}: ${error.message}`);
  if (!data?.id) {
    throw new Error(`DB update id=${rowId}: řádek už nemá spoonacular URL (přeskočeno)`);
  }
  stats.db_updated++;
}

function writePreviewHtml(results, outPath, { migrateSpoonacular }) {
  const rows = results
    .map(
      (r) => `
    <article style="margin:24px 0;padding:16px;border:1px solid #334155;border-radius:12px;background:#1e293b;color:#e2e8f0;">
      <h3 style="margin:0 0 8px;">#${r.id} — ${escapeHtml(r.name_cs)}</h3>
      <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">source=${escapeHtml(r.source)} · ${r.meal_type} · ${r.kcal} kcal</p>
      ${r.oldImageUrl ? `<p style="margin:0 0 8px;font-size:11px;color:#64748b;word-break:break-all;">staré: ${escapeHtml(r.oldImageUrl)}</p>` : ''}
      <p style="margin:0 0 12px;font-size:12px;"><a href="${escapeHtml(r.publicUrl)}" style="color:#a78bfa;">${escapeHtml(r.publicUrl)}</a></p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;">
        ${r.oldImageUrl ? `<figure><figcaption style="font-size:11px;color:#94a3b8;">Spoonacular CDN</figcaption><img src="${escapeHtml(r.oldImageUrl)}" alt="staré" style="max-width:160px;border-radius:8px;" /></figure>` : ''}
        <figure><figcaption style="font-size:11px;color:#94a3b8;">AI / Storage</figcaption><img src="${escapeHtml(r.publicUrl)}" alt="${escapeHtml(r.name_cs)}" style="max-width:160px;border-radius:8px;" /></figure>
      </div>
      <pre style="margin-top:12px;font-size:11px;white-space:pre-wrap;color:#cbd5e1;">${escapeHtml(r.prompt)}</pre>
    </article>`
    )
    .join('\n');
  const applyCmd = migrateSpoonacular
    ? 'node scripts/generateRecipeImages.mjs --migrate-spoonacular --apply'
    : 'node scripts/generateRecipeImages.mjs --apply';
  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><title>Recipe images dry-run preview</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;padding:24px;max-width:900px;margin:0 auto;">
<h1>generateRecipeImages — dry-run (${results.length} vzorků${migrateSpoonacular ? ', migrace Spoonacular' : ''})</h1>
<p style="color:#94a3b8;">DB nebyla upravena. Pro zápis: <code>${escapeHtml(applyCmd)}</code></p>
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

async function processRow(row, { dryRun, migrateSpoonacular }) {
  stats.processed++;
  const prompt = buildPrompt(row);
  const path = storagePath(row, { dryRun, migrateSpoonacular });
  console.log(`\n→ #${row.id} ${dishLabel(row)}`);
  if (migrateSpoonacular && row.image_url) {
    console.log(`  staré URL: ${row.image_url}`);
  }
  console.log(`  prompt: ${prompt.slice(0, 120)}…`);
  try {
    const buffer = await generateImageBuffer(prompt);
    const publicUrl = await uploadToStorage(path, buffer);
    if (!publicUrl) throw new Error('getPublicUrl vrátilo prázdnou URL');
    console.log(`  storage: ${path}`);
    console.log(`  public URL: ${publicUrl}`);
    if (APPLY) {
      if (migrateSpoonacular) {
        await updateImageUrlSpoonacularMigrate(row.id, publicUrl);
      } else {
        await updateImageUrlMissing(row.id, publicUrl);
      }
      console.log('  ✓ image_url zapsáno do DB');
    } else {
      console.log('  (dry-run — DB beze změny)');
    }
    return { ...row, prompt, publicUrl, storagePath: path, oldImageUrl: row.image_url || null };
  } catch (err) {
    stats.failed++;
    console.error(`  ✗ ${err.message || err}`);
    return null;
  }
}

function printSpoonacularRuntimeAudit() {
  console.log('\n=== AUDIT: živá Spoonacular volání za běhu appky ===');
  console.log('(Seed/enrichment skripty vynechány. SPOONACULAR_MODE default=off.)');
  console.log(`
1) pages/api/spoonacular-recipe.js
   GET /api/spoonacular-recipe?id={numeric}
   → fetch api.spoonacular.com/recipes/{id}/information
   Volá se z: PlanViewer (tlačítko Recept), e-maily (odkaz na detail)
   Brána: spoonacularLiveOutboundEnabled(false) → při MODE=off vrací 503 bez HTTP
   ⚠️ Při zrušení subscription: modal Recept + e-mailové odkazy na detail selžou,
      pokud neimplementujeme fallback z recipes_catalog (ingredients/instructions).

2) pages/api/onboarding/replace-meal.js
   getMealData → complexSearch (lib/mealEnrichment.js)
   Stav: SPOONACULAR_REPLACE_MEAL_LIVE=false → API nevolá Spoonacular, vrací neověřené jídlo
   ⚠️ Zapnutí flagu by znovu spotřebovalo kvótu.

3) pages/api/verify-media-apis.js
   Diagnostika: recipes/{id}/information (+ volitelně complexSearch ?deep=1)
   Brána: přeskočeno když MODE≠live
   ⚠️ Admin smoke test, ne user flow.

4) lib/spoonacularClient.js + lib/mealEnrichment.js
   searchSpoonacularRecipe, getMealData → complexSearch + information
   Brána: spoonacularLiveOutboundEnabled — default OFF
   Importováno z replace-meal (paused) a legacy cest.

5) lib/services/planOrchestratorResolve.js → resolveMealsFromCatalog
   Generování plánu: recipes_catalog, spoonacular_http_calls: 0
   ✓ Nezávislé na Spoonacular subscription.

6) lib/recipesCatalog.js catalogRowToStructuredMeal
   Fallback image URL: img.spoonacular.com/recipes/{source_id}-312x231.jpg
   jen když image_url prázdné — po migraci se nepoužije.
   ⚠️ Statický CDN odkaz (ne API), ale po zrušení CDN může obrázek zmizet.

7) components/PlanViewer.js
   fetch('/api/spoonacular-recipe?id=') pro Spoonacular recipe_id z plánu
   Fallback: fetch('/api/recipe?dish=') OpenAI generovaný text (ne Spoonacular)
   ⚠️ Plány s recipe_id ze Spoonacular stále míří na spoonacular-recipe API.

8) E-maily (lib/emailTemplates.js, weeklyPlanEmailV2/V6/V8)
   Odkazy /api/spoonacular-recipe?id=… v HTML plánu
   ⚠️ Stejné riziko jako bod 1.

9) pages/api/body-metrics.js (registrace)
   createInitialAITasks({ spoonacularRegistrationOnly: true })
   Plán jde přes katalog; payload flag je legacy (MODE=off ignoruje live Spoonacular).

SHRNUTÍ při zrušení Spoonacular:
  • Plán + obrázky jídel: OK po migraci image_url (katalog + storage)
  • Rozbité bez úprav: Recept modal (/api/spoonacular-recipe), e-mailové recipe odkazy
  • Potřeba: nový /api/recipe-from-catalog nebo rozšířit /api/recipe o catalog row by id
`);
}

async function main() {
  const modeLabel = MIGRATE_SPOONACULAR
    ? (APPLY ? 'MIGRATE-SPOONACULAR + APPLY' : 'MIGRATE-SPOONACULAR dry-run')
    : (APPLY ? 'FILL-MISSING + APPLY' : 'FILL-MISSING dry-run');

  console.log(`=== generateRecipeImages.mjs — ${modeLabel} ===`);
  console.log(`OpenAI model: ${OPENAI_IMAGE_MODEL}, size: ${OPENAI_IMAGE_SIZE}, quality: ${OPENAI_IMAGE_QUALITY}`);
  console.log(`Odhad nákladů: $${ESTIMATED_COST_PER_IMAGE_USD}/obrázek\n`);

  await ensureRecipeImagesBucket();

  const candidates = MIGRATE_SPOONACULAR
    ? await fetchCandidatesSpoonacular()
    : await fetchCandidatesMissing();

  stats.candidates = candidates.length;
  const bySource = candidates.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1;
    return acc;
  }, {});

  const selectionDesc = MIGRATE_SPOONACULAR
    ? 'active + image_url LIKE %spoonacular%'
    : 'active + image_url IS NULL';

  console.log(`Kandidátů (${selectionDesc}): ${candidates.length}`);
  console.log('  podle source:', bySource);

  if (MIGRATE_SPOONACULAR && candidates.length) {
    const fullCost = (candidates.length * ESTIMATED_COST_PER_IMAGE_USD).toFixed(2);
    console.log(`  odhad plné migrace: ${candidates.length}× $${ESTIMATED_COST_PER_IMAGE_USD} ≈ $${fullCost}`);
  }

  if (!candidates.length) {
    console.log('Nic k doplnění / migraci.');
    if (MIGRATE_SPOONACULAR) printSpoonacularRuntimeAudit();
    return;
  }

  const toProcess = APPLY
    ? (LIMIT ? candidates.slice(0, LIMIT) : candidates)
    : candidates.slice(0, DRY_RUN_SAMPLE);

  console.log(
    `Zpracuji: ${toProcess.length} recept(ů)${APPLY && LIMIT ? ` (--limit ${LIMIT})` : ''}` +
      `${!APPLY ? ` (dry-run --sample ${DRY_RUN_SAMPLE})` : ''}`
  );

  const previewResults = [];
  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const result = await processRow(row, { dryRun: !APPLY, migrateSpoonacular: MIGRATE_SPOONACULAR });
    if (result) previewResults.push(result);
    if (i < toProcess.length - 1) await sleep(800);
  }

  if (!APPLY && previewResults.length) {
    const previewName = MIGRATE_SPOONACULAR
      ? 'spoonacular-migrate-preview.html'
      : 'recipe-images-preview.html';
    const previewPath = resolve(process.cwd(), `scripts/e2e-output/${previewName}`);
    writePreviewHtml(previewResults, previewPath, { migrateSpoonacular: MIGRATE_SPOONACULAR });
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
  console.log(
    `  odhad nákladů USD:    $${stats.estimated_cost_usd.toFixed(3)} (${stats.openai_images_calls}× $${ESTIMATED_COST_PER_IMAGE_USD})`
  );

  if (!APPLY) {
    console.log('\n⚠️  DRY-RUN — do recipes_catalog nebylo nic zapsáno.');
    if (MIGRATE_SPOONACULAR) {
      console.log('    Pro plnou migraci: node scripts/generateRecipeImages.mjs --migrate-spoonacular --apply');
    } else {
      console.log('    Pro plný běh: node scripts/generateRecipeImages.mjs --apply');
    }
  }

  if (MIGRATE_SPOONACULAR) {
    printSpoonacularRuntimeAudit();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
