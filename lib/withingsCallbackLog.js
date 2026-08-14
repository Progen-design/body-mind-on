/**
 * Zápis výsledku Withings callbacku do DB.
 *
 * PROČ NE DO LOGU. 13. 8. 2026 skončil callback dvakrát na 302 a spojení
 * nevzniklo. Callback své chyby hlásí přes `console.error` — jenže z produkčních
 * runtime logů se nepodařilo vytáhnout jediný řádek z `console.*`, a to ani pro
 * endpointy, které prokazatelně logují při každém běhu. Příčina se tím nedala
 * určit: z `withings_oauth_states` šlo vyčíst jen to, že oba state řádky byly
 * spotřebované, takže pád nastal někde mezi výměnou kódu za token a uložením
 * spojení.
 *
 * Řádek v tabulce tenhle rozdíl pojmenuje (`stage`) a zároveň je zdrojem pro
 * hlídku `withings_callback_selhal` v `system_health_alerts`.
 */
import { supabaseServer } from './supabaseServer';

/**
 * @param {object} udalost
 * @param {string|null} [udalost.userId]
 * @param {'connected'|'connected_sync_pending'|'denied'|'error'|'bad_request'} udalost.status
 * @param {string|null} [udalost.stage]
 * @param {string|null} [udalost.errorMessage]
 */
export async function zaznamenejWithingsCallback({ userId = null, status, stage = null, errorMessage = null } = {}) {
  try {
    const { error } = await supabaseServer.from('withings_callback_events').insert({
      user_id: userId || null,
      status,
      stage,
      // Delší text nemá cenu držet: hlídka z něj stejně bere prvních 80 znaků
      // a celý stack sem nepatří.
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
    });
    if (error) {
      console.error('[withingsCallbackLog] zápis události selhal', {
        status,
        stage,
        error: error.message,
      });
    }
  } catch (e) {
    // Diagnostika NESMÍ shodit callback. Kdyby zápis házel, uživatel by kvůli
    // logování přišel o propojení, které se mezitím povedlo uložit.
    console.error('[withingsCallbackLog] výjimka při zápisu události', {
      status,
      stage,
      error: e?.message || String(e),
    });
  }
}
