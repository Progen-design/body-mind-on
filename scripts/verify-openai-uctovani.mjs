#!/usr/bin/env node
/**
 * BRÁNA: jediná cesta k modelu OpenAI je `volejModel()` z lib/openai.js.
 *
 * PROMPT_NAKLADY_AI.md (2026-09-18) bod C — dokud šlo model zavolat bez
 * zaúčtování, vždycky někde zůstala díra (74 % útraty bylo neviditelných).
 * Tenhle skript hlídá, aby se nikde v `api/` nebo `lib/` (mimo `lib/openai.js`
 * samotné) neobjevilo:
 *   - `new OpenAI(` — vlastní klient obchází účtování
 *   - `import OpenAI from 'openai'` / `from 'openai'` — přístup k SDK bokem
 *   - `openai.chat.completions.create(` — přímé volání na klientovi
 *   - `api.openai.com` — ruční fetch/URL na endpoint
 *
 * Bez týhle brány by se za měsíc objevil 27. volající a jsme zpátky u toho,
 * proč tenhle úkol vůbec vznikl.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

/** Jediný soubor, který smí OpenAI SDK dotýkat přímo. */
const POVOLENA_VYJIMKA = join('lib', 'openai.js').replace(/\\/g, '/');

const ZAKAZANE_VZORY = [
  { re: /\bnew OpenAI\s*\(/, popis: 'new OpenAI( — vlastní klient obchází účtování' },
  { re: /(^|[^.\w])import\s+OpenAI\s+from\s+['"]openai['"]/, popis: "import OpenAI from 'openai' — přístup k SDK bokem" },
  { re: /require\(\s*['"]openai['"]\s*\)/, popis: "require('openai') — přístup k SDK bokem" },
  { re: /\bopenai\.chat\.completions\.create\s*\(/, popis: 'openai.chat.completions.create( — přímé volání na klientovi, ne přes volejModel()' },
  { re: /\bopenai\.responses\.create\s*\(/, popis: 'openai.responses.create( — přímé volání na klientovi, ne přes volejModel()' },
  { re: /api\.openai\.com/, popis: 'api.openai.com — ruční fetch/URL na endpoint, ne přes volejModel()' },
];

const PRIPONY = new Set(['.js', '.mjs', '.ts']);
const VYNECHAT_SLOZKY = new Set(['node_modules', '__tests__', '__snapshots__']);

/** @returns {string[]} absolutní cesty ke skenovaným souborům */
function najdiSoubory(startDir) {
  /** @type {string[]} */
  const out = [];
  (function projdi(dir) {
    let polozky;
    try {
      polozky = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const p of polozky) {
      if (VYNECHAT_SLOZKY.has(p.name)) continue;
      const cesta = join(dir, p.name);
      if (p.isDirectory()) {
        projdi(cesta);
      } else if (PRIPONY.has(p.name.slice(p.name.lastIndexOf('.')))) {
        // Testovací soubory nejsou skutečný volající — jméno *.test.mjs by
        // jinak zabránilo napsat test, který o zakázaných vzorech mluví.
        if (/\.test\.(m?js|ts)$/.test(p.name)) continue;
        out.push(cesta);
      }
    }
  })(startDir);
  return out;
}

let nalezy = 0;
const zpravy = [];

for (const slozka of ['api', 'lib']) {
  const startDir = join(ROOT, slozka);
  for (const soubor of najdiSoubory(startDir)) {
    const relCesta = relative(ROOT, soubor).replace(/\\/g, '/');
    if (relCesta === POVOLENA_VYJIMKA) continue;

    const obsah = readFileSync(soubor, 'utf8');
    for (const { re, popis } of ZAKAZANE_VZORY) {
      if (re.test(obsah)) {
        nalezy += 1;
        zpravy.push(`FAIL ${relCesta} — ${popis}`);
      }
    }
  }
}

if (nalezy > 0) {
  console.error(zpravy.join('\n'));
  console.error(
    `\n${nalezy} nález(ů). Model se volá výhradně přes volejModel() z lib/openai.js — ` +
    'jinak se ztrácí účtování (ai_runs) a rozpočtová pojistka. Viz PROMPT_NAKLADY_AI.md.'
  );
  process.exit(1);
}

console.log(`OK žádný soubor v api/ ani lib/ (mimo ${POVOLENA_VYJIMKA}) neobchází volejModel()`);
process.exit(0);
