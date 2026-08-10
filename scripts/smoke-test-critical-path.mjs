#!/usr/bin/env node
/**
 * Smoke test kritické cesty: POST /api/body-metrics
 * Očekává 200 (plán ready/pending/sent) nebo 503 s hasUserId: true
 *
 * Spuštění:
 *   npm run smoke-test
 *   npm run smoke-test:prod
 *   npm run smoke-test:matrix
 *   BASE_URL=https://app.bodyandmindon.cz npm run smoke-test
 *
 * Lokální API musí běžet (npm run dev), jinak test ihned skončí s nápovědou — nečeká 90 s.
 *
 * Proti produkci výchozí příjemce (+ alias):
 *   info+bm-smoke-<čas>@bodyandmindon.cz
 *   info+bm-smoke-<dieta>-<čas>@bodyandmindon.cz   (maticový režim)
 * Volitelně: SMOKE_TEST_RECIPIENT=jiny@email.cz
 *
 * MATICOVÝ REŽIM (--matrix)
 * Jeden profil bez diety pokrýval jen část registrace: `diet_type` se validuje
 * na serveru (lib/dietOptions.js) a každá dieta jde jinou cestou filtrování —
 * vegetarian/gluten_free přes `diet_tags` katalogu, lactose_free přes vyloučení
 * mléčných surovin, low_carb přes makra. Dieta, která se nikdy neposlala,
 * se nikdy netestovala.
 *
 * Jede SÉRIOVĚ. Každý profil zakládá reálný účet a posílá e-mail, a
 * /api/body-metrics má rate limit 8 registrací / 15 min na IP — pět profilů
 * se tam vejde, ale paralelně by to bylo pět účtů naráz a bez rozestupu.
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';
import { isDietTypeSupported, dietTypeRejectionReason } from '../lib/dietOptions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_SMOKE_LOCAL = 'info';
const MATRIX = process.argv.includes('--matrix');
/** Rozestup mezi profily. Ne kvůli rate limitu (8/15 min), ale ať se běhy nepřekrývají v logu. */
const MATRIX_DELAY_MS = Number(process.env.SMOKE_MATRIX_DELAY_MS || 5000);

/**
 * Profily matice.
 *
 * `vegan` a `paleo` sem NEPATŘÍ — v lib/dietOptions.js jsou `enabled: false`,
 * server je odmítne 400 a test by hlásil chybu tam, kde se chová správně.
 * Hlídá to `overDietyProtiZdrojiPravdy()` níž, aby se seznam nerozešel s
 * dietOptions.js potichu.
 */
const PROFILY = [
  { klic: 'bez-diety', dietType: null, popis: 'bez diety (dnešní payload)' },
  { klic: 'vegetarian', dietType: 'vegetarian', popis: 'vegetarián' },
  { klic: 'gluten-free', dietType: 'gluten_free', popis: 'bez lepku' },
  { klic: 'lactose-free', dietType: 'lactose_free', popis: 'bez laktózy (přes vyloučení surovin)' },
  { klic: 'low-carb', dietType: 'low_carb', popis: 'nízkosacharidová' },
];

/** Načte .env.local / .env — potřeba jen pro dopočet metrik plánu ze Supabase. */
function nactiEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
    return;
  }
}

/**
 * Pojistka proti tomu, aby matice posílala hodnoty, které server odmítne.
 * Autorita je lib/dietOptions.js, ne tenhle seznam — kdyby se některá dieta
 * vypnula (jako vegan a paleo), test to musí říct PŘED registrací, ne až
 * pátým 400 z produkce.
 */
function overDietyProtiZdrojiPravdy() {
  const chyby = [];
  for (const p of PROFILY) {
    if (p.dietType === null) continue;
    if (!isDietTypeSupported(p.dietType)) {
      chyby.push(`${p.dietType}: ${dietTypeRejectionReason(p.dietType)}`);
    }
  }
  if (chyby.length) {
    console.error('Matice obsahuje diety, které lib/dietOptions.js nepovoluje:');
    for (const c of chyby) console.error(`  - ${c}`);
    console.error('Uprav PROFILY, nebo dietu zapni v lib/dietOptions.js.');
    process.exit(1);
  }
}

function resolveBaseUrl() {
  if (process.env.BASE_URL && String(process.env.BASE_URL).trim()) {
    return String(process.env.BASE_URL).trim().replace(/\/$/, '');
  }
  if (process.argv.includes('--prod')) {
    return 'https://app.bodyandmindon.cz';
  }
  return 'http://localhost:3000';
}

const BASE_URL = resolveBaseUrl();

/**
 * @param {string} baseUrl
 * @param {string|null} slug — klíč profilu, aby se účty matice nekolidovaly
 */
function buildSmokeRecipientEmail(baseUrl, slug = null) {
  const raw = process.env.SMOKE_TEST_RECIPIENT?.trim();
  const prodLike = /bodyandmindon\.cz/i.test(baseUrl) || /\.vercel\.app/i.test(baseUrl);
  const znacka = slug ? `bm-smoke-${slug}` : 'bm-smoke';

  if (raw) {
    const at = raw.lastIndexOf('@');
    if (at <= 0) {
      console.error('SMOKE_TEST_RECIPIENT musí být platný e-mail (např. info@bodyandmindon.cz).');
      process.exit(1);
    }
    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1).toLowerCase();
    if (!local || !domain || !/^[^\s@]+\.[^\s@]+$/.test(domain)) {
      console.error('SMOKE_TEST_RECIPIENT musí být platný e-mail s doménou.');
      process.exit(1);
    }
    return `${local}+${znacka}-${Date.now()}@${domain}`;
  }

  if (prodLike) {
    return `${DEFAULT_SMOKE_LOCAL}+${znacka}-${Date.now()}@bodyandmindon.cz`;
  }

  return `${znacka}-${Date.now()}@example.com`;
}

async function assertApiReachable(baseUrl) {
  const healthUrl = `${baseUrl.replace(/\/$/, '')}/api/integrations-status`;
  try {
    const res = await fetchWithTimeout(healthUrl, { method: 'GET' }, FETCH_TIMEOUT.HEALTH);
    if (!res.ok) {
      console.error(`Health check: ${healthUrl} vrátil HTTP ${res.status}.`);
      return false;
    }
    return true;
  } catch (e) {
    const isLocal =
      /^https?:\/\/localhost\b/i.test(baseUrl) ||
      /^https?:\/\/127\.0\.0\.1\b/i.test(baseUrl);
    if (isLocal) {
      console.error('');
      console.error('Lokální server neběží. Spusť npm run dev, nebo použij');
      console.error('  BASE_URL=https://app.bodyandmindon.cz npm run smoke-test');
      console.error('nebo');
      console.error('  npm run smoke-test:prod');
      console.error('');
    }
    console.error(formatFetchError(e, healthUrl));
    return false;
  }
}

function nactiPayload() {
  const payloadPath = join(__dirname, 'smoke-test-payload.json');
  try {
    return JSON.parse(readFileSync(payloadPath, 'utf8'));
  } catch (e) {
    console.error('Chyba: nelze načíst', payloadPath, e.message);
    process.exit(1);
  }
}

/**
 * Klient je VOLITELNÝ. Bez service key se jen nedopočítají jídla — smoke test
 * je o tom, jestli registrace projde, ne o tom, jestli má člověk .env.local.
 * @returns {Promise<object|null>}
 */
let supabaseKlient;
async function ziskejSupabase() {
  if (supabaseKlient !== undefined) return supabaseKlient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    supabaseKlient = null;
    return null;
  }
  try {
    const { createClient } = await import('@supabase/supabase-js');
    supabaseKlient = createClient(url, key);
  } catch (e) {
    console.warn('  (metriky plánu přeskočeny — @supabase/supabase-js:', e?.message, ')');
    supabaseKlient = null;
  }
  return supabaseKlient;
}

/**
 * Počet jídel v plánu a kolik z nich je ověřených.
 *
 * `recipe_verified` je na jídle, ne na dni — počítá se přes všechny dny.
 * Když plán ještě nedoběhl (plan_state: processing), řádek nemusí existovat;
 * to není chyba testu, vrátí se `null` a v tabulce bude `—`.
 *
 * @param {string} email
 * @returns {Promise<{planId:string|null, jidel:number, verified:number}|null>}
 */
async function metrikyPlanu(email) {
  const supabase = await ziskejSupabase();
  if (!supabase) return null;

  for (let pokus = 0; pokus < 3; pokus++) {
    const { data, error } = await supabase
      .from('ai_generated_plans')
      .select('id, structured_plan_json')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('  (metriky plánu selhaly:', error.message, ')');
      return null;
    }
    if (data?.structured_plan_json) {
      const dny = data.structured_plan_json.days ?? [];
      let jidel = 0;
      let verified = 0;
      for (const den of dny) {
        for (const m of den?.meals ?? []) {
          jidel += 1;
          if (m?.recipe_verified === true) verified += 1;
        }
      }
      return { planId: data.id, jidel, verified };
    }
    if (pokus < 2) await new Promise((r) => setTimeout(r, 4000));
  }
  return null;
}

/**
 * Jeden profil: registrace + vyhodnocení.
 * @returns {Promise<{klic:string, ok:boolean, status:number|null, elapsed:string,
 *                    planId:string|null, jidel:number|null, verified:number|null,
 *                    email:string, poznamka:string}>}
 */
async function spustProfil(profil, payloadZaklad) {
  const email = buildSmokeRecipientEmail(BASE_URL, MATRIX ? profil.klic : null);
  const payload = { ...payloadZaklad, email };
  if (profil.dietType) payload.diet_type = profil.dietType;

  const vysledek = {
    klic: profil.klic,
    dietType: profil.dietType,
    ok: false,
    status: null,
    elapsed: '0.0',
    planId: null,
    jidel: null,
    verified: null,
    email,
    poznamka: '',
  };

  const url = `${BASE_URL.replace(/\/$/, '')}/api/body-metrics`;
  if (MATRIX) {
    console.log(`\n--- ${profil.klic} (${profil.popis}) ---`);
    console.log('diet_type:', profil.dietType ?? '(nenastaveno)');
  }
  console.log('Smoke recipient:', email);
  console.log('POST', url);
  console.log('timeout:', `${FETCH_TIMEOUT.BODY_METRICS} ms`);

  const start = Date.now();
  let res;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      FETCH_TIMEOUT.BODY_METRICS
    );
  } catch (e) {
    vysledek.elapsed = ((Date.now() - start) / 1000).toFixed(1);
    vysledek.poznamka = formatFetchError(e, url);
    console.error(`FAIL (${vysledek.elapsed}s):`, vysledek.poznamka);
    return vysledek;
  }

  vysledek.elapsed = ((Date.now() - start) / 1000).toFixed(1);
  vysledek.status = res.status;

  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  vysledek.planId = body?._diagnostics?.saved_plan_id ?? null;

  if (res.ok) {
    const planOk =
      body.planSent ||
      body.planPending ||
      body.plan_state === 'ready' ||
      body.plan_state === 'processing';
    vysledek.ok = true;
    vysledek.poznamka = planOk
      ? 'plán ready/pending/sent'
      : `účet vytvořen, plán: ${body.plan_state || 'pending'}`;
  } else if (res.status === 503 && body.hasUserId === true) {
    vysledek.ok = true;
    vysledek.poznamka = '503 s hasUserId – účet vytvořen, retry CTA';
  } else if (res.status === 429) {
    // Snadno se splete s chybou aplikace. Limit je 8 registrací / 15 min na IP.
    vysledek.poznamka = 'rate limit (8 registrací / 15 min na IP) — počkej a pusť znovu';
  } else {
    vysledek.poznamka = String(body.error || body.message || JSON.stringify(body).slice(0, 200));
  }

  const metriky = await metrikyPlanu(email);
  if (metriky) {
    vysledek.planId = vysledek.planId ?? metriky.planId;
    vysledek.jidel = metriky.jidel;
    vysledek.verified = metriky.verified;
  }

  const stav = vysledek.ok ? 'PASS' : 'FAIL';
  const jidlaTxt = metriky ? `, jídel ${metriky.jidel} (verified ${metriky.verified})` : '';
  const planTxt = vysledek.planId ? `, plan_id ${vysledek.planId}` : '';
  const log = vysledek.ok ? console.log : console.error;
  log(`${stav} (${vysledek.elapsed}s): HTTP ${vysledek.status} — ${vysledek.poznamka}${planTxt}${jidlaTxt}`);

  return vysledek;
}

function vypisTabulku(vysledky) {
  const sloupce = [
    ['profil', (v) => v.klic],
    ['diet_type', (v) => v.dietType ?? '—'],
    ['stav', (v) => (v.ok ? 'PASS' : 'FAIL')],
    ['HTTP', (v) => (v.status == null ? '—' : String(v.status))],
    ['čas', (v) => `${v.elapsed}s`],
    ['plan_id', (v) => (v.planId ? String(v.planId).slice(0, 8) : '—')],
    ['jídel', (v) => (v.jidel == null ? '—' : String(v.jidel))],
    ['verified', (v) => (v.verified == null ? '—' : String(v.verified))],
  ];

  const radky = [sloupce.map(([h]) => h), ...vysledky.map((v) => sloupce.map(([, f]) => f(v)))];
  const sirky = sloupce.map((_, i) => Math.max(...radky.map((r) => r[i].length)));
  const formatuj = (r) => r.map((b, i) => b.padEnd(sirky[i])).join('  ');

  console.log('\n=== SOUHRN ===');
  console.log(formatuj(radky[0]));
  console.log(sirky.map((s) => '-'.repeat(s)).join('  '));
  for (const r of radky.slice(1)) console.log(formatuj(r));

  const spadle = vysledky.filter((v) => !v.ok);
  if (spadle.length) {
    console.log('');
    for (const v of spadle) console.error(`FAIL ${v.klic}: ${v.poznamka}`);
  }
  console.log(`\n${vysledky.length - spadle.length}/${vysledky.length} profilů PASS`);
}

async function main() {
  nactiEnv();

  console.log('BASE_URL:', BASE_URL);
  if (MATRIX) {
    overDietyProtiZdrojiPravdy();
    console.log(`Maticový režim: ${PROFILY.length} profilů sériově, rozestup ${MATRIX_DELAY_MS} ms.`);
    console.log('Každý profil zakládá reálný účet a posílá e-mail.');
    if (!(await ziskejSupabase())) {
      console.log('Bez SUPABASE_SERVICE_ROLE_KEY — počty jídel/verified budou "—".');
    }
  }

  if (!(await assertApiReachable(BASE_URL))) process.exit(1);

  const payloadZaklad = nactiPayload();
  const profily = MATRIX ? PROFILY : [PROFILY[0]];
  const vysledky = [];

  for (let i = 0; i < profily.length; i++) {
    vysledky.push(await spustProfil(profily[i], payloadZaklad));
    // Sériově a s rozestupem. Paralelně by to bylo pět registrací naráz.
    if (i < profily.length - 1 && MATRIX_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, MATRIX_DELAY_MS));
    }
  }

  if (MATRIX) vypisTabulku(vysledky);

  process.exit(vysledky.every((v) => v.ok) ? 0 : 1);
}

await main();
