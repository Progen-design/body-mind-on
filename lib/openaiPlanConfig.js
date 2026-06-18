/**
 * Killswitch a podmínky pro volitelný OpenAI enhancement plánu (Varianta B).
 * OPENAI_PLAN_ENABLED default false — primární cesta je deterministický katalog.
 */

/**
 * @returns {boolean}
 */
export function isOpenAiPlanEnabled() {
  const v = String(process.env.OPENAI_PLAN_ENABLED ?? 'false').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Sync skeleton GPT jen při explicitním useOpenAI:true a killswitch ON (admin / legacy).
 * @param {boolean|undefined} inputUseOpenAI
 * @returns {boolean}
 */
export function resolveSyncOpenAiForPipeline(inputUseOpenAI) {
  return inputUseOpenAI === true && isOpenAiPlanEnabled() && !!process.env.OPENAI_API_KEY;
}

/**
 * Async enhancement po doručení plánu: killswitch + API key + neprázdná coach memory.
 * @param {object|null|undefined} bodyMetrics
 * @returns {boolean}
 */
export function shouldRunAsyncPlanEnhancement(bodyMetrics) {
  if (!isOpenAiPlanEnabled()) return false;
  if (!process.env.OPENAI_API_KEY) return false;
  const mem = bodyMetrics?._coach_memory_summary;
  return typeof mem === 'string' && mem.trim().length > 0;
}

/**
 * ISO týden (pondělí) pro seed katalogu — reprodukovatelné per uživatel/týden.
 * @param {string|null|undefined} validFromIso YYYY-MM-DD
 * @returns {string}
 */
export function catalogWeekKeyFromValidFrom(validFromIso) {
  const iso = String(validFromIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'week-0';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'week-0';
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string|null|undefined} userId
 * @param {string|null|undefined} validFromIso
 * @returns {number}
 */
export function catalogPickSeed(userId, validFromIso) {
  const week = catalogWeekKeyFromValidFrom(validFromIso);
  const s = `${userId || 'anon'}:${week}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
