/**
 * Detekce useknutého anglického zdroje. Takový recept nesmí do katalogu vstoupit,
 * protože se z něj nedá udělat správný překlad — model chybějící konec buď dopíše,
 * nebo okomentuje, a obojí uvidí uživatel.
 *
 * Pravidla jsou ZÁMĚRNĚ úzká. Změřeno na 476 receptech / 2450 krocích:
 *   - "krok bez koncové interpunkce"  → 240 kroků v 77 receptech, ale skoro všechno
 *     jsou celé věty, kterým jen chybí tečka ("Add more dressing as desired").
 *     Jako signál useknutí NEPOUŽITELNÉ.
 *   - "krok končí číslicí"            → 12 kroků v 10 receptech, ale legitimní jsou
 *     "Serves 3", "Serves 8", nutriční tabulka i "Preheat oven to 350".
 *     Samo o sobě taky nepoužitelné.
 *   - pravidla níž                    → 4 recepty, 0 falešných.
 *
 * Co detekce NEZACHYTÍ: recept, který prostě skončí uprostřed postupu správně
 * ukončenou větou. Příklad je recept 131 — poslední krok zní "...place into a baking
 * dish with the chicken broth." a nic dál; chybí pečení. Textově je bezvadný, chybí
 * mu význam. Na to by byl potřeba jiný signál (zmíněná trouba bez času pečení),
 * což je zatím spekulace, ne měření.
 */

/** Teplota uříznutá o poslední číslici: "Preheat oven to 35" místo 350. */
const USEKNUTA_TEPLOTA = /(preheat|heat|bake|oven|grill|roast)[^.!?]*\b(to|at)\s+\d{1,2}\s*$/i;

/** Rozměr uříznutý uprostřed: "an 11x1" místo 11x13. */
const USEKNUTY_ROZMER = /\d+\s*x\s*\d\s*$/i;

/**
 * @param {unknown} step
 * @returns {boolean}
 */
export function isTruncatedStep(step) {
  const text = String(step ?? '').trim();
  if (!text) return false;
  return USEKNUTA_TEPLOTA.test(text) || USEKNUTY_ROZMER.test(text);
}

/**
 * Přečte kroky z obou tvarů, ve kterých `instructions` v katalogu žijí:
 * analyzedInstructions bloky ze Spoonacularu i prosté pole stringů.
 *
 * @param {unknown} instructions
 * @returns {string[]}
 */
export function collectStepTexts(instructions) {
  const pole = Array.isArray(instructions) ? instructions : [];
  /** @type {string[]} */
  const out = [];
  for (const prvek of pole) {
    if (typeof prvek === 'string') {
      out.push(prvek);
    } else if (prvek && Array.isArray(/** @type {{ steps?: unknown[] }} */ (prvek).steps)) {
      for (const s of /** @type {{ steps: unknown[] }} */ (prvek).steps) {
        const text = /** @type {{ step?: unknown }} */ (s)?.step;
        if (text != null) out.push(String(text));
      }
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} recipe
 * @returns {boolean}
 */
export function hasTruncatedSource(recipe) {
  return collectStepTexts(recipe?.analyzedInstructions ?? recipe?.instructions)
    .some(isTruncatedStep);
}
