/**
 * Doplnění postupu receptů pod laťkou — většinou pure funkce z
 * lib/plan/doplneniPostupuReceptu.js (skript samotný testuje jen tvarem
 * zdrojáku, jako scripts/doplneni-postupu-cviku.mjs u postupCviku.test.mjs).
 *
 * `nactiVsechnyRecepty()` je výjimka — volá Supabase klienta, ale bere ho
 * jako parametr, takže jde otestovat s falešným klientem (`fakeClient`
 * níž) bez sítě i bez skutečné databáze.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  nazevSkupiny,
  seskupPodleNazvu,
  vlozGramaze,
  sestavVstupProMetodu,
  sestavVstupProRecept,
  odhadniVstupniTokeny,
  smiPrepsatPostup,
  nactiVsechnyRecepty,
  VELIKOST_STRANKY_SUPABASE,
  DOPLNENI_PROMPT,
  DOPLNENI_PROMPT_SHA256,
} from '../plan/doplneniPostupuReceptu.js';

const KOREN = join(import.meta.dirname, '..', '..');

/** Kroky s přesně daným počtem prvků a přesně daným součtem znaků (join(' ').length) — obsah je nepodstatný, testuje se jen tvar. */
function vyplnKroky(pocet, celkemZnaku) {
  const zbyva = celkemZnaku - (pocet - 1);
  const zakladniDelka = Math.floor(zbyva / pocet);
  const kroky = Array.from({ length: pocet }, () => 'x'.repeat(zakladniDelka));
  const chybi = zbyva - zakladniDelka * pocet;
  if (chybi > 0) kroky[kroky.length - 1] += 'x'.repeat(chybi);
  return kroky;
}

/**
 * Falešný Supabase klient — napodobí jen to, co `nactiVsechnyRecepty()`
 * skutečně volá: `.from().select().order().range()` pro stránku dat
 * a `.from().select('id', {count:'exact', head:true})` pro počet. Vrací
 * `pocetRadku` řádků (id 1..pocetRadku); `pocetJinak`, když je zadaný,
 * simuluje NESOULAD mezi count(*) a tím, co se skutečně dá přečíst.
 */
function fakeClient(pocetRadku, { pocetJinak } = {}) {
  const radky = Array.from({ length: pocetRadku }, (_, i) => ({
    id: i + 1,
    name_cs: `Recept ${i + 1}`,
    ingredients: [],
    instructions_cs: [],
    source: 'llm_generated',
  }));

  return {
    from() {
      /** @type {{ count?: boolean, range?: [number, number] }} */
      const stav = {};
      const chain = {
        select(_cols, opts) {
          stav.count = opts?.count === 'exact';
          return chain;
        },
        eq() { return chain; },
        order() { return chain; },
        range(od, doo) {
          stav.range = [od, doo];
          return chain;
        },
        then(onFulfilled, onRejected) {
          try {
            const vysledek = stav.count
              ? { count: pocetJinak ?? radky.length, error: null }
              : { data: radky.slice(stav.range[0], stav.range[1] + 1), error: null };
            return Promise.resolve(onFulfilled(vysledek));
          } catch (e) {
            if (onRejected) return Promise.resolve(onRejected(e));
            throw e;
          }
        },
      };
      return chain;
    },
  };
}

test('nazevSkupiny ořeže porční variantu a beze změny nechá recept bez varianty', () => {
  assert.equal(nazevSkupiny('Kuře s bramborem — porce 200/300'), 'Kuře s bramborem');
  assert.equal(nazevSkupiny('Kuře s bramborem — porce 150/90'), 'Kuře s bramborem');
  assert.equal(nazevSkupiny('Kuře s bramborem'), 'Kuře s bramborem');
  assert.equal(nazevSkupiny(''), '');
  assert.equal(nazevSkupiny(null), '');
});

test('seskupPodleNazvu seskupí varianty pod jeden klíč a recept bez jména dostane vlastní skupinu', () => {
  const recepty = [
    { id: 1, name_cs: 'Kuře s bramborem — porce 150/70' },
    { id: 2, name_cs: 'Kuře s bramborem — porce 200/300' },
    { id: 3, name_cs: 'Vejce natvrdo s pečivem' },
    { id: 4, name_cs: null },
  ];
  const skupiny = seskupPodleNazvu(recepty);
  assert.equal(skupiny.size, 3);
  assert.deepEqual(skupiny.get('Kuře s bramborem').map((r) => r.id), [1, 2]);
  assert.deepEqual(skupiny.get('Vejce natvrdo s pečivem').map((r) => r.id), [3]);
  assert.equal(skupiny.get('#4')[0].id, 4);
});

test('vlozGramaze doplní gramáž za CELÉ sousloví, ne doprostřed něj, a jen jednou', () => {
  const kroky = [
    'Osol kuřecí prsa a nech chvíli odpočinout.',
    'Opeč kuřecí prsa na pánvi 8 minut při 180 °C.',
    'Uvař brambory v osolené vodě 15 minut.',
    'Podávej kuřecí prsa s brambory na talíři.',
  ];
  const suroviny = [
    { name: 'kuřecí prsa', amount: 200, unit: 'g' },
    { name: 'brambory', amount: 300, unit: 'g' },
  ];
  const vysledek = vlozGramaze(kroky, suroviny);

  assert.equal(vysledek[0], 'Osol kuřecí prsa (200 g) a nech chvíli odpočinout.');
  assert.equal(vysledek[2], 'Uvař brambory (300 g) v osolené vodě 15 minut.');
  // Druhá a čtvrtá zmínka téže suroviny se nedoplňuje znovu.
  assert.equal(vysledek[1], 'Opeč kuřecí prsa na pánvi 8 minut při 180 °C.');
  assert.equal(vysledek[3], 'Podávej kuřecí prsa s brambory na talíři.');
});

test('vlozGramaze beze změny projde kroky, kde surovina chybí nebo nemá jednotku/množství', () => {
  const kroky = ['Osol maso a opeč ho 8 minut při 180 °C.'];
  assert.deepEqual(vlozGramaze(kroky, [{ name: 'sůl' }]), kroky);
  assert.deepEqual(vlozGramaze(kroky, [{ name: 'rýže', amount: 100, unit: 'g' }]), kroky);
  assert.deepEqual(vlozGramaze(kroky, []), kroky);
  assert.deepEqual(vlozGramaze(kroky, null), kroky);
});

test('smiPrepsatPostup: ochrana proti zkrácení — nový kratší v OBOJÍM (kroky i znaky) se zapsat nesmí', () => {
  // Přesně naměřený případ škody 8.–9. 9. 2026: starý postup 6 kroků / 677
  // znaků, nový 4 kroky / 305 znaků — zápis se odmítne.
  const stare = vyplnKroky(6, 677);
  const nove = vyplnKroky(4, 305);
  assert.equal(stare.join(' ').length, 677);
  assert.equal(nove.join(' ').length, 305);
  assert.equal(smiPrepsatPostup(stare, nove), false);
});

test('smiPrepsatPostup: smí nahradit, když nový NENÍ horší v obojím zároveň', () => {
  const stare = vyplnKroky(6, 677);
  // Víc kroků, i když o pár znaků méně — není to zkrácení v obojím.
  assert.equal(smiPrepsatPostup(stare, vyplnKroky(7, 650)), true);
  // Míň kroků, ale výrazně víc znaků — taky ne zkrácení v obojím.
  assert.equal(smiPrepsatPostup(stare, vyplnKroky(4, 700)), true);
  // Delší i s víc kroky — jednoznačné zlepšení.
  assert.equal(smiPrepsatPostup(stare, vyplnKroky(8, 900)), true);
});

test('smiPrepsatPostup: prázdný nebo chybějící starý postup náhradu nezakazuje', () => {
  assert.equal(smiPrepsatPostup([], vyplnKroky(4, 305)), true);
  assert.equal(smiPrepsatPostup(null, vyplnKroky(4, 305)), true);
  assert.equal(smiPrepsatPostup(undefined, vyplnKroky(4, 305)), true);
});

test('nactiVsechnyRecepty: 1114 řádků při stránce 1000 vrátí všech 1114, ne 1000', async () => {
  const client = fakeClient(1114);
  const vysledek = await nactiVsechnyRecepty({ client, velikostStranky: VELIKOST_STRANKY_SUPABASE });
  assert.equal(vysledek.length, 1114);
  // Skutečně dvě stránky, ne jedna oříznutá — poslední řádek musí být tam.
  assert.equal(vysledek[vysledek.length - 1].id, 1114);
});

test('nactiVsechnyRecepty: přesný násobek velikosti stránky (1000) se dočte celý, ne useknutý na první stránce', async () => {
  const client = fakeClient(1000);
  const vysledek = await nactiVsechnyRecepty({ client, velikostStranky: VELIKOST_STRANKY_SUPABASE });
  assert.equal(vysledek.length, 1000);
});

test('nactiVsechnyRecepty: nesoulad načteného počtu proti count(*) shodí běh', async () => {
  // count(*) tvrdí 1114, stránkováním (v testu s malou stránkou, ať test
  // neběží zbytečně dlouho) se ale reálně dá přečíst jen 1000 — přesně ten
  // vzor, který 8.–9. 9. 2026 nechal běh tiše pokračovat s neúplnými daty.
  const client = fakeClient(1000, { pocetJinak: 1114 });
  await assert.rejects(
    () => nactiVsechnyRecepty({ client, velikostStranky: 100 }),
    /nesoulad počtu.*1114.*1000/s
  );
});

test('nactiVsechnyRecepty: shodný počet (i s malou stránkou) neshodí běh', async () => {
  const client = fakeClient(250);
  const vysledek = await nactiVsechnyRecepty({ client, velikostStranky: 100 });
  assert.equal(vysledek.length, 250);
});

test('sestavVstupProMetodu pošle jen názvy surovin, bez gramáže', () => {
  const vstup = sestavVstupProMetodu({
    nazev: 'Kuře s bramborem',
    suroviny: [{ name: 'kuřecí prsa', amount: 200, unit: 'g' }, { name: 'brambory', amount: 300, unit: 'g' }],
  });
  assert.equal(vstup.ukol, 'metoda_pro_skupinu');
  assert.deepEqual(vstup.suroviny, ['kuřecí prsa', 'brambory']);
  assert.equal(JSON.stringify(vstup).includes('200'), false);
});

test('sestavVstupProRecept pošle gramáž, protože jde o jeden konkrétní recept', () => {
  const vstup = sestavVstupProRecept({
    nazev: 'Kuře s bramborem',
    suroviny: [{ name: 'kuřecí prsa', amount: 200, unit: 'g' }],
  });
  assert.equal(vstup.ukol, 'postup_pro_recept');
  assert.deepEqual(vstup.suroviny, [{ name: 'kuřecí prsa', amount: 200, unit: 'g' }]);
});

test('odhadniVstupniTokeny vrací kladné číslo úměrné délce vstupu', () => {
  const maly = sestavVstupProRecept({ nazev: 'X', suroviny: [{ name: 'sůl', amount: 1, unit: 'g' }] });
  const velky = sestavVstupProRecept({
    nazev: 'Dlouhý název receptu s hodně surovinami',
    suroviny: Array.from({ length: 20 }, (_, i) => ({ name: `surovina ${i}`, amount: i + 1, unit: 'g' })),
  });
  assert.ok(odhadniVstupniTokeny(maly) > 0);
  assert.ok(odhadniVstupniTokeny(velky) > odhadniVstupniTokeny(maly));
});

test('prompt existuje v gitu, otisk sedí a nese obě zadání i zákaz kcal/vymýšlení', () => {
  const cesta = join(KOREN, 'prompts', 'recipe-instructions-rewrite.md');
  assert.ok(existsSync(cesta), 'prompt musí ležet v prompts/ (includeFiles ve vercel.json)');
  const obsah = readFileSync(cesta, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(DOPLNENI_PROMPT, obsah);
  assert.match(DOPLNENI_PROMPT_SHA256, /^[0-9a-f]{64}$/);

  assert.match(DOPLNENI_PROMPT, /metoda_pro_skupinu/);
  assert.match(DOPLNENI_PROMPT, /postup_pro_recept/);
  assert.match(DOPLNENI_PROMPT, /kcal/i);
  assert.match(DOPLNENI_PROMPT, /Nevymýšlej/i);
});

test('skript: má --dry-run/--zdroj/--limit, nevolá model na sucho a nikdy nezapíše postup, který neprojde laťkou', () => {
  const skript = readFileSync(join(KOREN, 'scripts', 'doplneni-postupu-receptu.mjs'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(skript, /'--dry-run'/);
  assert.match(skript, /'--zdroj='/);
  assert.match(skript, /'--limit='/);

  // Dry-run se vrátí (continue) DŘÍV, než přijde na řadu volání modelu.
  const dryRunGroup = skript.indexOf('if (dryRun) {\n      odhadovanychTokenu += odhadniVstupniTokeny(vstupMetoda);');
  const volaniGroup = skript.indexOf('zavolejModel(openai, vstupMetoda)');
  assert.ok(dryRunGroup > 0 && volaniGroup > dryRunGroup, 'u skupin se model nevolá, dokud se nerozhodne, že nejde o dry-run');

  // Zápis je vždy podmíněný výsledkem posudPostup(), nikdy napřímo po volání modelu.
  const zapisyPodleSkupin = [...skript.matchAll(/zapisPostup\(varianta\.id/g)];
  assert.ok(zapisyPodleSkupin.length >= 2, 'zápis skupinové varianty existuje v obou pokusech (první i retry)');
  const zapisJednotlivy = skript.indexOf('zapisPostup(recept.id');
  const posudekJednotlivy = skript.lastIndexOf('posudPostup(', zapisJednotlivy);
  assert.ok(posudekJednotlivy > 0 && posudekJednotlivy < zapisJednotlivy);

  // Retry je nejvýš jednou navíc (pokus <= 2), ne nekonečná smyčka.
  assert.match(skript, /pokus <= 2/);

  // Přeskočený recept se zaloguje s důvodem, ne tiše.
  assert.match(skript, /preskoceno\.push/);

  // Ochrana proti zkrácení: obě místa zápisu se ptají rozhodniOZapisu(),
  // ne přímo posudek.ok — jinak by gate mohl znovu přepsat dobrý postup
  // horším, jen proto že ten horší sám prošel laťkou.
  assert.match(skript, /smiPrepsatPostup/);
  // 1 definice funkce + 3 volání (skupiny: první pokus i retry, jednotlivé recepty).
  const rozhodnutiVyskyty = [...skript.matchAll(/rozhodniOZapisu\(posudek/g)];
  assert.equal(rozhodnutiVyskyty.length, 4, 'rozhodniOZapisu() se volá u obou pokusů skupinové metody i u jednotlivých receptů');
});

test('skript: počet receptů s varováním se loguje ZVLÁŠŤ od počtu pod laťkou, ne jako totéž číslo', () => {
  const skript = readFileSync(join(KOREN, 'scripts', 'doplneni-postupu-receptu.mjs'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(skript, /receptu_s_varovanim/);
  assert.match(skript, /kandidatu_pod_latkou/);
  // Varování se počítají z `posudek.varovani`, ne z toho, jestli recept
  // spadl pod laťku (`!posudek.ok`) — to jsou dvě různé věci od druhého
  // kola opravy: `podLatkou` řídí zápis/přepis, `receptuSVarovanim` je
  // jen informativní počet k ruční kontrole.
  assert.match(skript, /varovani\.length > 0/);
  const poziceVarovani = skript.indexOf('receptuSVarovanim');
  const poziceOk = skript.indexOf('!posudek.ok');
  assert.ok(poziceVarovani >= 0 && poziceOk >= 0);
});

test('skript: recepty čte přes nactiVsechnyRecepty() (stránkované), ne jedním .select() bez rozsahu', () => {
  const skript = readFileSync(join(KOREN, 'scripts', 'doplneni-postupu-receptu.mjs'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(skript, /nactiVsechnyRecepty/);
  // Žádné VLASTNÍ .from('recipes_catalog').select(...) v main() bez
  // .range() — přesně tenhle vzor 9. 9. 2026 tiše useknul katalog na
  // 1000 řádků. `.from('recipes_catalog').update(...)` v zapisPostup()
  // je v pořádku (jeden řádek podle id, nic ke stránkování) a zůstává.
  assert.doesNotMatch(skript, /\.from\('recipes_catalog'\)\s*\n?\s*\.select\(/);
});
