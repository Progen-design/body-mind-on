#!/usr/bin/env node
/**
 * Oprava aktivních plánů `lactose_free` účtů, které obsahují mléčný sýr.
 *
 * PROČ TENHLE SKRIPT A NE `regenerate-legacy-start-plans.mjs`. Ten volá
 * NASAZENÉ produkční API, takže by plán vyrobil znovu toutéž vadnou bránou.
 * Tady se pouští `enforceDietaryPublishGate()` z lokálního `lib/` — tedy už
 * opravený seznam `DAIRY_TERMS` — a přepíše se `structured_plan_json`.
 *
 * Blocker doložen 14. 8. 2026: `feta` v seznamu chyběla, `parmazan` byl
 * překlep proti českému „parmezán“. Detaily v hlavičce lib/dietaryExclusions.js.
 *
 *   npm run fix:lactose-free-plans
 *   npm run fix:lactose-free-plans -- --apply
 *
 * MUSÍ BĚŽET S `--import ./scripts/lib/extensionlessResolve-register.mjs`
 * (npm skript to dělá za tebe). `lib/planRenderer.js` importuje bezpříponově,
 * což holý Node ESM neumí — bez hooku by šel opravit `structured_plan_json`,
 * ale `plan_html` by zůstalo s fetou. Přesně to je past, kterou tenhle skript
 * nesmí nechat otevřenou: opravená data a dál sýr na obrazovce.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// POŘADÍ JE ZÁMĚRNÉ: .env.local má platný service key, .env starý.
// `delete-smoketest-users.mjs` má pořadí opačné a proto padá na 401.
for (const f of ['.env.local', '.env.production.local', '.env']) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/\r$/, '');
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const { enforceDietaryPublishGate, buildDietaryPublishRules, findDietaryViolations } =
  await import('../lib/dietaryPublishGate.js');

/**
 * Renderer se natáhne až tady, aby chybějící resolve hook spadl s jasnou
 * hláškou dřív, než se něco zapíše.
 */
let renderPlanHtmlFromStructured;
let stripPlanMediaAttrsFromHtml;
try {
  ({ renderPlanHtmlFromStructured } = await import('../lib/planRenderer.js'));
  ({ stripPlanMediaAttrsFromHtml } = await import('../lib/emailTemplates.js'));
} catch (e) {
  console.error('Renderer plánu se nenačetl:', e?.message || e);
  console.error('Spusť skript přes `npm run fix:lactose-free-plans` — potřebuje');
  console.error('`--import ./scripts/lib/extensionlessResolve-register.mjs`.');
  process.exit(2);
}

const APPLY = process.argv.includes('--apply');

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Uživatelé s dietou bez laktózy. */
const { data: bmRows, error: bmErr } = await db
  .from('body_metrics')
  .select('*')
  .eq('diet_type', 'lactose_free')
  .order('created_at', { ascending: false });
if (bmErr) throw new Error(`body_metrics: ${bmErr.message}`);

/** Nejnovější body_metrics na uživatele — brána čte i vyloučené potraviny. */
const bmByUser = new Map();
for (const row of bmRows || []) {
  if (!bmByUser.has(row.user_id)) bmByUser.set(row.user_id, row);
}

console.log(`lactose_free účtů: ${bmByUser.size}`);
console.log(APPLY ? 'REŽIM: --apply (zapisuje se)\n' : 'REŽIM: nasucho\n');

let opraveno = 0;
let bezZmeny = 0;
let neopravitelne = 0;

for (const [userId, bm] of bmByUser) {
  const { data: prof } = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
  const { data: plans, error: planErr } = await db
    .from('ai_generated_plans')
    .select('id, structured_plan_json, plan_html, user_context')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (planErr) throw new Error(`plans: ${planErr.message}`);

  for (const plan of plans || []) {
    const rules = buildDietaryPublishRules(bm);
    const pred = findDietaryViolations(plan.structured_plan_json, rules);
    if (!pred.length) {
      bezZmeny += 1;
      console.log(`OK    ${prof?.email} ${plan.id} — bez konfliktu`);
      continue;
    }

    const vysledek = enforceDietaryPublishGate(plan.structured_plan_json, bm);
    const po = findDietaryViolations(vysledek.planJson, rules);

    const hlavicka = `${prof?.email} ${plan.id} — před ${pred.length}, po ${po.length}, nahrazeno ${vysledek.replaced}`;
    if (po.length) {
      neopravitelne += 1;
      console.log(`FAIL  ${hlavicka}`);
      for (const v of po.slice(0, 5)) console.log(`        ${JSON.stringify(v)}`);
      continue;
    }

    console.log(`FIX   ${hlavicka}`);
    for (const v of pred.slice(0, 6)) {
      console.log(`        bylo: ${v.meal_name} (${v.code}, ${v.matched_term})`);
    }

    // `plan_html` SE MUSÍ PŘERENDEROVAT SPOLU S JSONEM.
    //
    // Změřeno 14. 8. 2026: všechny čtyři vadné plány měly sýr i v HTML, takže
    // opravit jen `structured_plan_json` by uživateli dál ukazovalo fetu.
    // Vynulovat HTML nejde — `pages/api/profile.js:274` plány bez něj z výpisu
    // vyhazuje. Nepoužívá se ani admin backfill endpoint: ten jede přes VŠECHNY
    // aktivní plány (39 k 14. 8.), což je na cílenou opravu čtyř řádků moc.
    const noveHtml = stripPlanMediaAttrsFromHtml(
      String(renderPlanHtmlFromStructured(vysledek.planJson, plan.user_context || null) || '').trim()
    );
    if (!noveHtml) {
      console.log('        RENDER PRÁZDNÝ — nezapisuje se, plán by přišel o HTML');
      neopravitelne += 1;
      continue;
    }
    console.log(`        plan_html ${plan.plan_html?.length ?? 0} → ${noveHtml.length}`);

    if (APPLY) {
      const { error: upErr } = await db
        .from('ai_generated_plans')
        .update({ structured_plan_json: vysledek.planJson, plan_html: noveHtml })
        .eq('id', plan.id);
      if (upErr) {
        console.log(`        ZÁPIS SELHAL: ${upErr.message}`);
        neopravitelne += 1;
        continue;
      }
      console.log('        zapsáno (structured_plan_json + plan_html)');
    }
    opraveno += 1;
  }
}

console.log(`\nBez konfliktu: ${bezZmeny}, opraveno: ${opraveno}, neopravitelné: ${neopravitelne}`);
if (!APPLY && opraveno) console.log('Spusť znovu s --apply.');
process.exit(neopravitelne === 0 ? 0 : 1);
