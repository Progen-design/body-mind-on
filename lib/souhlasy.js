/**
 * ZAPIS SOUHLASU UZIVATELE — GDPR cl. 7 odst. 1 (spravce musi souhlas dolozit).
 *
 * Zapisuje se PRIPISOVACIM logem do `souhlasy_uzivatelu`, ne sloupcem
 * v profilu: odvolani souhlasu nesmi smazat dukaz, ze souhlas kdysi byl.
 *
 * UCINNOST_DOKUMENTU se posila s kazdym radkem, protoze bez ni po zmene
 * podminek nejde poznat, kdo souhlasil s cim.
 *
 * SELHANI ZAPISU NESMI SHODIT REGISTRACI. Ucet uz v tu chvili existuje
 * a shozeni requestu by uzivateli vzalo plan kvuli auditni tabulce. Chyba
 * se loguje, at je videt v Vercel logu.
 */
import { supabaseServer } from './supabaseServer.js';

/** Musi souhlasit s `PROVOZOVATEL.ucinnostOd` v bodyandmindon-web/lib/legal.ts. */
export const UCINNOST_PRAVNICH_TEXTU = '2026-09-01';

export const DRUHY_SOUHLASU = Object.freeze([
  'obchodni_podminky',
  'zdravotni_udaje',
]);

/**
 * @param {string} userId
 * @param {{ druhy?: string[], zdroj?: string, client?: object }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function zapisSouhlasy(userId, opts = {}) {
  const { druhy = DRUHY_SOUHLASU, zdroj = 'registrace', client = supabaseServer } = opts;

  if (!userId) return { ok: false, error: 'chybi user_id' };

  const radky = druhy
    .filter((d) => DRUHY_SOUHLASU.includes(d))
    .map((druh) => ({
      user_id: userId,
      druh,
      ucinnost_dokumentu: UCINNOST_PRAVNICH_TEXTU,
      zdroj,
    }));

  if (!radky.length) return { ok: false, error: 'zadny platny druh souhlasu' };

  const { error } = await client.from('souhlasy_uzivatelu').insert(radky);
  if (error) {
    console.error('[souhlasy] zapis selhal', { user_id: userId, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
