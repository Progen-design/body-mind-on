/**
 * Rozlišení chyb běhu generátoru receptů.
 *
 * Vlastní modul schválně: `recipeGeneratorRun.js` si při importu táhne Supabase
 * klienta i OpenAI, takže tyhle dvě čisté funkce by se jinak nedaly otestovat
 * bez databáze a klíče.
 */

/**
 * CHYBA INFRASTRUKTURY, NEBO ŠPATNÁ OBJEDNÁVKA?
 *
 * Rozdíl je zásadní. Když model vrátí recept se zakázanou surovinou nebo mimo
 * kalorické pásmo, je vadná OBJEDNÁVKA a `failed` je správně. Když ale volání
 * modelu vůbec neprojde — vyčerpaný kredit, neplatný klíč, výpadek — položka
 * fronty je v pořádku a jen se nedalo pracovat. Označit ji `failed` znamená
 * vyhodit poptávku, kterou by příští běh bez problému splnil.
 *
 * Změřeno 17. 8. 2026: OpenAI vrátil `429 credit_balance_exhausted` a fronta
 * si tím naskládala 70 položek ve stavu `failed`. Ani jedna nebyla vadná.
 *
 * @param {any} err
 * @returns {boolean}
 */
export function jeInfrastrukturniChyba(err) {
  if (!err) return false;
  const status = Number(err.status ?? err.statusCode ?? 0);
  if (status === 401 || status === 403 || status === 429) return true;
  if (status >= 500) return true;
  const text = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase();
  return /insufficient_quota|credit_balance_exhausted|rate.?limit|econnreset|etimedout|timeout|socket hang up|fetch failed/.test(text);
}

/**
 * Text do `posledni_chyba`. Prázdný řetězec nikdy — sloupec je jediné místo,
 * kde se po běhu dá zjistit proč se nic nezapsalo, a „nic nezapsáno“ o příčině
 * neříká nic. Tak zmizela informace o vyčerpaném kreditu na dva dny.
 *
 * @param {any} err výjimka z volání modelu, nebo null
 * @param {string[]} nedohledane suroviny/pásma, na kterých recepty padly
 * @returns {string}
 */
export function popisChybyBehu(err, nedohledane) {
  if (err) {
    const kod = err.code ?? err.status ?? err.statusCode ?? '';
    return `volání modelu selhalo: ${kod ? `[${kod}] ` : ''}${String(err.message ?? err).slice(0, 300)}`;
  }
  const seznam = (nedohledane || []).filter(Boolean);
  if (seznam.length) return seznam.join(', ').slice(0, 300);
  return 'model vrátil dávku, ale žádný recept neprošel validací';
}
