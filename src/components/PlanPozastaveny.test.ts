/**
 * ZAMČENÝ PLÁN PO TRIALU — render test + odvození stavu + napojení na obrazovky.
 *
 * node --experimental-strip-types JSX neumí, takže se karta přeloží Vite
 * (SSR build do paměti, react a lucide-react zůstanou externí) a vyrenderuje
 * přes react-dom/server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';

import { jePlanPozastaveny, odvodStavPredplatneho } from '../lib/stavPredplatneho.ts';
import { naProfil } from '../data/adaptery.ts';

const TADY = dirname(fileURLToPath(import.meta.url));
const KOREN = join(TADY, '..', '..');
const cti = (p: string) => readFileSync(join(TADY, p), 'utf8');

async function nactiKartu() {
  const vystup: any = await build({
    configFile: false,
    logLevel: 'silent',
    root: KOREN,
    esbuild: { jsx: 'automatic' },
    build: {
      ssr: join(TADY, 'PlanPozastavenyKarta.tsx'),
      write: false,
      rollupOptions: { external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, 'lucide-react'], output: { format: 'es' } },
    },
  });
  const kod = (Array.isArray(vystup) ? vystup[0] : vystup).output[0].code as string;
  // Do node_modules/.cache, ať se externí `react` a `lucide-react` najdou.
  const slozka = join(KOREN, 'node_modules', '.cache', 'render-test');
  mkdirSync(slozka, { recursive: true });
  const soubor = join(slozka, `PlanPozastavenyKarta-${process.pid}.mjs`);
  writeFileSync(soubor, kod);
  return import(pathToFileURL(soubor).href);
}

test('render: nadpis, věta „nic se nesmazalo" a JEDNO tlačítko „Odemknout START za 599 Kč"', async () => {
  const { PlanPozastavenyKarta } = await nactiKartu();
  const html = renderToStaticMarkup(createElement(PlanPozastavenyKarta, { onOdemknout: () => {} }));
  assert.match(html, /Zkušební období skončilo — plán je pozastavený/);
  assert.match(html, /Nic se nesmazalo/);
  const tlacitka = html.match(/<button\b/g) || [];
  assert.equal(tlacitka.length, 1, 'jen jedno tlačítko');
  assert.match(html, /<button[^>]*>Odemknout START za 599 Kč<\/button>/);
  assert.doesNotMatch(html, /role="alert"/, 'bez chyby žádná hláška');
});

test('render: během zakládání Checkoutu je tlačítko zablokované, chyba serveru se ukáže', async () => {
  const { PlanPozastavenyKarta } = await nactiKartu();
  const html = renderToStaticMarkup(createElement(PlanPozastavenyKarta, {
    onOdemknout: () => {}, odemykam: true, chyba: 'Předplatné už máš aktivní.',
  }));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Otevírám platbu…<\/button>/);
  assert.match(html, /role="alert"[^>]*>Předplatné už máš aktivní\.<\/p>/);
});

// ---------------------------------------------------------------- stav

test('pozastaveno: trial bez karty po konci (verdikt serveru) a vypršelé členství', () => {
  assert.equal(jePlanPozastaveny('trial_bez_karty', true), true);
  assert.equal(jePlanPozastaveny('trial_bez_karty', false), false, 'trial ještě běží');
  assert.equal(jePlanPozastaveny('trial_s_kartou', true), false, 'Stripe strhne platbu, nic se nepozastavuje');
  assert.equal(jePlanPozastaveny('active', true), false);
  assert.equal(jePlanPozastaveny('expired', false), true);
  assert.equal(jePlanPozastaveny(odvodStavPredplatneho('trial', false), true), true);
});

test('adaptér: plan_renewal.trial_ended + bez předplatného → profile.planPozastaveny', () => {
  const zaklad = { program: 'START', membershipStatus: 'trial', user: { name: 'Jan', email: 'jan@seznam.cz' }, body_metrics: [] };
  assert.equal(naProfil({ ...zaklad, ma_predplatne: false, plan_renewal: { allowed: false, reason: 'trial_ended', trial_ended: true } } as never).planPozastaveny, true);
  assert.equal(naProfil({ ...zaklad, ma_predplatne: true, plan_renewal: { allowed: true, reason: 'x', trial_ended: true } } as never).planPozastaveny, false);
  assert.equal(naProfil({ ...zaklad, ma_predplatne: false } as never).planPozastaveny, false, 'bez verdiktu serveru nic nezamykat');
});

// ---------------------------------------------------------------- napojení

test('Dnes: při pozastaveném plánu jen karta + dlaždice Účet, žádný hero ani prázdná osa dne', () => {
  const dnes = cti('DnesObrazovka.tsx').replace(/\r\n/g, '\n');
  const zacatek = dnes.indexOf('if (profile.planPozastaveny) {');
  assert.ok(zacatek > 0, 'větev pro pozastavený plán chybí');
  const vetev = dnes.slice(zacatek, dnes.indexOf('\n  }\n', zacatek));
  assert.match(vetev, /<DnesPozastavena/);
  assert.match(vetev, /dlazdice\.filter\(\(d\) => d\.id === 'ucet'\)/);
  const komponenta = dnes.slice(dnes.indexOf('const DnesPozastavena'));
  assert.ok(komponenta.length > 50, 'komponenta DnesPozastavena chybí');
  assert.match(komponenta, /<PlanPozastaveny \/>/);
  assert.match(komponenta, /<NastrojeDlazdice dlazdice=\{dlazdiceUcet\}/);
  assert.doesNotMatch(vetev + komponenta, /DnesHero|CasovaOsaDne|RadekTeda|TvojeCesta|TrialCountdownStrip/);
});

test('Jídelníček a Trénink: pozastavený plán místo prázdných sekcí', () => {
  const app = readFileSync(join(TADY, '..', 'App.tsx'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(app, /displayedProfile\.planPozastaveny && \(activeTab === 'jidelnicek' \|\| activeTab === 'trenink'\) && \(\s*<PlanPozastaveny \/>/);
  assert.match(app, /activeTab === 'jidelnicek' && !displayedProfile\.planPozastaveny/);
  assert.match(app, /activeTab === 'trenink' && !displayedProfile\.planPozastaveny/);
});

test('odkaz z e-mailu ?predplatne=1 otevře Účet a předplatné a parametr zmizí z URL', () => {
  const app = readFileSync(join(TADY, '..', 'App.tsx'), 'utf8');
  assert.match(app, /parametry\.get\('predplatne'\) !== '1'/);
  assert.match(app, /url\.searchParams\.delete\('predplatne'\)/);
  assert.match(app, /otevritPredplatne=\{predplatneZOdkazu\}/);
  assert.match(cti('DnesObrazovka.tsx'), /if \(!otevritPredplatne\) return;\s+scrollNaPanel\.current = true;\s+setOtevreny\('ucet'\);/);
});

test('Účet a předplatné: „Odstoupit od smlouvy" vedle „Zrušit předplatné", jen s nárokem ze serveru', () => {
  const ucet = cti('UcetASpravaSection.tsx');
  assert.ok(ucet.indexOf('<OdstoupeniOdSmlouvy') > ucet.indexOf('Zrušit předplatné'));
  assert.ok(ucet.indexOf('<OdstoupeniOdSmlouvy') < ucet.indexOf('SMAZÁNÍ ÚČTU'));
  const o = cti('OdstoupeniOdSmlouvy.tsx');
  assert.match(o, /if \(!nahled\?\.narok\) return null;/);
  assert.match(o, /Odstoupit od smlouvy/);
  assert.match(o, /Potvrdit odstoupení od smlouvy/);
  assert.match(o, /nahled\.tarif/);
  assert.match(o, /nahled\.datum_prvni_platby/);
  assert.match(o, /method: 'POST'/);
});
