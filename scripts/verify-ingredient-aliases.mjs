#!/usr/bin/env node
/**
 * Ověřovací brána pro navržené aliasy surovin.
 *
 *   node scripts/verify-ingredient-aliases.mjs .cache/alias-navrh.json
 *
 * PROČ EXISTUJE: alias, který dává jazykový smysl, může být nutriční nesmysl
 * („non-fat milk" není „mléko", liší se tuk). Návrh proto nerozhoduje — rozhoduje
 * výpočet nad skutečnými recepty.
 *
 * Postup pro alias X → Y:
 *   a) najde aktivní recepty, které X obsahují
 *   b) spočítá jejich nutrici přes compute_nutrition_for_ingredients nad
 *      UPRAVENÝM jsonb (X přepsáno na Y). Do DB se nic nezapisuje.
 *   c) porovná výsledek s kcal uloženými u receptu
 *   d) alias PROJDE, jen když medián relativní odchylky ≤ 25 % a žádný recept
 *      nepřekročí 60 %
 *
 * Tolerance je široká schválně: kolísání porcí a jednotek je normální, chytáme
 * hrubé chyby, ne drobnosti. Špatný alias se pozná tím, že kalorie utečou řádově.
 *
 * Aby test vůbec něco změřil, aplikují se PŘI VÝPOČTU všechny navržené aliasy
 * najednou — recept obvykle blokuje víc neznámých názvů a s jediným opraveným
 * by zůstal nekompletní.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

for (const name of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && process.env[m[1].trim()] == null) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export const MEDIAN_LIMIT = 0.25;
export const MAX_LIMIT = 0.60;

/** Stejná normalizace jako v compute_nutrition_for_ingredients. */
export function normalizuj(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function median(cisla) {
  if (!cisla.length) return null;
  const s = [...cisla].sort((a, b) => a - b);
  const p = Math.floor(s.length / 2);
  return s.length % 2 ? s[p] : (s[p - 1] + s[p]) / 2;
}

const cestaNavrhu = process.argv[2] || '.cache/alias-navrh.json';

/**
 * Prefix vystupnich souboru. Bez nej by druhe kolo prepsalo zaznam prvniho —
 * a prave druhe kolo je bezny pripad: kdyz se doplni slovnik, cast drive
 * zamitnutych aliasu uz merit jde.
 */
const OUT = (() => {
  const a = process.argv.find((x) => x.startsWith('--out='));
  return a ? a.slice(6) : 'aliasy';
})();

/**
 * Vstup snese oba tvary: navrh { alias: 'cil' } i vystup teto brany
 * { alias: { cil, ... } }. Diky tomu jde branu pustit primo nad jejim
 * vlastnim souborem neproslych, bez rucniho prevodu.
 */
const navrh = JSON.parse(readFileSync(cestaNavrhu, 'utf8'));
const mapa = new Map(Object.entries(navrh).map(([k, v]) => [
  normalizuj(k),
  typeof v === 'string' ? v : v?.cil,
]).filter(([, cil]) => typeof cil === 'string' && cil.length > 0));

const { data: recepty, error } = await supabase
  .from('recipes_catalog')
  .select('id, name_cs, kcal, servings, ingredients')
  .eq('active', true);
if (error) throw new Error(error.message);

/** Které recepty obsahují který alias. */
const zasazene = new Map();
for (const r of recepty) {
  for (const i of r.ingredients || []) {
    const n = normalizuj(i?.name);
    if (mapa.has(n)) {
      if (!zasazene.has(n)) zasazene.set(n, []);
      if (!zasazene.get(n).includes(r.id)) zasazene.get(n).push(r.id);
    }
  }
}

/** Suroviny receptu s aplikovanými VŠEMI navrženými aliasy. */
function prepis(ingredients) {
  return (ingredients || []).map((i) => {
    const cil = mapa.get(normalizuj(i?.name));
    return cil ? { ...i, name: cil } : i;
  });
}

/** Totéž, ale JEDEN alias se záměrně neaplikuje — pro měření jeho příspěvku. */
function prepisKrome(ingredients, vynechany) {
  return (ingredients || []).map((i) => {
    const n = normalizuj(i?.name);
    const cil = mapa.get(n);
    return cil && n !== vynechany ? { ...i, name: cil } : i;
  });
}

/**
 * Kolik kcal DO RECEPTU PŘIDÁ právě tenhle alias.
 *
 * PROČ TO POTŘEBUJEME. Bez toho brána soudila alias podle celkové chyby
 * receptu. Naměřeno: „olive oil", „garlic", „butter" i „parsley" spadly se
 * shodnou odchylkou 50,5 %, protože všechny čtyři měly jediný měřitelný
 * recept — #651 alfredo omáčku, kde uložených 501 kcal nesedí se 754 kcal ze
 * surovin. Česnek za ten rozdíl nemůže; přispívá do receptu jednotkami kalorií.
 * Recept, ve kterém alias skoro nic neváží, o něm nemůže nic vypovědět.
 */
async function prispevek(r, alias) {
  const [sNim, bezNej] = await Promise.all([
    supabase.rpc('compute_nutrition_for_ingredients', { p_ingredients: prepis(r.ingredients) }),
    supabase.rpc('compute_nutrition_for_ingredients', { p_ingredients: prepisKrome(r.ingredients, alias) }),
  ]);
  const a = Array.isArray(sNim.data) ? sNim.data[0] : sNim.data;
  const b = Array.isArray(bezNej.data) ? bezNej.data[0] : bezNej.data;
  return Math.abs((Number(a?.kcal) || 0) - (Number(b?.kcal) || 0));
}

/**
 * Kolik musí alias v receptu vážit, aby ten recept o něm něco vypovídal.
 * 10 % uložených kcal: pod tím je chyba receptu vždycky větší než celý
 * příspěvek aliasu a měřili bychom šum.
 */
const MIN_PODIL = 0.10;

const vysledky = new Map();
let hotovo = 0;
for (const r of recepty) {
  const zasahuje = (r.ingredients || []).some((i) => mapa.has(normalizuj(i?.name)));
  if (!zasahuje) continue;

  const [po, pred] = await Promise.all([
    supabase.rpc('compute_nutrition_for_ingredients', { p_ingredients: prepis(r.ingredients) }),
    supabase.rpc('compute_nutrition_for_ingredients', { p_ingredients: r.ingredients }),
  ]);
  const { data, error: chyba } = po;
  const n = Array.isArray(data) ? data[0] : data;
  const nPred = Array.isArray(pred.data) ? pred.data[0] : pred.data;

  hotovo += 1;
  if (hotovo % 25 === 0) console.error(`  … ${hotovo} receptů`);

  if (chyba || !n) continue;
  const ulozeno = Number(r.kcal) || 0;
  // kcal je v katalogu NA PORCI, ale suroviny u importovanych receptu casto
  // popisuji cely pekac ("12 porci sul a pepr", 450 g ziti). Bez deleni
  // porcemi porovnavame celou formu proti jednomu talíri a kazdy vicedavkovy
  // recept vyjde jako desetinasobny prestrel — coz nerika nic o aliasu.
  const porci = Math.max(1, Number(r.servings) || 1);
  const spocteno = (Number(n.kcal) || 0) / porci;
  const zaznam = {
    id: r.id,
    name_cs: r.name_cs,
    complete: n.complete === true,
    ulozeno,
    spocteno,
    odchylka: ulozeno > 0 ? Math.abs(spocteno - ulozeno) / ulozeno : null,
    // Kolik dal soucet BEZ prepisu. U nekompletnich receptu je to jediny zpusob,
    // jak alias zmerit: nezname suroviny prispivaji nulou, takze soucet vzdycky
    // podstreli — ale prestrelit ho alias nesmi.
    porci,
    spocteno_pred: (Number(nPred?.kcal) || 0) / porci,
    prestrel: ulozeno > 0 ? spocteno / ulozeno : null,
  };
  for (const i of r.ingredients || []) {
    const key = normalizuj(i?.name);
    if (!mapa.has(key)) continue;
    if (!vysledky.has(key)) vysledky.set(key, []);
    if (!vysledky.get(key).some((x) => x.id === r.id)) vysledky.get(key).push(zaznam);
  }
}

/** Overi, ze cilova surovina je dohledatelna — jinak by alias mlcky nedelal nic. */
const cacheCilu = new Map();
async function cilSeParuje(cil) {
  if (cacheCilu.has(cil)) return cacheCilu.get(cil);
  const { data } = await supabase.rpc('compute_nutrition_for_ingredients', {
    p_ingredients: [{ name: cil, amount: 100, unit: 'g' }],
  });
  const n = Array.isArray(data) ? data[0] : data;
  const ok = n?.complete === true;
  cacheCilu.set(cil, ok);
  return ok;
}

const prosly = {};
const neprosly = {};
for (const [alias, cil] of mapa) {
  const vsechny = vysledky.get(alias) || [];
  // Merit jde jen tam, kde je nutrice po prepisu KOMPLETNI. Necompletni soucet
  // je castecny a porovnavat ho s ulozenymi kcal by merilo diry, ne alias.
  const kompletni = vsechny.filter((v) => v.complete && v.odchylka != null);

  // …a kde alias zaroven neco vazi. Recept, do ktereho prispiva par kalorii,
  // nemuze jeho spravnost ani potvrdit, ani vyvratit.
  const meritelne = [];
  const nevypovidajici = [];
  for (const v of kompletni) {
    const r = recepty.find((x) => x.id === v.id);
    const kcalAliasu = r ? await prispevek(r, alias) / v.porci : 0;
    const podil = v.ulozeno > 0 ? kcalAliasu / v.ulozeno : 0;
    if (podil >= MIN_PODIL) meritelne.push(v);
    else nevypovidajici.push({ id: v.id, podil: Number(podil.toFixed(3)) });
  }
  const odchylky = meritelne.map((v) => v.odchylka);
  const med = median(odchylky);
  const max = odchylky.length ? Math.max(...odchylky) : null;

  const zaznam = {
    cil,
    receptu_celkem: (zasazene.get(alias) || []).length,
    meritelnych: meritelne.length,
    kompletnich: kompletni.length,
    nevypovidajicich: nevypovidajici.length,
    median_odchylky: med == null ? null : Number(med.toFixed(3)),
    max_odchylky: max == null ? null : Number(max.toFixed(3)),
    recepty: meritelne.map((v) => ({
      id: v.id, name_cs: v.name_cs, ulozeno: v.ulozeno,
      spocteno: v.spocteno, odchylka: Number(v.odchylka.toFixed(3)),
    })),
  };

  if (!meritelne.length) {
    // Druhe kriterium pro recepty, ktere kompletni nebudou ani po prepisu
    // (blokuji je dalsi nezname nazvy). Merit odchylku od ulozenych kcal nema
    // smysl — soucet je castecny a vzdycky podstreli. Merit se da smer:
    // spatny alias se pozna tim, ze kalorie UTECOU nahoru, protoze surovina
    // ma nekolikanasobnou hustotu. Alias projde, kdyz po prepisu soucet
    // neprestreli ulozenou hodnotu o vic nez MAX_LIMIT a zaroven neco pridal.
    const kandidati = vsechny.filter((v) => v.prestrel != null);
    const prestrely = kandidati.map((v) => v.prestrel);
    const nejvyssi = prestrely.length ? Math.max(...prestrely) : null;
    // Puvodne se testovalo "prepis neco pridal". U bylinek a vody je prirustek
    // v jednotkach kcal, takze test padal i u spravnych aliasu. Spravna otazka
    // je jina: parujeme vubec cil? To se da overit primo, jednou surovinou.
    const pridal = await cilSeParuje(cil);
    const zaznam2 = {
      ...zaznam,
      kriterium: 'smer (recepty nejsou kompletni)',
      nejvyssi_prestrel: nejvyssi == null ? null : Number(nejvyssi.toFixed(3)),
      cil_se_paruje: pridal,
    };
    if (!kandidati.length) {
      neprosly[alias] = { ...zaznam2, duvod: 'zadny zasazeny aktivni recept' };
    } else if (!pridal) {
      neprosly[alias] = { ...zaznam2, duvod: 'cil se nesparuje — alias by mlcky nedelal nic' };
    } else if (nejvyssi > 1 + MAX_LIMIT) {
      neprosly[alias] = { ...zaznam2, duvod: `soucet prestrelil ulozene kcal ${(nejvyssi * 100).toFixed(0)} %` };
    } else {
      prosly[alias] = zaznam2;
    }
  } else if (med > MEDIAN_LIMIT) {
    neprosly[alias] = { ...zaznam, duvod: `median odchylky ${(med * 100).toFixed(1)} % > ${MEDIAN_LIMIT * 100} %` };
  } else if (max > MAX_LIMIT) {
    neprosly[alias] = { ...zaznam, duvod: `nejhorsi recept ${(max * 100).toFixed(1)} % > ${MAX_LIMIT * 100} %` };
  } else {
    prosly[alias] = zaznam;
  }
}

writeFileSync(`.cache/${OUT}-prosly.json`, JSON.stringify(prosly, null, 2));
writeFileSync(`.cache/${OUT}-neprosly.json`, JSON.stringify(neprosly, null, 2));

const duvody = {};
for (const v of Object.values(neprosly)) {
  const k = v.duvod.startsWith('neoveritelne') ? 'neoveritelne' : v.duvod.split(' ')[0];
  duvody[k] = (duvody[k] || 0) + 1;
}
console.log('');
console.log('navrzeno aliasu:  %d', mapa.size);
console.log('PROSLO:           %d', Object.keys(prosly).length);
console.log('NEPROSLO:         %d', Object.keys(neprosly).length);
console.log('  podle duvodu:   %s', JSON.stringify(duvody));
console.log('');
console.log('vystup: .cache/%s-prosly.json, .cache/%s-neprosly.json', OUT, OUT);
