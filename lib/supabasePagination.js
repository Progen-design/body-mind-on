/**
 * SDÍLENÉ STRÁNKOVÁNÍ SUPABASE/POSTGREST — jedno místo, ne kopie v každém
 * skriptu, co potřebuje přečíst celou tabulku.
 *
 * PostgREST mlčky ořízne neomezenou odpověď na 1000 řádků. Naměřeno
 * 9. 9. 2026: `scripts/doplneni-postupu-receptu.mjs` kvůli tomu zpracoval
 * jen 1000 z 1114 receptů a výstup to nijak neřekl — `recepty_celkem: 1000`
 * vypadalo jako úplné číslo, ne jako useknutá odpověď. Stejný vzor se našel
 * ještě na dvou místech (`scripts/report-beta-activation.mjs` nad
 * `product_events`, `api/trainer/clients.js` nad `body_metrics`) — odsud
 * proto oprava, ne z každého místa zvlášť.
 *
 * `nactiVsechnyRadky()` stránkuje přes `.range()`, dokud stránka nepřijde
 * kratší než plná velikost, a po dočtení porovná výsledek s nezávislým
 * `count(*)` NAD STEJNÝM FILTREM. Nesoulad HODÍ CHYBU — stejná zásada jako
 * `zkontrolujKonzistenciSurovin()` v `lib/plan/kvalitaPostupu.js`: radši
 * hlasitý pád, který běh zastaví, než tiché pokračování s neúplnými daty.
 */

/** Kolik řádků PostgREST/Supabase vrátí na jeden dotaz nejvýš — nad tím se musí stránkovat. */
export const VELIKOST_STRANKY_SUPABASE = 1000;

/**
 * @param {{
 *   client: any,
 *   tabulka: string,
 *   sloupce: string,
 *   poradi?: { sloupec: string, ascending?: boolean } | null,
 *   filtr?: (dotaz: any) => any,
 *   velikostStranky?: number,
 * }} vstup
 *   `filtr` dostane rozestavěný dotaz (po `.select()`, před `.range()`) a musí
 *   vrátit dotaz zpátky — sem patří `.eq()`, `.gte()`, `.not()` apod. Stejná
 *   funkce se volá jednou pro `count(*)` a jednou pro každou stránku dat,
 *   takže filtr platí na obojí stejně.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function nactiVsechnyRadky({
  client,
  tabulka,
  sloupce,
  poradi = null,
  filtr = (dotaz) => dotaz,
  velikostStranky = VELIKOST_STRANKY_SUPABASE,
}) {
  let dotazPoctu = client.from(tabulka).select('*', { count: 'exact', head: true });
  dotazPoctu = filtr(dotazPoctu);
  const { count, error: chybaPoctu } = await dotazPoctu;
  if (chybaPoctu) throw new Error(`${tabulka} count(*): ${chybaPoctu.message}`);

  /** @type {Array<Record<string, unknown>>} */
  const vsechny = [];
  let od = 0;
  for (;;) {
    let dotaz = client.from(tabulka).select(sloupce);
    dotaz = filtr(dotaz);
    if (poradi) dotaz = dotaz.order(poradi.sloupec, { ascending: poradi.ascending !== false });
    dotaz = dotaz.range(od, od + velikostStranky - 1);

    const { data, error } = await dotaz;
    if (error) throw new Error(`${tabulka}: ${error.message}`);
    const radky = data || [];
    vsechny.push(...radky);
    if (radky.length < velikostStranky) break;
    od += velikostStranky;
  }

  if (count != null && vsechny.length !== count) {
    throw new Error(
      `nactiVsechnyRadky(${tabulka}): nesoulad počtu — count(*) říká ${count}, stránkováním se načetlo ${vsechny.length}. `
      + 'Běh se zastavuje, ne aby pokračoval s neúplnými (nebo zdvojenými) daty.'
    );
  }

  return vsechny;
}
