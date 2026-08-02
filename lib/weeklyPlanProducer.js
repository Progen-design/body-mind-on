/**
 * Producent týdenních úloh: zakládá `weekly_plan_update` do ai_tasks.
 *
 * Nahrazuje zamrzlé generateAITasks(). Ta byla zamrzlá od 2. 6. 2026, kdy smyčka
 * missing_plan + 5min cron spálila 7 405 Spoonacular volání s nulovou úspěšností.
 * Rozdíl proti ní:
 *
 *   1. Idempotence je v DB, ne v kódu — UNIQUE(idempotency_key) plus CHECK, že
 *      weekly task bez klíče nevznikne, plus UNIQUE(user_id, target_from).
 *      Žádná kombinace souběhu, retry ani dvojího cronu duplicitu nevyrobí.
 *   2. Běží jednou denně, ne každých 5 minut.
 *   3. Cílený dotaz na plány před koncem platnosti, ne scan všech uživatelů.
 *
 * Producent jen ZAKLÁDÁ úlohy. Negeneruje — to dělá scheduler přes
 * executeTrainerTask, se všemi existujícími brzdami (retry, DLQ, rozpočet,
 * membership gate v okamžiku běhu).
 */
import { supabaseServer } from './supabaseServer';
import { canRenewPlanForMembership } from './planGenerationGate';
import { calendarDateIsoInPrague, addCalendarDaysIsoPrague } from './czechCalendar';

/**
 * Kolik úloh smí vzniknout na jeden běh.
 *
 * Strop není o ceně generování — plán se skládá deterministicky z katalogu
 * (useOpenAI false) a SPOONACULAR_MODE je default `off`, takže runtime generátor
 * externí API nevolá. Strop je o PROPUSTNOSTI: scheduler má MAX_TASKS_PER_RUN
 * natvrdo 1 (větší hodnota z env se ignoruje) a běží zhruba jednou za hodinu,
 * takže vyprázdní ~24 úloh denně — a o tu kapacitu se dělí i coach úlohy, které
 * runAIScheduler bere ze stejné fronty.
 *
 * 20 je tedy o něco míň, než co se stihne za den zpracovat. Založit víc by jen
 * stavělo frontu, kterou by druhý den producent doplnil znovu, a čekání na plán
 * by rostlo. Až se propustnost scheduleru zvedne, může se zvednout i tohle.
 */
export const WEEKLY_PRODUCER_MAX_PER_RUN = (() => {
  const n = Number.parseInt(process.env.WEEKLY_PRODUCER_MAX_PER_RUN || '20', 10);
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(n, 100);
})();

/** Kolik dní před koncem platnosti se úloha zakládá. */
export const WEEKLY_PRODUCER_LEAD_DAYS = 1;

/** @returns {boolean} vypnuto přes env, bez deploye */
export function isWeeklyProducerEnabled() {
  return String(process.env.WEEKLY_PRODUCER_ENABLED || 'true').toLowerCase() !== 'false';
}

/**
 * Datum se počítá v pražském kalendáři, ne v UTC. Plán je kalendářní záležitost
 * a `valid_until` i `valid_from` zapisuje zbytek pipeline přes tytéž helpery —
 * kdyby producent počítal v UTC, lišil by se mu cílový den o jeden vždycky, když
 * cron běží po půlnoci UTC, ale v Praze je pořád předchozí den.
 *
 * @param {Date} [now]
 * @returns {string} dnešek jako YYYY-MM-DD
 */
export function todayIso(now = new Date()) {
  return calendarDateIsoInPrague(now);
}

/**
 * @param {string} iso YYYY-MM-DD
 * @param {number} dnu
 * @returns {string}
 */
export function addDaysIso(iso, dnu) {
  return addCalendarDaysIsoPrague(iso, dnu);
}

/**
 * Cílový týden: max(valid_until + 1, dnešek).
 *
 * Plán platí včetně posledního dne, takže nový navazuje až dalším dnem. `max`
 * s dneškem je doběhové pravidlo: komu plán propadl před týdnem, dostane plán OD
 * DNEŠKA. Zmeškané týdny se zpětně nedogenerovávají — jídelníček na minulý úterý
 * nemá komu pomoct a stálo by to stejně jako ten dnešní.
 *
 * @param {string|null|undefined} validUntil YYYY-MM-DD posledního aktivního plánu
 * @param {string} dnes YYYY-MM-DD
 * @returns {string} YYYY-MM-DD prvního dne nového plánu
 */
export function computeTargetFrom(validUntil, dnes) {
  if (!validUntil) return dnes;
  const nasledujici = addDaysIso(String(validUntil).split('T')[0], 1);
  return nasledujici > dnes ? nasledujici : dnes;
}

/**
 * @param {string} userId
 * @param {string} targetFrom
 * @returns {string}
 */
export function buildWeeklyIdempotencyKey(userId, targetFrom) {
  return `weekly:${userId}:${targetFrom}`;
}

/**
 * Kdo má dostat nový týdenní plán.
 *
 * Dvě cesty, obě jen pro členství, které projde bránou:
 *   a) aktivnímu plánu zbývá ≤ WEEKLY_PRODUCER_LEAD_DAYS dní platnosti
 *   b) aktivní plán nemá vůbec (doběh po deactivate_expired_plans)
 *
 * @param {{ now?: Date, client?: typeof supabaseServer }} [opts]
 * @returns {Promise<Array<{ user_id: string, tier: string, target_from: string, reason: string, valid_until: string|null }>>}
 */
export async function findWeeklyPlanCandidates(opts = {}) {
  const client = opts.client || supabaseServer;
  const dnes = todayIso(opts.now);
  const hranice = addDaysIso(dnes, WEEKLY_PRODUCER_LEAD_DAYS);

  const { data: clenstvi, error: chybaClenstvi } = await client
    .from('memberships')
    .select('user_id, tier, status, trial_ends_at');
  if (chybaClenstvi) throw new Error(`memberships: ${chybaClenstvi.message}`);

  // Brána je jediný zdroj pravdy o tom, komu plán vzniknout smí — stejná funkce
  // rozhoduje i v UI (stav „plán skončil“) a při běhu úlohy ve scheduleru.
  const opravneni = (clenstvi || []).filter((m) => canRenewPlanForMembership(m).allowed);
  if (!opravneni.length) return [];

  const ids = opravneni.map((m) => m.user_id).filter(Boolean);
  const { data: plany, error: chybaPlanu } = await client
    .from('ai_generated_plans')
    .select('user_id, valid_until')
    .in('user_id', ids)
    .eq('is_active', true);
  if (chybaPlanu) throw new Error(`ai_generated_plans: ${chybaPlanu.message}`);

  /** @type {Map<string, string|null>} nejzazší platnost aktivního plánu */
  const platnostDo = new Map();
  for (const p of plany || []) {
    const stav = platnostDo.get(p.user_id);
    const nova = p.valid_until ? String(p.valid_until).split('T')[0] : null;
    if (stav === undefined || (nova && (!stav || nova > stav))) platnostDo.set(p.user_id, nova);
  }

  const kandidati = [];
  for (const m of opravneni) {
    const maAktivniPlan = platnostDo.has(m.user_id);
    const validUntil = platnostDo.get(m.user_id) ?? null;

    let reason;
    if (!maAktivniPlan) {
      reason = 'no_active_plan';
    } else if (validUntil && validUntil <= hranice) {
      reason = 'expiring_soon';
    } else {
      continue;
    }

    kandidati.push({
      user_id: m.user_id,
      tier: String(m.tier || ''),
      target_from: computeTargetFrom(validUntil, dnes),
      valid_until: validUntil,
      reason,
    });
  }

  // Stabilní pořadí: kdo čeká déle, jde první. Při zastropovaném běhu tím
  // nezůstane nikdo viset donekonečna kvůli náhodnému pořadí z databáze.
  kandidati.sort((a, b) => String(a.valid_until || '').localeCompare(String(b.valid_until || ''))
    || a.user_id.localeCompare(b.user_id));

  return kandidati;
}

/**
 * @param {{ dryRun?: boolean, now?: Date, client?: typeof supabaseServer }} [opts]
 */
export async function runWeeklyPlanProducer(opts = {}) {
  const client = opts.client || supabaseServer;
  const dryRun = opts.dryRun === true;

  if (!isWeeklyProducerEnabled()) {
    return { skipped: true, reason: 'disabled', created: 0, duplicates: 0, candidates: [] };
  }

  const vsichni = await findWeeklyPlanCandidates(opts);
  const kandidati = vsichni.slice(0, WEEKLY_PRODUCER_MAX_PER_RUN);
  const odlozeno = vsichni.length - kandidati.length;

  if (dryRun) {
    return {
      dry_run: true,
      created: 0,
      duplicates: 0,
      candidates: kandidati,
      candidates_total: vsichni.length,
      deferred_over_limit: odlozeno,
      max_per_run: WEEKLY_PRODUCER_MAX_PER_RUN,
    };
  }

  let created = 0;
  let duplicates = 0;
  const errors = [];

  for (const k of kandidati) {
    const idempotencyKey = buildWeeklyIdempotencyKey(k.user_id, k.target_from);
    const { error } = await client.from('ai_tasks').insert({
      user_id: k.user_id,
      agent_slug: 'trainer',
      task_type: 'weekly_plan_update',
      idempotency_key: idempotencyKey,
      status: 'pending',
      attempts: 0,
      next_retry_at: null,
      last_error: null,
      payload: {
        prompt: 'Vygeneruj navazujici tydenni plan podle aktualniho kontextu uzivatele.',
        target_from: k.target_from,
        reason: k.reason,
      },
    });

    if (!error) { created += 1; continue; }

    // Duplicita je NORMÁLNÍ výsledek, ne porucha: druhý běh cronu ve stejný den,
    // souběh, retry po timeoutu. Právě proto je pravidlo v databázi.
    if (/duplicate key|unique constraint|ai_tasks_weekly_unique_target|idx_ai_tasks_idempotency/i.test(error.message || '')) {
      duplicates += 1;
      continue;
    }
    errors.push(`${k.user_id}: ${error.message}`);
  }

  return {
    dry_run: false,
    created,
    duplicates,
    errors,
    candidates_total: vsichni.length,
    deferred_over_limit: odlozeno,
    max_per_run: WEEKLY_PRODUCER_MAX_PER_RUN,
  };
}
