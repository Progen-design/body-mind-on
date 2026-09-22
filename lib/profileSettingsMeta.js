/**
 * Cílová váha v `PATCH /api/profile-settings` — tři různé významy.
 *
 * Do 22. 9. 2026 znamenalo `goal_weight_kg: null` (i chybějící klíč) totéž:
 * „neměnit". Kdo vymazal pole v Nastavení a uložil, přišel o nic — vlastní
 * cíl zůstal a hero dál ukazoval starou hodnotu místo automatické.
 *
 *   klíč chybí                → 'nic'     (neměnit)
 *   `null` nebo prázdný text  → 'smazat'  (vlastní cíl pryč, počítá se automaticky)
 *   číslo                     → 'nastavit'
 *
 * @param {Record<string, unknown>} body
 * @returns {{ akce: 'nic'|'smazat'|'nastavit', kg: number|null }}
 */
export function urciCilovouVahu(body) {
  const b = body || {};
  if (!Object.prototype.hasOwnProperty.call(b, 'goal_weight_kg')) return { akce: 'nic', kg: null };
  const hodnota = b.goal_weight_kg;
  if (hodnota === null || (typeof hodnota === 'string' && hodnota.trim() === '')) {
    return { akce: 'smazat', kg: null };
  }
  return { akce: 'nastavit', kg: Number(hodnota) };
}

/**
 * Poskládá nová `user_metadata` z těch stávajících. Smazaná cílová váha se
 * zapíše jako `null` — `api/profile.js` čte `meta.goal_weight_kg != null`, takže
 * `null` znamená „není zadaná". Nulou se neplýtvá zápisem, když tam nic nebylo.
 *
 * @param {Record<string, unknown>} currentMeta
 * @param {{ startWeightKg: number|null, cil: { akce: string, kg: number|null } }} zmeny
 * @returns {Record<string, unknown>}
 */
export function slozMetadataVahy(currentMeta, { startWeightKg, cil }) {
  const nextMeta = { ...(currentMeta || {}) };
  if (startWeightKg != null) nextMeta.start_weight_kg = startWeightKg;
  if (cil.akce === 'nastavit' && cil.kg != null) nextMeta.goal_weight_kg = cil.kg;
  if (cil.akce === 'smazat' && nextMeta.goal_weight_kg != null) nextMeta.goal_weight_kg = null;
  return nextMeta;
}
