import { z } from 'zod';

/**
 * Boolean z HTTP parametru.
 *
 * PROČ TOHLE EXISTUJE: z.coerce.boolean() volá Boolean(hodnota). Z query
 * stringu přijde vždycky řetězec, a "false" je neprázdný řetězec, tedy true.
 * Konkrétně to znamenalo, že
 *   ?dry_run=false  spustil dry run místo ostrého běhu,
 *   ?approve=false  recept SCHVÁLIL místo zamítnutí.
 * V JSON těle to fungovalo správně, takže se to dalo přehlédnout hodně dlouho.
 *
 * Bere jen explicitní pravdivé hodnoty. Cokoli jiného je false — u parametru,
 * který spouští placenou operaci nebo schvaluje obsah, je tohle správná
 * strana, na kterou se mýlit.
 *
 * @param {boolean} [vychozi] hodnota při chybějícím parametru
 */
export function booleanParam(vychozi = false) {
  return z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === '') return vychozi;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      return ['1', 'true', 'yes', 'ano', 'on'].includes(String(v).trim().toLowerCase());
    });
}

/** Povinná varianta — chybějící parametr je chyba, ne tiché false. */
export function booleanParamRequired() {
  return z
    .union([z.boolean(), z.string(), z.number()])
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      return ['1', 'true', 'yes', 'ano', 'on'].includes(String(v).trim().toLowerCase());
    });
}
