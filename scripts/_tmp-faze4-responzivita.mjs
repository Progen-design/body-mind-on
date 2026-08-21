#!/usr/bin/env node
// Kontrola profilu na sesti sirkach. Meri se v prohlizeci, ne odhaduje:
// vodorovny prescok, prekryvy, prilis male dotykove cile a tlacitka,
// ktera po chybejicim Preflightu zustala se svetlym pozadim prohlizece.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = join(ROOT, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] === undefined) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  break;
}

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = (process.env.E2E_EMAIL || 'janprikopa@gmail.com').trim().toLowerCase();
const OUT = join(ROOT, 'artifacts', 'faze4');
mkdirSync(OUT, { recursive: true });

const admin = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.generateLink({
  type: 'magiclink', email: EMAIL, options: { redirectTo: `${BASE}/profil` },
});
if (error) throw error;
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: otp, error: otpErr } = await anon.auth.verifyOtp({
  token_hash: data.properties.hashed_token, type: 'magiclink',
});
if (otpErr) throw otpErr;
const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').split('.')[0];
const storageKey = `sb-${ref}-auth-token`;

const SIRKY = [320, 390, 768, 1024, 1440, 1920];
const browser = await chromium.launch({ headless: true });
const vysledky = [];

for (const w of SIRKY) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w < 500 ? 844 : 1000 },
    deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500,
  });
  const page = await ctx.newPage();
  const chybyKonzole = [];
  page.on('console', (m) => { if (m.type() === 'error') chybyKonzole.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => chybyKonzole.push(`pageerror: ${String(e).slice(0, 160)}`));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)),
    { k: storageKey, s: otp.session });
  await page.goto(`${BASE}/profil`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.profile-bubble, .profile-topbar', { timeout: 90000 });
  await page.waitForTimeout(6000);

  // Rozbalit vsechny sekce, aby se meril i obsah, ktery je slozeny.
  const hlavicky = page.locator('.profile-bubble-header');
  const n = await hlavicky.count();
  for (let i = 0; i < n; i += 1) {
    try { await hlavicky.nth(i).click({ timeout: 2000 }); await page.waitForTimeout(120); } catch { /* zavrena zustane */ }
  }
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);

  const zjisteni = await page.evaluate((sirka) => {
    const out = { prescok: null, siroke: [], maleCile: [], svetlaTlacitka: [], lisla: null };

    const de = document.documentElement;
    if (de.scrollWidth > sirka + 1) out.prescok = { scrollWidth: de.scrollWidth, o: de.scrollWidth - sirka };

    // Prvky sirsi nez okno = kandidati na vodorovny prescok.
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const st = getComputedStyle(el);
      if (st.position === 'fixed') continue;
      if (r.right > sirka + 2 || r.left < -2) {
        const scrollovatelny = ['auto', 'scroll'].includes(st.overflowX)
          || (el.parentElement && ['auto', 'scroll'].includes(getComputedStyle(el.parentElement).overflowX));
        if (scrollovatelny) continue;
        out.siroke.push({
          sel: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`,
          left: Math.round(r.left), right: Math.round(r.right),
        });
      }
    }
    out.siroke = out.siroke.slice(0, 8);

    // Dotykove cile a pozadi tlacitek.
    const svetle = (barva) => {
      const m = barva.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/);
      if (!m) return false;
      const [r, g, b] = [+m[1], +m[2], +m[3]];
      const a = m[4] === undefined ? 1 : +m[4];
      if (a < 0.5) return false;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150;
    };
    for (const el of document.querySelectorAll('button, a[role="button"], [type="submit"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const st = getComputedStyle(el);
      const jmeno = `${(el.textContent || '').trim().slice(0, 28) || el.className}`;
      if (r.height < 40) out.maleCile.push({ jmeno, v: Math.round(r.height) });
      // Bila plocha s bilym textem = tlacitko, kteremu chybi vlastni pozadi.
      if (svetle(st.backgroundColor) && svetle(st.color)) {
        out.svetlaTlacitka.push({ jmeno, bg: st.backgroundColor, fg: st.color });
      }
    }
    out.maleCile = out.maleCile.slice(0, 10);
    out.svetlaTlacitka = out.svetlaTlacitka.slice(0, 10);

    const l = document.querySelector('.profile-topbar');
    if (l) {
      const st = getComputedStyle(l);
      out.lisla = { position: st.position, bg: st.backgroundColor, blur: st.backdropFilter };
    }
    return out;
  }, w);

  // Sticky se overuje pohybem, ne jen vypoctenym stylem.
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(600);
  const listaPoScrollu = await page.evaluate(() => {
    const l = document.querySelector('.profile-topbar');
    return l ? Math.round(l.getBoundingClientRect().top) : null;
  });
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.screenshot({ path: join(OUT, `profil-${w}.png`), fullPage: false });
  vysledky.push({ sirka: w, ...zjisteni, listaPoScrollu, chybyKonzole: chybyKonzole.slice(0, 5) });
  await ctx.close();
}

await browser.close();
writeFileSync(join(OUT, 'zjisteni.json'), JSON.stringify(vysledky, null, 2));

for (const v of vysledky) {
  console.log(`\n──────── ${v.sirka} px ────────`);
  console.log(`  prescok:      ${v.prescok ? `ANO +${v.prescok.o} px (scrollWidth ${v.prescok.scrollWidth})` : 'ne'}`);
  console.log(`  siroke prvky: ${v.siroke.length ? v.siroke.map((s) => `${s.sel} [${s.left}..${s.right}]`).join(' | ') : 'zadne'}`);
  console.log(`  cile < 40 px: ${v.maleCile.length ? v.maleCile.map((c) => `"${c.jmeno}" ${c.v}px`).join(' | ') : 'zadne'}`);
  console.log(`  svetla tl.:   ${v.svetlaTlacitka.length ? v.svetlaTlacitka.map((t) => `"${t.jmeno}" ${t.bg}`).join(' | ') : 'zadna'}`);
  console.log(`  lista:        ${v.lisla ? `${v.lisla.position}, bg ${v.lisla.bg}, blur ${v.lisla.blur}` : 'nenalezena'}; po scrollu top=${v.listaPoScrollu}`);
  console.log(`  konzole:      ${v.chybyKonzole.length ? v.chybyKonzole.join(' | ') : 'cista'}`);
}
