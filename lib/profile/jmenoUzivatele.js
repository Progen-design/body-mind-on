/**
 * JEDNO JMÉNO, JEDEN ZDROJ, JEDEN TVAR.
 *
 * Na profilu se jméno objevovalo dvakrát a pokaždé jinak: hlavička brala první
 * slovo z registrace („Jan“), karta Tělesný vývoj celé `profile.user.name`
 * („Jan Příkopa“). Dva různé tvary téhož jména vedle sebe na jedné stránce
 * vypadají jako chyba v datech, i když data v pořádku jsou.
 *
 * POŘADÍ ZDROJŮ. Jméno z registrace vyhrává, protože ho člověk vyplnil sám
 * a je to jméno a příjmení. `user_metadata.name` bývá přezdívka z přihlášení
 * přes poskytovatele. E-mail je poslední záchrana, aby oslovení nebylo prázdné.
 */

/** Když nevíme nic, oslovíme neutrálně — ne prázdnem. */
export const NAHRADNI_JMENO = 'Sportovče';

/**
 * Nejstarší záznam z registrace. Tam je jméno, které člověk zadal při vstupu.
 * @param {object|null|undefined} profile
 * @returns {object|null}
 */
function zaznamZRegistrace(profile) {
  const metriky = Array.isArray(profile?.body_metrics) ? profile.body_metrics : [];
  if (!metriky.length) return null;
  return [...metriky].sort(
    (a, b) => String(a?.created_at || '').localeCompare(String(b?.created_at || '')),
  )[0] || null;
}

/**
 * Celé jméno uživatele.
 * @param {object|null|undefined} profile payload z /api/profile
 * @returns {string}
 */
export function celeJmeno(profile) {
  const zRegistrace = String(zaznamZRegistrace(profile)?.name || '').trim();
  if (zRegistrace) return zRegistrace;
  const zMetadat = String(profile?.user?.name || '').trim();
  if (zMetadat) return zMetadat;
  const email = String(profile?.user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return NAHRADNI_JMENO;
}

/**
 * Křestní jméno — tvar, kterým se na profilu oslovuje.
 *
 * Používá se všude, kde se jméno zobrazuje uživateli, aby se na jedné stránce
 * neobjevily dvě podoby téhož člověka.
 *
 * @param {object|null|undefined} profile
 * @returns {string}
 */
export function krestniJmeno(profile) {
  const cele = celeJmeno(profile);
  return cele.trim().split(/\s+/)[0] || cele || NAHRADNI_JMENO;
}
