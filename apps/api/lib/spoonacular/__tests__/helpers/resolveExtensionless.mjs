/**
 * Resolve hook pro `node --test`: doplní `.js` k bezpříponovým relativním importům.
 *
 * Zdrojové moduly píšou `import { supabaseServer } from '../supabaseServer'` — Next
 * si příponu domyslí, čisté ESM v Node ne. Bez tohohle hooku nejde `catalogImport.js`
 * v testu vůbec načíst, což je přesně důvod, proč mapper 43 běhů neměl test.
 *
 * Záměrně se nenačítá zjednodušená kopie mapperu: chyba, kterou to má hlídat
 * (chybějící `nutrientAmount` v importu), byla ve VAZBĚ modulu, ne v jeho logice.
 * Test proto musí projít reálným modulovým grafem včetně importů.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    const isRelative = /^\.{1,2}\//.test(specifier);
    const hasExtension = /\.[a-z]+$/i.test(specifier);
    if (isRelative && !hasExtension) {
      return next(`${specifier}.js`, context);
    }
    throw err;
  }
}
