/**
 * ADRESA, KAM iPHONE POSÍLÁ DATA Z HODINEK.
 *
 * Uživatel ji musí opsat do aplikace Health Auto Export — server si data
 * z Apple Health vyžádat neumí, HealthKit se čte jen z telefonu. Adresa se
 * proto počítá na serveru a posílá do UI spolu s klíčem, aby ji nikdo
 * nemusel skládat ručně a aby se nezkopírovala do frontendu natvrdo:
 * projekt Supabase se může změnit a dvě verze adresy by se rozešly.
 */

/** Edge funkce, která payload z Health Auto Export přijímá. */
export const NAZEV_INGEST_FUNKCE = 'apple-health-ingest';

/**
 * @returns {string} plná URL edge funkce, nebo prázdný řetězec, když adresa
 *   projektu není v prostředí — volající pak URL prostě nezobrazí, místo
 *   aby uživateli nabídl rozbitý odkaz.
 */
export function adresaProIngest() {
  const zaklad = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  ).trim();
  if (!zaklad) return '';
  return `${zaklad.replace(/\/+$/, '')}/functions/v1/${NAZEV_INGEST_FUNKCE}`;
}
