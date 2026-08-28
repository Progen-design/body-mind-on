/**
 * ZAMČENÝ TÝDEN — co uživatel dostane, když zaplatí.
 *
 * PROČ. Trialu skončí plán (dvěma ze tří den před koncem trialu) a v aplikaci
 * mu zůstane svítit propadlý týden bez označení. Nula ze tří konvertovala.
 * Aby se dalo koupit, musí být vidět KONKRÉTNÍ jídla, ne slib.
 *
 * BRÁNA SE NEOBCHÁZÍ. `canRunPlanTask()` dál pustí trialu jen `initial_plan`
 * a tenhle modul o ni nezavadí — nezakládá `ai_tasks`, takže se do scheduleru
 * vůbec nedostane. Je to cesta VEDLE, ne díra v té stávající.
 *
 * NEDEAKTIVUJE STÁVAJÍCÍ PLÁN. `persistTrainerPlan()` v taskExecutors.js před
 * vložením vypne všechny aktivní plány uživatele — což je u výměny týdne
 * správně, ale tady by to sebralo člověku týden, který právě používá. Proto
 * má tenhle modul vlastní zápis: `is_active = false`, `locked = true`.
 *
 * CENA. Plán se skládá z katalogu deterministicky (`OPENAI_PLAN_ENABLED` je
 * false), takže týden navíc nestojí za recepty nic.
 */
import { supabaseServer } from './supabaseServer.js';
import { canRenewPlanForMembership } from './planRenewalRules.js';
import { runUnifiedPlanPipeline } from './unifiedPlanPipeline.js';

/**
 * Kolik dní před koncem plánu se ukázka připraví.
 *
 * Tři dny: dost na to, aby ji člověk viděl dřív, než mu plán dojde, a zároveň
 * ne tak brzo, aby si ji vygeneroval každý, kdo se jednou zaregistroval.
 */
export const ZAMCENY_PLAN_LEAD_DNI = 3;

/** `YYYY-MM-DD` z data. */
function den(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function poDnech(iso, dni) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return den(d);
}

/**
 * Komu se má ukázka připravit.
 *
 * Podmínky, všechny musí platit:
 *   1. členství NEDOVOLUJE obnovu (jinak dostane opravdový plán běžnou cestou),
 *   2. důvod je trial — ne nezaplacená ani zrušená platba; tomu, kdo dluží,
 *      se ukázka negeneruje, protože u něj nejde o rozhodnutí, ale o dluh,
 *   3. má aspoň jeden plán (tedy prošel registrací),
 *   4. jeho poslední plán končí do tří dnů nebo už skončil,
 *   5. ukázku na to období ještě nemá.
 *
 * @returns {Promise<Array<{user_id: string, od: string, do: string}>>}
 */
export async function najdiKandidatyNaUkazku(opts = {}) {
  const client = opts.client || supabaseServer;
  const dnes = den(opts.now || new Date());
  const hranice = poDnech(dnes, ZAMCENY_PLAN_LEAD_DNI);

  const { data: clenstvi, error: chybaClenstvi } = await client
    .from('memberships')
    .select('user_id, tier, status, trial_ends_at');
  if (chybaClenstvi) throw new Error(`memberships: ${chybaClenstvi.message}`);

  const trialy = (clenstvi || []).filter((m) => {
    const verdikt = canRenewPlanForMembership(m);
    if (verdikt.allowed) return false;
    return verdikt.reason === 'start_trial_allows_initial_plan_only'
      || verdikt.reason === 'start_trial_expired_upgrade_required';
  });
  if (!trialy.length) return [];

  const ids = trialy.map((m) => m.user_id).filter(Boolean);
  const { data: plany, error: chybaPlanu } = await client
    .from('ai_generated_plans')
    .select('user_id, valid_from, valid_until, locked')
    .in('user_id', ids);
  if (chybaPlanu) throw new Error(`ai_generated_plans: ${chybaPlanu.message}`);

  /** Nejzazší platnost skutečného (nezamčeného) plánu + už existující ukázky. */
  const konecPlanu = new Map();
  const maUkazkuOd = new Map();
  for (const p of plany || []) {
    if (p.locked) {
      maUkazkuOd.set(p.user_id, String(p.valid_from || '').split('T')[0]);
      continue;
    }
    const konec = p.valid_until ? String(p.valid_until).split('T')[0] : null;
    const stav = konecPlanu.get(p.user_id) ?? null;
    if (konec && (!stav || konec > stav)) konecPlanu.set(p.user_id, konec);
  }

  const kandidati = [];
  for (const m of trialy) {
    const konec = konecPlanu.get(m.user_id);
    if (!konec) continue;
    if (konec > hranice) continue;

    // Ukázka navazuje na poslední den plánu, ať v ní nechybí ani nepřebývá den.
    const od = poDnech(konec, 1);
    if (maUkazkuOd.get(m.user_id) === od) continue;

    kandidati.push({ user_id: m.user_id, od, do: poDnech(od, 6) });
  }

  kandidati.sort((a, b) => a.od.localeCompare(b.od) || a.user_id.localeCompare(b.user_id));
  return kandidati;
}

/**
 * Vyrobí a uloží jednu ukázku.
 *
 * @returns {Promise<{ok: boolean, reason?: string, plan_id?: string}>}
 */
export async function vyrobUkazku(kandidat, opts = {}) {
  const client = opts.client || supabaseServer;

  const { data: bm, error: chybaBm } = await client
    .from('body_metrics')
    .select('*')
    .eq('user_id', kandidat.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (chybaBm) return { ok: false, reason: `body_metrics:${chybaBm.message}` };
  if (!bm) return { ok: false, reason: 'chybi_body_metrics' };

  const vysledek = await runUnifiedPlanPipeline({
    bm,
    // Jen jídelníček. Trénink se z ukázky vynechává schválně — paywall stojí
    // na jídle a generovat cvičební plán, který si člověk nemusí koupit,
    // je práce navíc.
    mealsOnly: true,
    validFrom: kandidat.od,
    validUntil: kandidat.do,
  });

  if (!vysledek?.ok) return { ok: false, reason: `pipeline:${vysledek?.error ?? 'neznama chyba'}` };

  const { data: vlozeny, error: chybaZapisu } = await client
    .from('ai_generated_plans')
    .insert({
      user_id: kandidat.user_id,
      email: bm.email ?? null,
      plan_type: 'meals',
      plan_html: vysledek.planHtml ?? null,
      structured_plan_json: vysledek.planJson ?? null,
      daily_calories: vysledek.targets?.calories ?? null,
      macros: vysledek.targets ?? null,
      valid_from: vysledek.valid_from ?? kandidat.od,
      valid_until: vysledek.valid_until ?? kandidat.do,
      // OBOJÍ JE PODSTATNÉ: `locked` říká „je to ukázka", `is_active: false`
      // brání tomu, aby nahradila týden, který uživatel právě má.
      locked: true,
      is_active: false,
      generated_by: 'zamcena_ukazka',
    })
    .select('id')
    .maybeSingle();

  if (chybaZapisu) return { ok: false, reason: `insert:${chybaZapisu.message}` };
  return { ok: true, plan_id: vlozeny?.id ?? null };
}

/**
 * Připraví ukázky všem, kdo na ně čekají.
 *
 * @param {{ dryRun?: boolean, now?: Date, client?: any }} [opts]
 */
export async function pripravZamceneUkazky(opts = {}) {
  const kandidati = await najdiKandidatyNaUkazku(opts);

  if (opts.dryRun === true) {
    return { dry_run: true, vyrobeno: 0, kandidatu: kandidati.length, kandidati };
  }

  let vyrobeno = 0;
  const chyby = [];
  for (const k of kandidati) {
    // Jedna neúspěšná ukázka nesmí zastavit ostatní — na rozdíl od generátoru
    // receptů tu nejde o sdílený rozpočet, který by se dal vyčerpat.
    const vysledek = await vyrobUkazku(k, opts);
    if (vysledek.ok) vyrobeno += 1;
    else chyby.push(`${k.user_id.slice(0, 8)}: ${vysledek.reason}`);
  }

  return { vyrobeno, kandidatu: kandidati.length, chyby };
}
