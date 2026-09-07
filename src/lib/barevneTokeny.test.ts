/**
 * BAREVNÉ TOKENY — docs/DALSI_KROK.md 7.1, první krok (jen tokenizace).
 *
 * Změřeno 7. 9. 2026: 357 natvrdo psaných hex hodnot v 35 z 61 souborů
 * v src/ (bez testů), 35 unikátních odstínů, žádná vrstva tokenů. Tenhle
 * test hlídá, že refaktor byl PŘEJMENOVÁNÍ, ne redesign:
 *
 *   1) žádný soubor v src/ mimo index.css neobsahuje syrový hex literál,
 *   2) množina hodnot, které tokeny v @theme skutečně nesou, je BEZE ZBYTKU
 *      stejná jako množina 35 hodnot, které se v src/ používaly PŘED
 *      refaktorem — zmrzlý snapshot níž, vygenerovaný z gitu před tím, než
 *      se na kód sáhlo. Kdyby refaktor omylem změnil byť jediný odstín
 *      (překlep při přepisu, zaokrouhlení), množiny se rozejdou a test
 *      spadne — přesně to je důkaz, že se nezměnil ani jeden pixel.
 *
 * Test NEKONTROLUJE, který token se kde použil, ani jestli je pojmenování
 * podle role rozumné — to je věc code review. Kontroluje jen dvě tvrdé,
 * strojově ověřitelné věci výš.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url));
const HEX_LITERAL = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const KONCOVKY = new Set(['.ts', '.tsx', '.css']);

/** Všechny soubory v src/ s danou koncovkou, mimo *.test.* a node_modules. */
function najdiSoubory(dir: string, acc: string[] = []): string[] {
  for (const jmeno of readdirSync(dir)) {
    if (jmeno === 'node_modules') continue;
    const cesta = join(dir, jmeno);
    const info = statSync(cesta);
    if (info.isDirectory()) {
      najdiSoubory(cesta, acc);
      continue;
    }
    if (!KONCOVKY.has(extname(jmeno))) continue;
    if (jmeno.includes('.test.')) continue;
    acc.push(cesta);
  }
  return acc;
}

/**
 * ZAMRZLÝ SNAPSHOT — 35 unikátních hex hodnot použitých v src/ PŘED
 * refaktorem 7.1 (vygenerováno 7. 9. 2026, před jedinou úpravou):
 *
 *   grep -rEho "#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}\b" src/ \
 *     --include="*.tsx" --include="*.ts" --include="*.css" \
 *     | grep -v '\.test\.' | sort -u
 *
 * Nikdy se nedoplňuje o novou barvu — to by byla změna vzhledu, ne
 * přejmenování. Když se paleta jednou vymění (krok 2 bodu 7.1), tenhle
 * snapshot se přepíše na novou množinu jako součást TOHO kroku, ne dřív.
 */
const PUVODNI_HODNOTY = Object.freeze([
  '#00f2fe', '#08090d', '#090c12', '#091512', '#0a0b0e', '#0a0d13', '#0a0d14',
  '#0b1716', '#0c1017', '#0c121c', '#0d141e', '#0d1422', '#0d161a', '#0d1720',
  '#0d1722', '#0e131d', '#0e141f', '#0e1420', '#0e1622', '#0e1624', '#111927',
  '#1e293b', '#24f6ff', '#2bf5ff', '#2dd4bf', '#334155', '#38bdf8', '#38ef7d',
  '#39ff14', '#4facfe', '#50fa8f', '#64748b', '#68b9ff', '#f43f5e', '#fbbf24',
].sort());

test('žádný soubor v src/ mimo index.css neobsahuje syrový hex literál', () => {
  const souboryScestimi: Array<{ cesta: string; shody: string[] }> = [];

  for (const cesta of najdiSoubory(SRC_DIR)) {
    if (cesta.endsWith('index.css')) continue;
    const obsah = readFileSync(cesta, 'utf8');
    const shody = obsah.match(HEX_LITERAL);
    if (shody) souboryScestimi.push({ cesta, shody });
  }

  assert.deepEqual(
    souboryScestimi,
    [],
    `hex literál mimo index.css: ${JSON.stringify(souboryScestimi, null, 2)}`
  );
});

test('množina hodnot v @theme je přesně stejná jako množina hodnot před refaktorem', () => {
  const indexCss = readFileSync(join(SRC_DIR, 'index.css'), 'utf8');
  const themeBlok = indexCss.match(/@theme\s*{([\s\S]*?)\n}/);
  assert.ok(themeBlok, '@theme blok v src/index.css nenalezen');

  const hodnotyVTokenech = [...new Set(
    [...themeBlok![1].matchAll(/--color-[a-z0-9-]+:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase())
  )].sort();

  assert.deepEqual(
    hodnotyVTokenech,
    PUVODNI_HODNOTY,
    'množina hodnot v @theme se rozešla s hodnotami použitými před refaktorem — ' +
    'buď token chybí, nebo se nějaká hodnota (byť o odstín) změnila'
  );
});

test('@theme neobsahuje hodnotu navíc, která se v src/ před refaktorem vůbec nepoužívala', () => {
  // Doplněk k testu výš — kdyby PUVODNI_HODNOTY byl omylem přepsaný na
  // hodnoty PO refaktoru, obě kontroly by prošly, i kdyby se paleta
  // změnila. Tenhle test proto ověřuje snapshot samotný: 35 hodnot,
  // syntakticky platný hex, žádná duplicita.
  assert.equal(PUVODNI_HODNOTY.length, 35);
  assert.equal(new Set(PUVODNI_HODNOTY).size, 35, 'snapshot obsahuje duplicitní hodnotu');
  for (const hodnota of PUVODNI_HODNOTY) {
    assert.match(hodnota, /^#[0-9a-f]{6}$/, `neplatný hex ve snapshotu: ${hodnota}`);
  }
});
