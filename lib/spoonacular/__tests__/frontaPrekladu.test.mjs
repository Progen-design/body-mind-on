/**
 * FRONTA PŘEKLADU SE ŘÍDÍ EVIDENCÍ, NE ODHADEM Z VÝSLEDKU.
 *
 * Chyba, kterou to opravuje: `nactiKandidatyPrekladu` brala jako důkaz
 * neodvedené práce to, že se `name` suroviny rovná `name_en`. Jenže spousta
 * českých názvů je s angličtinou shodná — změřeno na produkci 23. 8. 2026:
 * quinoa 15×, paprika 9×, mango 7×, oregano 6×, k tomu tofu, feta, ricotta,
 * mozzarella. Model je přeložil správně (nechal je), heuristika je přečetla
 * jako nedodělek a recept vrátila do fronty. Šest běhů cronu po sobě zapsalo
 * 19 receptů a `remaining` zůstalo na 68 — každý běh platil OpenAI za práci,
 * která už byla hotová.
 *
 * Test čte zdroj, protože chování závisí na tvaru dotazu do databáze, ne na
 * čisté funkci, kterou by šlo zavolat bez Supabase.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ZDROJ = readFileSync(new URL('../catalogTranslate.js', import.meta.url), 'utf8');

/** Komentáře popisují historii — kontroluje se kód. */
const KOD = ZDROJ
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((r) => !r.trim().startsWith('//'))
  .join('\n');

test('fronta se ptá na translated_at, ne na porovnání name s name_en', () => {
  assert.ok(
    KOD.includes(".is('translated_at', null)"),
    'fronta musí vybírat podle evidence překladu'
  );
  assert.ok(
    !KOD.includes('zbyvaPrelozit'),
    'heuristika nad výsledkem se do fronty nesmí vrátit — quinoa není nedodělek'
  );
});

test('zapsaný recept dostane translated_at, jinak z fronty nikdy neodejde', () => {
  assert.ok(KOD.includes('translated_at: new Date().toISOString()'),
    'úspěšný zápis musí recept z fronty odhlásit');
  assert.ok(KOD.includes('translation_prompt_sha: TRANSLATE_PROMPT_SHA256'),
    'k překladu patří otisk promptu, kterým vznikl');
});

test('pokus se počítá před voláním modelu, aby se započítal i timeout', () => {
  const predVolanim = KOD.indexOf('zapocitejPokus(pending)');
  const volani = KOD.indexOf('translateBatchWithOpenAI(pending)');
  assert.ok(predVolanim > 0, 'počítadlo pokusů chybí');
  assert.ok(volani > 0, 'volání modelu chybí');
  assert.ok(
    predVolanim < volani,
    'kdyby se počítalo až po úspěchu, recept, který dávku pokaždé přetáhne, ji blokuje navždy'
  );
});

test('marný pokus nestojí peníze donekonečna', () => {
  assert.ok(/MAX_POKUSU\s*=\s*[1-9]\d?/.test(KOD), 'strop pokusů musí být konečný');
  assert.ok(
    KOD.includes(".lt('translation_attempts', MAX_POKUSU)"),
    'fronta musí recepty po vyčerpání pokusů přeskočit'
  );
});

test('důvod neúspěchu se zapisuje k receptu, ne jen do logu', () => {
  assert.ok(KOD.includes('translation_last_error'),
    'bez zapsaného důvodu recept po pěti pokusech zmizí tiše');
});

test('UPDATE se neváže na name_cs is null', () => {
  assert.ok(
    !KOD.includes(".is('name_cs', null)"),
    'tahle podmínka dva dny způsobovala, že zápis netrefil žádný řádek'
  );
  assert.ok(KOD.includes(".select('id')"), 'zápis se musí ověřit tím, co se vrátí');
});

test('dávka se vejde do maxDuration funkce', () => {
  const shoda = /const batch = options\.batch \?\? (\d+);/.exec(KOD);
  assert.ok(shoda, 'velikost dávky se nedá přečíst');
  const davka = Number(shoda[1]);
  // vercel.json dává api/cron/translate-recipes maxDuration 120 s.
  // Dvacet receptů i s postupy je na jeden request na 8000 tokenů moc —
  // 23. 8. skončily na 504 dva z šesti běhů.
  assert.ok(davka <= 10, `dávka ${davka} receptů se do 120 s nevejde spolehlivě`);
});
