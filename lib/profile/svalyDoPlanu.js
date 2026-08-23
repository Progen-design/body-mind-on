/**
 * SVALOVÉ SKUPINY A NÁŘADÍ DO ULOŽENÉHO PLÁNU.
 *
 * PROČ. `structured_plan_json` nese u každého cviku `canonical_key`, `sets`
 * a `reps`, ale nic o tom, co ten cvik zabírá. UI proto ukazovalo „Trénink B"
 * a pod tím „Fokus: Varianta B" — název opsaný jinými slovy. Člověk, který
 * si plán otevře poprvé, z toho nepozná, co bude cvičit, ani proč se A a B
 * střídají.
 *
 * Přitom `exercise_asset_registry` má u každého cviku `primary_muscle`
 * i `equipment_class`. Změřeno 23. 8. 2026: všech deset cviků v aktivním
 * plánu se páruje na registr a všech deset tam svalovou skupinu má.
 *
 * Dopárování se dělá tady, při čtení profilu — ne v generátoru, aby popis
 * dostaly i plány vygenerované dřív. Stejný vzor jako `postupyDoPlanu.js`.
 *
 * CO TENHLE MODUL NEDĚLÁ: nehádá svalovou skupinu z názvu cviku. Když se
 * cvik na registr nenapáruje, zůstane bez popisu a UI ho do souhrnu
 * nezapočítá — radši méně informace než vymyšlená.
 *
 * MODUL JE ČISTÝ — bez importů, kvůli `node --test` bez transpilace.
 */

/**
 * Sloupce registru, které tenhle modul čte.
 *
 * Jediný zdroj pravdy pro `.select()` v `api/profile.js`. Kdyby se seznam
 * psal na dvou místech, rozešel by se tiše — server by přestal vozit
 * `equipment_class`, řádek s nářadím by nikdy nesvítil a žádný test jedné
 * strany by to nezachytil.
 */
export const SLOUPCE_REGISTRU_PRO_SVALY = 'canonical_key, primary_muscle, equipment_class';

/** Dny plánu, ať už jsou uložené kdekoli. */
function dnyPlanu(plan) {
  const dny = plan?.structured_plan_json?.days;
  return Array.isArray(dny) ? dny : [];
}

/** Cviky jednoho dne. */
function cvikyDne(den) {
  const cviky = den?.workout?.exercises;
  return Array.isArray(cviky) ? cviky : [];
}

/**
 * Klíče všech cviků ve všech plánech, bez duplicit.
 *
 * @param {Array<object>} plany
 * @returns {string[]}
 */
export function kliceCviku(plany = []) {
  const klice = new Set();
  for (const plan of Array.isArray(plany) ? plany : []) {
    for (const den of dnyPlanu(plan)) {
      for (const cvik of cvikyDne(den)) {
        const klic = String(cvik?.canonical_key || '').trim();
        if (klic) klice.add(klic);
      }
    }
  }
  return [...klice];
}

/**
 * Doplní do cviků `primary_muscle` a `equipment_class` z registru.
 *
 * Mutuje kopii plánu, originál nechává být. Cvik, který v registru není,
 * projde beze změny.
 *
 * @param {Array<object>} plany plány z databáze
 * @param {Array<{canonical_key: string, primary_muscle?: string, equipment_class?: string}>} radkyRegistru
 * @returns {Array<object>} plány s obohacenými cviky
 */
export function doplnSvalyDoPlanu(plany = [], radkyRegistru = []) {
  const podleKlice = new Map();
  for (const radek of Array.isArray(radkyRegistru) ? radkyRegistru : []) {
    const klic = String(radek?.canonical_key || '').trim();
    if (klic) podleKlice.set(klic, radek);
  }
  if (podleKlice.size === 0) return plany;

  return (Array.isArray(plany) ? plany : []).map((plan) => {
    const dny = dnyPlanu(plan);
    if (!dny.length) return plan;

    const noveDny = dny.map((den) => {
      const cviky = cvikyDne(den);
      if (!cviky.length) return den;

      const noveCviky = cviky.map((cvik) => {
        const radek = podleKlice.get(String(cvik?.canonical_key || '').trim());
        if (!radek) return cvik;
        return {
          ...cvik,
          primary_muscle: radek.primary_muscle ?? cvik.primary_muscle ?? null,
          equipment_class: radek.equipment_class ?? cvik.equipment_class ?? null,
        };
      });

      return { ...den, workout: { ...den.workout, exercises: noveCviky } };
    });

    return {
      ...plan,
      structured_plan_json: { ...plan.structured_plan_json, days: noveDny },
    };
  });
}
