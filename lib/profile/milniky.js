/**
 * MILNÍKY PROFILU.
 *
 * Sekce „Tvé milníky“ ukazovala tři odznaky — „Plán připraven“, „První trénink“,
 * „Týden s námi“ — jako holé ✓ nebo ○. Splněný milník neřekl kdy, nesplněný
 * neřekl co k němu chybí. Odznak bez data je dekorace, ne informace.
 *
 * Data, ze kterých se to skládá, v profilu už jsou:
 *   plán       — `plans.created_at` aktivního plánu
 *   trénink    — nejstarší záznam ze sjednocené historie (ruční i z hodinek)
 *   registrace — `auth.users.created_at` (v profilu jako `profile.user.created_at`)
 *   měření     — nejstarší `body_metrics.created_at`
 *
 * „PRVNÍ TRÉNINK“ POČÍTÁ I HODINKY. Dřív se ptal jen na `workouts.length`
 * (ruční zápis), takže kdo odtrénoval pět tréninků s Apple Watch a ručně nic
 * nezapsal, měl milník nesplněný. Stejná chyba jako u historie tréninků.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace. „Dnešek“ chodí zvenčí,
 * ať test nezávisí na systémovém čase.
 */

/** @returns {number|null} milisekundy, nebo null u nečitelného data */
function casMs(hodnota) {
  if (!hodnota) return null;
  const t = new Date(hodnota).getTime();
  return Number.isFinite(t) ? t : null;
}

const DEN_MS = 24 * 60 * 60 * 1000;

/** Celé dny mezi dvěma okamžiky, nebo null. */
export function dnuOd(odKdy, dnesMs) {
  const od = casMs(odKdy);
  if (od === null || !Number.isFinite(dnesMs)) return null;
  return Math.floor((dnesMs - od) / DEN_MS);
}

/**
 * Milníky se stavem, datem a vysvětlením.
 *
 * @param {{
 *   plan?: {created_at?: string}|null,
 *   historie?: Array<{cas: number|null, datum: string|null}>,
 *   registrovanOd?: string|null,
 *   mereni?: Array<{created_at?: string}>,
 *   dnesMs: number,
 * }} vstup
 * @returns {Array<{id: string, popisek: string, splneno: boolean, datum: string|null, detail: string|null}>}
 */
export function milniky({ plan = null, historie = [], registrovanOd = null, mereni = [], dnesMs } = {}) {
  const list = Array.isArray(historie) ? historie : [];
  // Historie chodí od nejnovějšího, první trénink je tedy poslední se známým časem.
  const sCasem = list.filter((z) => z && z.cas !== null);
  const prvni = sCasem.length ? sCasem[sCasem.length - 1] : null;

  const mereniSerazena = (Array.isArray(mereni) ? mereni : [])
    .filter((m) => casMs(m?.created_at) !== null)
    .sort((a, b) => casMs(a.created_at) - casMs(b.created_at));
  const prvniMereni = mereniSerazena[0] || null;

  const dnuOdRegistrace = dnuOd(registrovanOd, dnesMs);

  return [
    {
      id: 'plan',
      popisek: 'Plán připraven',
      splneno: !!plan,
      datum: plan?.created_at || null,
      detail: plan ? null : 'Zatím žádný plán — vygeneruj si ho v sekci Můj plán.',
    },
    {
      id: 'trenink',
      popisek: 'První trénink',
      splneno: !!prvni,
      datum: prvni?.datum || null,
      detail: prvni ? null : 'Zapiš trénink, nebo připoj hodinky a doplní se sám.',
    },
    {
      id: 'mereni',
      popisek: 'První měření',
      splneno: !!prvniMereni,
      datum: prvniMereni?.created_at || null,
      detail: prvniMereni ? null : 'Zvaž se na chytré váze, nebo zadej váhu ručně.',
    },
    {
      id: 'tyden',
      popisek: 'Týden s námi',
      splneno: dnuOdRegistrace !== null && dnuOdRegistrace >= 7,
      datum: registrovanOd,
      detail:
        dnuOdRegistrace === null
          ? null
          : dnuOdRegistrace >= 7
            ? `${dnuOdRegistrace} ${dnuOdRegistrace === 1 ? 'den' : dnuOdRegistrace <= 4 ? 'dny' : 'dní'} od registrace`
            : `Ještě ${7 - dnuOdRegistrace} ${7 - dnuOdRegistrace === 1 ? 'den' : 7 - dnuOdRegistrace <= 4 ? 'dny' : 'dní'}`,
    },
  ];
}
