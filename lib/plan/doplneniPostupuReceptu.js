/**
 * DOPLNĚNÍ POSTUPU RECEPTŮ POD LAŤKOU — logika za scripts/doplneni-postupu-receptu.mjs.
 *
 * 251 z 1104 receptů (opraveno 9. 9. 2026 — `kvalitaPostupu.js` měl vlastní
 * chyby v porovnávání a odhad „420" byl nadhodnocený jimi, ne skutečným
 * stavem katalogu) neprojde `posudPostup()`. `coach_seed_v1` je zvláštní
 * případ: recepty jsou ve skutečnosti METODY s doplněnou gramáží pro
 * porční varianty (" — porce 200/300" apod.) — model se proto volá jednou
 * na SKUPINU, ne jednou na recept, a gramáž se do vygenerované metody
 * dosadí čistou funkcí `vlozGramaze()`.
 *
 * Model, který postup vygeneruje, se NIKDY nebere na slovo — výsledek vždy
 * projde zpátky přes `posudPostup()`. Když neprojde, zkusí se to jednou
 * znovu (nová metoda/nový postup); pokud neprojde ani podruhé, recept/varianta
 * se přeskočí a zaloguje. Nikdy se nezapíše postup, který sám neprojde laťkou.
 *
 * DRUHÁ POJISTKA — `smiPrepsatPostup()`. I recept, který gate (nesprávně)
 * označí za vatu, může mít ve skutečnosti dobrý, dlouhý postup — přesně
 * tenhle běh 8.–9. 9. 2026 přepsal 76 takových receptů (průměr 677 znaků)
 * kratšími (305), protože chyba v gatu byla na straně gatu, ne receptu.
 * Novým postupem se PROTO nikdy nepřepisuje starý, který má víc kroků
 * i víc znaků zároveň — bez ohledu na to, co si `posudPostup()` o novém
 * textu myslí. Gate může mít chybu; tahle kontrola žádnou logiku
 * nepředpokládá, jen porovná dvě čísla.
 *
 * TŘETÍ POJISTKA — `nactiVsechnyRecepty()`. Naměřeno 9. 9. 2026: skript
 * načítal recepty jedním `.select()` bez stránkování a PostgREST/Supabase
 * mlčky ořízne odpověď na 1000 řádků. Z 1114 receptů se tak 26 s nejvyšším
 * `id` do běhu vůbec nedostalo — a výstup přesto hlásil `recepty_celkem:
 * 1000`, jako by šlo o úplné číslo. Řešení stránkuje přes `.range()`
 * a navíc porovnává výsledek s nezávislým `count(*)` — nesoulad je stejný
 * druh chyby jako v `zkontrolujKonzistenciSurovin()`
 * (`lib/plan/kvalitaPostupu.js`): hlasitý pád, ne tiché pokračování
 * s neúplnými daty.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { posudPostup, normalizuj, slovaTextu, slovoJeVTextu } from './kvalitaPostupu.js';

/**
 * gpt-4o, ne mini — stejný důvod jako u `recipeGenerator.js`: čeština je
 * jediné, co od modelu kupujeme, a mini v ní píše kostrbatě.
 */
export const DOPLNENI_MODEL = 'gpt-4o';
export const DOPLNENI_TEMPERATURE = 0.4;
export const DOPLNENI_MAX_OUTPUT_TOKENS = 700;

const PROMPT_PATH = join(process.cwd(), 'prompts', 'recipe-instructions-rewrite.md');
export const DOPLNENI_PROMPT = readFileSync(PROMPT_PATH, 'utf8').replace(/\r\n/g, '\n');
export const DOPLNENI_PROMPT_SHA256 = createHash('sha256').update(DOPLNENI_PROMPT).digest('hex');

/** Zdroj, jehož recepty jsou ve skutečnosti porční varianty jedné metody. */
export const SKUPINOVY_ZDROJ = 'coach_seed_v1';

/**
 * „Kuře s bramborem — porce 200/300" → „Kuře s bramborem".
 *
 * @param {unknown} nazev
 * @returns {string}
 */
export function nazevSkupiny(nazev) {
  return String(nazev ?? '').replace(/\s*—\s*porce\b.*$/iu, '').trim();
}

/**
 * @param {Array<{ id: number, name_cs: string }>} recepty
 * @returns {Map<string, Array<{ id: number, name_cs: string }>>}
 */
export function seskupPodleNazvu(recepty) {
  /** @type {Map<string, Array<{ id: number, name_cs: string }>>} */
  const mapa = new Map();
  for (const r of Array.isArray(recepty) ? recepty : []) {
    const klic = nazevSkupiny(r?.name_cs) || `#${r?.id}`;
    if (!mapa.has(klic)) mapa.set(klic, []);
    mapa.get(klic).push(r);
  }
  return mapa;
}

/**
 * @param {number} amount
 * @returns {string}
 */
function formatMnozstvi(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/**
 * Doplní gramáž KONKRÉTNÍ varianty do obecné metody vygenerované pro celou
 * skupinu. Vkládá se za PRVNÍ výskyt slova ze jména suroviny v postupu —
 * jedna surovina, jedno doplnění, žádné opakované vsouvání do každé zmínky.
 *
 * @param {string[]} kroky
 * @param {Array<{ name?: string, amount?: number, unit?: string }>} suroviny
 * @returns {string[]}
 */
export function vlozGramaze(kroky, suroviny) {
  const vysledek = [...(Array.isArray(kroky) ? kroky : [])];

  for (const s of Array.isArray(suroviny) ? suroviny : []) {
    const nazev = String(s?.name ?? '').trim();
    const unit = String(s?.unit ?? '').trim();
    const mnozstvi = formatMnozstvi(s?.amount);
    if (!nazev || !unit || !mnozstvi) continue;

    const zakladniSlova = normalizuj(nazev).split(' ').filter((w) => w.length >= 3);
    if (!zakladniSlova.length) continue;

    // Přednost dostává POSLEDNÍ podstatné slovo názvu — u „kuřecí prsa" je to
    // „prsa" (hlavní podstatné jméno), aby se gramáž vložila za celé sousloví
    // („kuřecí prsa (200 g)"), ne doprostřed něj („kuřecí (200 g) prsa").
    // Jen když se poslední slovo v postupu vůbec nenajde, zkusí se kterékoli
    // z ostatních — pro případ, že postup mluví jen o přívlastku.
    const poradiHledani = [zakladniSlova[zakladniSlova.length - 1], ...zakladniSlova.slice(0, -1)];

    let vlozeno = false;
    for (const hledane of poradiHledani) {
      if (vlozeno) break;
      for (let i = 0; i < vysledek.length && !vlozeno; i += 1) {
        const tokeny = vysledek[i].split(/(\P{L}+)/u);
        for (let t = 0; t < tokeny.length; t += 1) {
          const token = tokeny[t];
          if (!token || !/\p{L}/u.test(token)) continue;
          const tokenNorm = normalizuj(token);
          if (slovoJeVTextu(hledane, [tokenNorm])) {
            tokeny.splice(t + 1, 0, ` (${mnozstvi} ${unit})`);
            vysledek[i] = tokeny.join('');
            vlozeno = true;
            break;
          }
        }
      }
    }
  }

  return vysledek;
}

/**
 * Vstup pro model — JEDNA metoda na celou skupinu porčních variant. Bez
 * gramáže: ta se stejně dosazuje až po vygenerování (`vlozGramaze`), takže
 * poslat ji modelu by jen svádělo k tomu, aby ji vetkl přímo do vět.
 *
 * @param {{ nazev: string, suroviny: Array<{ name?: string }> }} vstup
 * @returns {Record<string, unknown>}
 */
export function sestavVstupProMetodu({ nazev, suroviny }) {
  return {
    ukol: 'metoda_pro_skupinu',
    nazev,
    suroviny: (Array.isArray(suroviny) ? suroviny : [])
      .map((s) => String(s?.name ?? '').trim())
      .filter(Boolean),
  };
}

/**
 * Vstup pro model — postup pro JEDEN konkrétní recept, s gramáží.
 *
 * @param {{ nazev: string, suroviny: Array<{ name?: string, amount?: number, unit?: string }> }} vstup
 * @returns {Record<string, unknown>}
 */
export function sestavVstupProRecept({ nazev, suroviny }) {
  return {
    ukol: 'postup_pro_recept',
    nazev,
    suroviny: (Array.isArray(suroviny) ? suroviny : [])
      .map((s) => ({ name: s?.name, amount: s?.amount, unit: s?.unit }))
      .filter((s) => s.name),
  };
}

/**
 * @param {OpenAI} openai
 * @param {Record<string, unknown>} vstup
 * @returns {Promise<{ kroky: string[], usage: { input_tokens: number, output_tokens: number } }>}
 */
export async function zavolejModel(openai, vstup) {
  const completion = await openai.chat.completions.create({
    model: DOPLNENI_MODEL,
    temperature: DOPLNENI_TEMPERATURE,
    max_tokens: DOPLNENI_MAX_OUTPUT_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: DOPLNENI_PROMPT },
      { role: 'user', content: JSON.stringify(vstup) },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI empty response');
  const parsed = JSON.parse(raw);
  const kroky = Array.isArray(parsed.kroky)
    ? parsed.kroky.map((s) => String(s ?? '').trim()).filter(Boolean)
    : [];

  return {
    kroky,
    usage: {
      input_tokens: completion.usage?.prompt_tokens ?? 0,
      output_tokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}

/**
 * Smí nový postup nahradit starý?
 *
 * NE, když je nový kratší v OBOJÍM zároveň — v počtu kroků i v počtu
 * znaků. To je jediná podmínka: postup, který má víc kroků NEBO víc
 * znaků (jen jedno z obojího), náhradu nezakazuje — může jít o legitimní
 * zestručnění ukecaného kroku do dvou akcí, nebo naopak o rozepsání
 * jednoho kroku na dva kratší. Zakazuje se jen jednoznačné zhoršení
 * v obou směrech zároveň, přesně ten vzor, který 8.–9. 9. 2026 přepsal
 * 76 dobrých postupů (6 kroků/677 znaků) kratšími (4 kroky/305 znaků).
 *
 * Prázdný nebo chybějící starý postup náhradu nezakazuje — není s čím
 * srovnávat, takže cokoli nového je posun dopředu.
 *
 * @param {unknown} stareKroky
 * @param {unknown} noveKroky
 * @returns {boolean}
 */
export function smiPrepsatPostup(stareKroky, noveKroky) {
  const stare = Array.isArray(stareKroky) ? stareKroky.map((k) => String(k ?? '').trim()).filter(Boolean) : [];
  if (!stare.length) return true;

  const nove = Array.isArray(noveKroky) ? noveKroky.map((k) => String(k ?? '').trim()).filter(Boolean) : [];
  const stareZnaku = stare.join(' ').length;
  const noveZnaku = nove.join(' ').length;

  const mineKroky = nove.length < stare.length;
  const mineZnaku = noveZnaku < stareZnaku;
  return !(mineKroky && mineZnaku);
}

/** Kolik řádků PostgREST/Supabase vrátí na jeden dotaz nejvýš — nad tím se musí stránkovat. */
export const VELIKOST_STRANKY_SUPABASE = 1000;

/**
 * Načte VŠECHNY recepty `recipes_catalog` (volitelně omezené na jeden
 * zdroj) přes `.range()` stránkování, dokud nepřijde stránka kratší než
 * plná velikost — jeden `.select()` bez stránkování mlčky ořízne odpověď
 * na `VELIKOST_STRANKY_SUPABASE` řádků a zbytek katalogu do běhu vůbec
 * nedorazí (naměřeno 9. 9. 2026: 26 z 1114 receptů s nejvyšším `id`).
 *
 * Po dočtení porovná načtený počet s nezávislým `count(*)` NAD STEJNÝM
 * filtrem. Nesoulad HODÍ CHYBU — stejná zásada jako
 * `zkontrolujKonzistenciSurovin()` v `kvalitaPostupu.js`: radši hlasitý
 * pád, který běh zastaví, než tiché pokračování s neúplnými daty a
 * výstupem, který vypadá jako úplné číslo, i když není.
 *
 * @param {{ client: any, zdrojFiltr?: string|null, velikostStranky?: number }} vstup
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function nactiVsechnyRecepty({ client, zdrojFiltr = null, velikostStranky = VELIKOST_STRANKY_SUPABASE }) {
  let dotazPoctu = client
    .from('recipes_catalog')
    .select('id', { count: 'exact', head: true });
  if (zdrojFiltr) dotazPoctu = dotazPoctu.eq('source', zdrojFiltr);
  const { count, error: chybaPoctu } = await dotazPoctu;
  if (chybaPoctu) throw new Error(`recipes_catalog count(*): ${chybaPoctu.message}`);

  /** @type {Array<Record<string, unknown>>} */
  const vsechny = [];
  let od = 0;
  for (;;) {
    let dotaz = client
      .from('recipes_catalog')
      .select('id, name_cs, ingredients, instructions_cs, source')
      .order('id', { ascending: true })
      .range(od, od + velikostStranky - 1);
    if (zdrojFiltr) dotaz = dotaz.eq('source', zdrojFiltr);

    const { data, error } = await dotaz;
    if (error) throw new Error(`recipes_catalog: ${error.message}`);
    const radky = data || [];
    vsechny.push(...radky);
    if (radky.length < velikostStranky) break;
    od += velikostStranky;
  }

  if (count != null && vsechny.length !== count) {
    throw new Error(
      `nactiVsechnyRecepty: nesoulad počtu — count(*) říká ${count}, stránkováním se načetlo ${vsechny.length}. `
      + 'Běh se zastavuje, ne aby pokračoval s neúplnými (nebo zdvojenými) daty.'
    );
  }

  return vsechny;
}

/** Zdroj zapsaný do instructions_source u skupinové (coach_seed_v1) metody. */
export const ZDROJ_METODA = 'model_gpt4o_metoda';
/** Zdroj zapsaný do instructions_source u jednotlivě dopsaného receptu. */
export const ZDROJ_JEDNOTLIVY = 'model_gpt4o_jednotlivy';

/**
 * Hrubý odhad tokenů ze znaků (~4 znaky/token) — pro `--dry-run`, kde se
 * model NEVOLÁ (žádný dry-run nesmí nic stát). Skutečná spotřeba se
 * dozví z `completion.usage` až při ostrém běhu.
 *
 * @param {unknown} vstup
 * @returns {number}
 */
export function odhadniVstupniTokeny(vstup) {
  return Math.ceil((DOPLNENI_PROMPT.length + JSON.stringify(vstup).length) / 4);
}
