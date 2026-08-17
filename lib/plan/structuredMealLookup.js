/**
 * KTERÉ JÍDLO ZE `structured_plan_json` PATŘÍ KE KLIKNUTÉ KARTĚ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROČ TENHLE MODUL VZNIKL
 *
 * Původní hledání v PlanVieweru znělo takhle:
 *
 *     const want = typZeStitku(mealTypeLabel);
 *     if (want) {
 *       const hit = arr.find((m) => m.type === want);   // ← PRVNÍ toho typu
 *       if (hit) return hit;
 *     }
 *     return arr[fallbackMi] ?? null;
 *
 * Typ tedy přebíjel pozici a index byl jen záloha. Komentář u toho vysvětloval
 * proč: „pořadí v HTML může chvíli nesedět s JSON“. To je legitimní obava, jenže
 * `arr.find` vrátí VŽDY první jídlo daného typu — a den má běžně dvě svačiny.
 *
 * Změřeno na produkčním plánu 15.–17. 8. 2026 (den: snídaně, oběd, svačina,
 * svačina, večeře): klik na „Recept“ u jídla [3] „Cottage s pečivem“ otevřel
 * modal jídla [2] „Jogurt s jablkem a skořicí“. Stejnou cestou chodí i
 * „Nahradit jiným“ a „Zahrnout od dalšího týdne“, takže obě mířily na cizí
 * jídlo taky.
 *
 * Je to přesně tatáž třída chyby jako u „Splněno“ u svačin (viz
 * `mealActivityKey` v lib/dailyActivationClient.js): identitou jídla není jeho
 * typ, ale jeho POZICE V DNI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JAK SE TO ŘEŠÍ TEĎ
 *
 * 1. Typ A POŘADÍ V RÁMCI TYPU. `sameTypeOrdinal` říká, kolikátá svačina to
 *    v pořadí je, takže druhá svačina najde druhou.
 * 2. Až když typ neznáme (cizí štítek) nebo v dni žádné jídlo toho typu není,
 *    rozhoduje holá pozice.
 *
 * Pořadí pravidel je záměrně tohle a ne opačné. Zkoušel jsem napřed „pozice,
 * když na ní typ sedí“ — v běžném případě vyjde totéž, ale u rozejitého pořadí
 * (karty [Večeře, Svačina, Svačina] proti struktuře [svačina, svačina, večeře])
 * dá druhá karta špatné jídlo, protože na její pozici náhodou taky leží
 * svačina. Typ + pořadí zvládne obě situace, proto jde první.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizovanyTyp(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/**
 * Štítek jídla (český z parseru i anglický ze struktury) na kanonický typ.
 * @param {unknown} mealTypeLabel
 * @returns {string|null}
 */
export function structMealTypeFromLabel(mealTypeLabel) {
  const t = normalizovanyTyp(mealTypeLabel);
  if (!t) return null;
  if (t.includes('snidan') || t.includes('breakfast')) return 'breakfast';
  if (t.includes('obed') || t.includes('lunch')) return 'lunch';
  if (t.includes('vecere') || t.includes('dinner')) return 'dinner';
  if (t.includes('svacin') || t.includes('snack')) return 'snack';
  return null;
}

/**
 * Kolikáté jídlo svého typu to v dni je (0 = první).
 *
 * Počítá se ze SEZNAMU KARET, ne ze struktury — karta je to, na co uživatel
 * klikl, a její pořadí je jediné, co o jeho úmyslu bezpečně víme.
 *
 * @param {Array<{type?: string}>|null|undefined} viewerMeals
 * @param {number} mi index kliknuté karty
 * @returns {number}
 */
export function sameTypeOrdinalIn(viewerMeals, mi) {
  const list = Array.isArray(viewerMeals) ? viewerMeals : [];
  const want = structMealTypeFromLabel(list[mi]?.type);
  if (!want) return 0;
  let n = 0;
  for (let i = 0; i < mi && i < list.length; i += 1) {
    if (structMealTypeFromLabel(list[i]?.type) === want) n += 1;
  }
  return n;
}

/**
 * Najde jídlo ve `structDay.meals` pro kliknutou kartu.
 *
 * @param {{meals?: Array<{type?: string}>}|null|undefined} structDay
 * @param {unknown} mealTypeLabel štítek typu z karty
 * @param {number} mi index karty
 * @param {number} [sameTypeOrdinal] kolikáté jídlo svého typu karta je
 * @returns {object|null}
 */
export function structuredMealForCard(structDay, mealTypeLabel, mi, sameTypeOrdinal = 0) {
  const arr = Array.isArray(structDay?.meals) ? structDay.meals : [];
  if (arr.length === 0) return null;

  const want = structMealTypeFromLabel(mealTypeLabel);

  // 1) Typ + pořadí v rámci typu. Zvládne obojí: běžný případ, kdy karty sedí
  //    1:1 se strukturou (pak vyjde totéž co index), i rozejité pořadí, kvůli
  //    kterému se tu kdysi hledalo podle typu.
  if (want) {
    const stejnyTyp = arr.filter((m) => structMealTypeFromLabel(m?.type) === want);
    if (stejnyTyp.length > 0) {
      const poradi = Number.isFinite(Number(sameTypeOrdinal)) ? Number(sameTypeOrdinal) : 0;
      return stejnyTyp[Math.min(Math.max(poradi, 0), stejnyTyp.length - 1)];
    }
  }

  // 2) Typ neznáme (cizí štítek) nebo v dni žádné jídlo toho typu není —
  //    zbývá pozice.
  return arr[mi] ?? null;
}
