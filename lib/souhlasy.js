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
import { DRUHY_SOUHLASU, UCINNOST_PRAVNICH_TEXTU } from './souhlasyKonstanty.js';

// Re-export, at serverovy kod muze dal importovat z jednoho mista. Samotne
// hodnoty zijou v lib/souhlasyKonstanty.js, ktery nic neimportuje — registracni
// formular si je bere odtamtud, aby se supabaseServer nedostal do klientskeho
// bundlu. Viz komentar v tom souboru.
export { DRUHY_SOUHLASU, UCINNOST_PRAVNICH_TEXTU };

/**
 * @param {string} userId
 * @param {{ druhy?: string[], zdroj?: string, client?: object }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function zapisSouhlasy(userId, opts = {}) {
  // `druhy` NEMÁ výchozí hodnotu na celý DRUHY_SOUHLASU záměrně — volající musí
  // poslat, co uživatel doopravdy odsouhlasil. Do 14. 9. 2026 tu byl fallback
  // na celý seznam, takže api/body-metrics.js volalo zapisSouhlasy() bez
  // `druhy` a zapsalo se „souhlasil se vším“ i tehdy, když request žádný
  // příznak souhlasu vůbec nenesl (smoke test to prokázal: holý POST bez
  // zaškrtnutí založil oba řádky). Bez platného druhu funkce vrací chybu,
  // ne že si nějaký sama domyslí.
  const { druhy = [], zdroj = 'registrace', client = supabaseServer } = opts;

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
