/**
 * Hlídá past `export { X } from '...'` + lokální použití `X` v témže souboru.
 *
 * PROČ TENHLE TEST EXISTUJE
 * lib/spoonacular/catalogTranslate.js mělo řádek
 *     export { extractInstructionStepsEn } from './instructionSteps.js';
 * a o 28 řádků níž tu funkci volalo. `export ... from` je RE-EXPORT: symbol
 * pošle dál, ale NEVYTVOŘÍ lokální vazbu. Volání proto padalo na
 * ReferenceError při každém běhu /api/cron/translate-recipes — 1307× mezi
 * 1. a 5. 8. 2026, tedy pět dní, a CI bylo celou dobu zelené.
 *
 * Runtime test by tuhle třídu chyby nechytil spolehlivě: dotčené moduly si
 * při importu sahají na env proměnné a soubory na disku. Statická kontrola
 * nad zdrojáky je nezávislá na prostředí a pokrývá celý repozitář, ne jen
 * ten jeden soubor, na kterém se to projevilo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');
const SLOZKY = ['lib', 'pages', 'components', 'scripts'];
const PRIPONY = ['.js', '.mjs', '.jsx'];

/** @returns {string[]} absolutní cesty ke zdrojovým souborům */
function najdiSoubory(dir) {
  /** @type {string[]} */
  const out = [];
  let polozky;
  try {
    polozky = readdirSync(dir);
  } catch {
    return out;
  }
  for (const p of polozky) {
    if (p === 'node_modules' || p === '.next' || p.startsWith('.')) continue;
    const cesta = join(dir, p);
    if (statSync(cesta).isDirectory()) {
      out.push(...najdiSoubory(cesta));
    } else if (PRIPONY.some((e) => p.endsWith(e))) {
      out.push(cesta);
    }
  }
  return out;
}

/**
 * Vyhodí řádkové i blokové komentáře, aby zmínka v komentáři nedělala
 * falešný poplach. Řetězce se neřeší — identifikátor v řetězci je natolik
 * nepravděpodobný, že za tu složitost nestojí.
 */
function bezKomentaru(zdroj) {
  return zdroj
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Jména vytažená ze složených závorek `{ a, b as c }`. */
function jmenaZeZavorky(obsah) {
  return obsah
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    // `A as B` — lokálně se sahá na A (u importu na B, ale to je jiný tvar).
    .map((s) => s.split(/\s+as\s+/)[0].trim())
    .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
}

test('zadny soubor nepouziva lokalne symbol, ktery jen re-exportuje', () => {
  const nalezy = [];

  for (const soubor of SLOZKY.flatMap((s) => najdiSoubory(join(KOREN, s)))) {
    const zdroj = bezKomentaru(readFileSync(soubor, 'utf8'));

    // `export { A, B as C } from '...'` — jen tvar S `from`, ten nevytváří vazbu.
    const reExporty = [...zdroj.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]\s*;?/g)];
    if (!reExporty.length) continue;

    // Jména, která soubor NAVÍC importuje — ta lokální vazbu mají a re-export
    // vedle nich je legitimní průchozí export. Bez téhle množiny by test hlásil
    // každý `import {X}` + `export {X} from` pár, což je běžný a správný vzor.
    const importovane = new Set(
      [...zdroj.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]\s*;?/g)]
        .flatMap((m) => jmenaZeZavorky(m[1]))
    );

    // Tělo bez VŠECH import/re-export příkazů — jméno v nich se za použití nepočítá.
    let telo = zdroj;
    for (const m of reExporty) telo = telo.replace(m[0], '');
    telo = telo.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/g, '');

    for (const shoda of reExporty) {
      for (const jmeno of jmenaZeZavorky(shoda[1])) {
        if (importovane.has(jmeno)) continue;
        if (new RegExp(`\\b${jmeno}\\b`).test(telo)) {
          nalezy.push(
            `${relative(KOREN, soubor)}: '${jmeno}' se jen re-exportuje `
            + `(export ... from), ale v těle souboru se používá. `
            + `Re-export nevytváří lokální vazbu — přidej import.`
          );
        }
      }
    }
  }

  assert.deepEqual(
    nalezy, [],
    `Nalezena past re-export bez importu:\n  ${nalezy.join('\n  ')}`
  );
});
