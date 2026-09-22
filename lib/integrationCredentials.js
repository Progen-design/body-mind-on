// /lib/integrationCredentials.js
/**
 * OAUTH PŘIHLAŠOVACÍ ÚDAJE INTEGRACÍ — uložené v DB, ne jen v env.
 *
 * PROČ. Client ID a Secret aplikace registrované u Withings se do 22. 9. 2026
 * daly zadat jedině jako env proměnné ve Vercelu. Každá další integrace tedy
 * znamenala cestu do cizího dashboardu a redeploy. Admin stránka
 * (`/admin/integrace`) je zapisuje sem a `getWithingsConfig()` je odsud čte.
 *
 * ŠIFROVANÉ, NE V PLAINTEXTU. Secret je tajemství stejného řádu jako OAuth
 * token uživatele, takže jde do DB přes `secretBox.js` — týž AES-256-GCM
 * a týž kořenový klíč z env. Kdo se dostane k obsahu tabulky bez klíče,
 * nedostane nic použitelného.
 *
 * TOHLE NEJSOU ÚDAJE UŽIVATELE. Uživatel nikdy žádné klientské údaje
 * nezadává — klikne „Připojit Withings" a jde přes OAuth. Tabulka drží
 * identitu NAŠÍ aplikace vůči poskytovateli, jednu pro všechny.
 */
import { supabaseServer } from './supabaseServer.js';
import { encryptSecret, decryptSecret } from './secretBox.js';

/** Klíč Withings integrace v `integration_credentials`. */
export const INTEGRACE_WITHINGS = 'withings';

/**
 * Posledních šest znaků, zbytek tečkami.
 *
 * Client ID není tajemství (chodí v URL autorizace), ale celé ho vypisovat
 * netřeba — adminovi stačí poznat, že uložená hodnota je ta jeho.
 * Krátkou hodnotu nemaskujeme na nic, jen řekneme, že je nastavená:
 * u čtyřznakového řetězce by „posledních šest" bylo celé tajemství.
 *
 * @param {string|null|undefined} hodnota
 * @returns {string|null}
 */
export function maskaKonce(hodnota) {
  const raw = String(hodnota || '').trim();
  if (!raw) return null;
  if (raw.length <= 6) return 'nastaveno';
  return `••••${raw.slice(-6)}`;
}

/**
 * KDO VYHRÁVÁ: DATABÁZE, POTOM ENV.
 *
 * Čistá funkce schválně — pořadí zdrojů je to jediné, co se na celém
 * fallbacku dá splést, a takhle jde otestovat bez Supabase i bez env.
 * Používá ji `resolveWithingsCredentials()` v `withingsServer.js`
 * i admin endpoint, aby si každý nepočítal „odkud se to bere" po svém.
 *
 * `zdroj: null` znamená, že integrace není nakonfigurovaná nikde — ne že
 * se sáhlo po env. Neúplný pár (jen ID, secret chybí) se bere jako nic:
 * půlka údajů OAuth nespustí.
 *
 * @param {{clientId?: string, clientSecret?: string}|null} zDb
 * @param {{clientId?: string, clientSecret?: string}|null} zEnv
 * @returns {{clientId: string, clientSecret: string, zdroj: 'db'|'env'|null}}
 */
export function vyberKlientskeUdaje(zDb, zEnv) {
  const dbId = String(zDb?.clientId || '').trim();
  const dbSecret = String(zDb?.clientSecret || '').trim();
  if (dbId && dbSecret) return { clientId: dbId, clientSecret: dbSecret, zdroj: 'db' };

  const envId = String(zEnv?.clientId || '').trim();
  const envSecret = String(zEnv?.clientSecret || '').trim();
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret, zdroj: 'env' };

  return { clientId: '', clientSecret: '', zdroj: null };
}

/**
 * Načte a rozšifruje údaje integrace.
 *
 * Vrací `null`, když řádek neexistuje NEBO když se ho nepodařilo přečíst —
 * volající pak spadne na env proměnné. Výpadek databáze tedy integraci
 * neshodí, jen ji vrátí do stavu před touhle stránkou.
 *
 * @param {string} integrationKey
 * @returns {Promise<{clientId: string, clientSecret: string, updatedAt: string|null, updatedBy: string|null}|null>}
 */
export async function nactiUdajeIntegrace(integrationKey = INTEGRACE_WITHINGS) {
  try {
    const { data, error } = await supabaseServer
      .from('integration_credentials')
      .select('client_id_encrypted, client_secret_encrypted, updated_at, updated_by')
      .eq('integration_key', integrationKey)
      .maybeSingle();

    if (error) throw error;
    if (!data?.client_id_encrypted || !data?.client_secret_encrypted) return null;

    const clientId = String(decryptSecret(data.client_id_encrypted) || '').trim();
    const clientSecret = String(decryptSecret(data.client_secret_encrypted) || '').trim();
    if (!clientId || !clientSecret) return null;

    return {
      clientId,
      clientSecret,
      updatedAt: data.updated_at || null,
      updatedBy: data.updated_by || null,
    };
  } catch (err) {
    // Rozšifrovat nejde typicky po záměně kořenového klíče. Fallback na env
    // je lepší než pád celé integrace, ale musí být vidět v logu.
    console.error('[integrationCredentials] nelze přečíst údaje', integrationKey, err?.message || err);
    return null;
  }
}

/**
 * Uloží (upsert) údaje integrace zašifrované.
 *
 * @param {string} integrationKey
 * @param {{ clientId: string, clientSecret: string, updatedBy?: string }} udaje
 */
export async function ulozUdajeIntegrace(integrationKey, { clientId, clientSecret, updatedBy = 'admin' }) {
  const id = String(clientId || '').trim();
  const secret = String(clientSecret || '').trim();
  if (!id || !secret) {
    const err = new Error('Client ID i Client Secret musí být vyplněné.');
    err.statusCode = 400;
    throw err;
  }

  const { error } = await supabaseServer
    .from('integration_credentials')
    .upsert(
      {
        integration_key: integrationKey,
        client_id_encrypted: encryptSecret(id),
        client_secret_encrypted: encryptSecret(secret),
        updated_at: new Date().toISOString(),
        updated_by: String(updatedBy || 'admin'),
      },
      { onConflict: 'integration_key' },
    );

  if (error) throw error;
  return { ok: true };
}
