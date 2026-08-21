/**
 * PROGRAM UŽIVATELE — jediné místo, kde se rozhoduje, který program má.
 *
 * PROČ TENHLE MODUL EXISTUJE
 * Program se čte na dvou místech a každé si ho odvozovalo samo:
 * `api/profile.js` bralo `memberships.tier > body_metrics.program > START`,
 * plánovací pipeline neměla `memberships` po ruce vůbec. Jakmile se podle
 * programu začne větvit TRÉNINKOVÁ LOGIKA (START = opakovaný full-body
 * s progresí, ON_CLUB/VIP = dosavadní rotace), rozdíl mezi těmi dvěma odvozeními
 * přestane být kosmetický: uživatel by v profilu viděl jeden program a v plánu
 * dostal jiný.
 *
 * Je to dvanáctý výskyt vzorce „dvě místa nad stejnými daty“ v tomhle repu.
 * Rozdíl je, že tentokrát je to místo jedno a hlídá ho test.
 */

/** @type {readonly string[]} */
export const PROGRAM_TIERS = Object.freeze(['START', 'ON_CLUB', 'VIP']);

/**
 * @param {unknown} raw
 * @returns {string|null} normalizovaný tier, nebo null když to není známý program
 */
function normalizeTier(raw) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (!t) return null;
  return PROGRAM_TIERS.includes(t) ? t : null;
}

/**
 * Program uživatele.
 *
 * PRIORITA: `memberships.tier` > `body_metrics.program` > `'START'`.
 * Členství je autoritativní, protože se mění platbou; `body_metrics.program`
 * je jen to, co uživatel vyplnil při registraci.
 *
 * `'START'` jako výchozí hodnota je záměr: neznámý program se má chovat jako
 * ten nejopatrnější, ne jako placený.
 *
 * @param {object|null|undefined} bodyMetrics
 * @param {{ tier?: string|null }|null} [membership]
 * @returns {'START'|'ON_CLUB'|'VIP'}
 */
export function resolveProgramTier(bodyMetrics, membership = null) {
  // `_program_tier` si na body_metrics připíná pipeline, když si členství už
  // načetla — aby se pro jeden plán nečetla tabulka dvakrát.
  return normalizeTier(membership?.tier)
    ?? normalizeTier(bodyMetrics?._program_tier)
    ?? normalizeTier(bodyMetrics?.program)
    ?? 'START';
}

/**
 * Má tenhle uživatel dostat opakovaný full-body program s progresí?
 *
 * Jen START. Pokročilé programy zůstávají na rotujících šablonách
 * a `scaleAndDiversifyWorkoutPlan` — ta se nemaže, jen se pro START nepoužije.
 *
 * @param {object|null|undefined} bodyMetrics
 * @param {{ tier?: string|null }|null} [membership]
 * @returns {boolean}
 */
export function usesStartStrengthProgram(bodyMetrics, membership = null) {
  return resolveProgramTier(bodyMetrics, membership) === 'START';
}
