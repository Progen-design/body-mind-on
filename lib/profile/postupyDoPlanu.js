/**
 * POSTUP PŘÍPRAVY DO ULOŽENÉHO PLÁNU.
 *
 * PROČ. `structured_plan_json` nese u každého jídla `catalog_id`, ale postup
 * ne — objekt `recipe` v plánu má název, makra a obrázek, `instructions` v něm
 * nejsou ani jednou ze 105 měřených porcí. RecipeModal proto sahal po čtyřech
 * natvrdo psaných větách („Připravte si všechny čerstvé suroviny podle
 * gramáže."), které viděl každý u každého jídla.
 *
 * Postup přitom v databázi je: všech 105 jídel se páruje na `recipes_catalog`
 * a všech 105 tam má český `instructions_cs`, průměrně 4,7 kroku. Dopárování
 * se dělá tady, při čtení profilu — ne v generátoru, aby postup dostaly
 * i plány vygenerované dřív.
 *
 * CO TENHLE MODUL NEDĚLÁ: nevymýšlí kroky a nedosazuje generický návod. Když
 * recept použitelný postup nemá, do plánu se nic nezapíše a UI sekci skryje.
 * Prázdná sekce ani „—" u postupu nedávají smysl — to není chybějící hodnota,
 * to je chybějící recept.
 *
 * MODUL JE ČISTÝ — bez importů kromě sdíleného filtru kroků, kvůli
 * `node --test` bez transpilace.
 */

import { pouzitelneKroky } from './postupReceptu.js';

/** Dny plánu, ať už jsou uložené kdekoli. */
function dnyPlanu(plan) {
  const dny = plan?.structured_plan_json?.days;
  return Array.isArray(dny) ? dny : [];
}

/** Jídla jednoho dne. */
function jidlaDne(den) {
  return Array.isArray(den?.meals) ? den.meals : [];
}

/**
 * Katalogová id všech jídel ve všech plánech, bez duplicit.
 *
 * Vrací řetězce — v `structured_plan_json` je id někdy číslo, jindy řetězec,
 * a porovnávat se to musí s `recipes_catalog.id`.
 *
 * @param {Array<object>} plany
 * @returns {string[]}
 */
export function catalogIdyZPlanu(plany) {
  if (!Array.isArray(plany)) return [];

  const idcka = new Set();
  for (const plan of plany) {
    for (const den of dnyPlanu(plan)) {
      for (const jidlo of jidlaDne(den)) {
        const id = jidlo?.catalog_id;
        if (id !== null && id !== undefined && String(id).trim() !== '') {
          idcka.add(String(id));
        }
      }
    }
  }

  return [...idcka];
}

/**
 * Postup a doba přípravy z katalogového řádku, nebo null.
 *
 * `ready_in_minutes` je v katalogu prázdný ve všech 69 receptech, které se
 * v plánech objevují, takže se nečte. `prep_minutes_estimated` je vyplněný
 * u 62 z nich a je to odhad — UI to musí říct.
 *
 * @param {object} radek — řádek recipes_catalog
 * @returns {{kroky: string[], prepMinut: number|null}|null}
 */
export function postupZKatalogu(radek) {
  const kroky = pouzitelneKroky(radek?.instructions_cs);
  if (kroky.length === 0) return null;

  const minuty = Number(radek?.prep_minutes_estimated);
  return {
    kroky,
    prepMinut: Number.isFinite(minuty) && minuty > 0 ? Math.round(minuty) : null
  };
}

/**
 * Doplní postupy do jídel v plánech. Vrací počet obohacených jídel.
 *
 * Mění `plany` na místě — objekt jde rovnou do odpovědi /api/profile a kopie
 * celého `structured_plan_json` by byla zbytečná práce navíc.
 *
 * @param {Array<object>} plany
 * @param {Map<string, {kroky: string[], prepMinut: number|null}>} postupyPodleId
 * @returns {number}
 */
export function pridejPostupyDoPlanu(plany, postupyPodleId) {
  if (!Array.isArray(plany) || !(postupyPodleId instanceof Map)) return 0;

  let obohaceno = 0;
  for (const plan of plany) {
    for (const den of dnyPlanu(plan)) {
      for (const jidlo of jidlaDne(den)) {
        if (!jidlo || typeof jidlo !== 'object') continue;

        const postup = postupyPodleId.get(String(jidlo.catalog_id));
        if (!postup) continue;

        // `recipe` v plánu je, ale bez postupu. Když chybí úplně, založí se —
        // adaptér v UI čte postup právě odtud.
        if (!jidlo.recipe || typeof jidlo.recipe !== 'object') jidlo.recipe = {};
        jidlo.recipe.instructions_cs = postup.kroky;
        jidlo.recipe.prep_minutes = postup.prepMinut;
        obohaceno++;
      }
    }
  }

  return obohaceno;
}
