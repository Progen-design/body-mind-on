/**
 * ZÁLOŽKY PROFILU — definice a odznaky.
 *
 * Návrh v4 má nad obsahem lištu záložek. Chování zůstává stejné jako u lišty,
 * kterou nahrazuje: záložka otevře příslušnou sekci a odscrolluje na kotvu.
 * Skutečné přepínání panelů (kdy se ostatní sekce schovají) přijde až s tím,
 * jak se v dalších fázích jednotlivé sekce převedou na panely — udělat to teď
 * by znamenalo schovat obsah, který ještě nemá kam se přepnout.
 *
 * MODUL JE ČISTÝ — žádný React, žádné DOM API. Kvůli tomu jde otestovat
 * `node --test` bez transpilace, což je v tomhle repu zavedený postup pro
 * logiku vytaženou z `.jsx`.
 */

/**
 * Záložky v pořadí, v jakém stojí v liště.
 *
 * `sekce` je id rozbalovací bubliny profilu, `kotva` id prvku uvnitř ní.
 * Obojí musí existovat v `pages/profil.js` — kdyby se rozešly, záložka by
 * sekci otevřela a zůstala stát na místě.
 */
export const ZALOZKY = Object.freeze([
  { id: 'dnes', popisek: 'Dnes', ikona: '📅', sekce: 'muj-plan', kotva: 'profile-today-heading' },
  { id: 'jidelnicek', popisek: 'Jídelníček', ikona: '🍽️', sekce: 'muj-plan', kotva: 'profile-today-meals' },
  { id: 'trenink', popisek: 'Trénink', ikona: '🏋️', sekce: 'muj-plan', kotva: 'profile-today-workout' },
  { id: 'regenerace', popisek: 'Regenerace', ikona: '❤️', sekce: 'denni-navyky', kotva: 'profile-regenerace' },
  { id: 'nakup', popisek: 'Nákup', ikona: '🛒', sekce: 'muj-plan', kotva: 'plan-nakupni-seznam', otevritNakup: true },
  { id: 'navyky', popisek: 'Denní návyky', ikona: '✅', sekce: 'denni-navyky', kotva: 'denni-navyky' },
]);

/**
 * Číslo, nebo null. `Number(null)` je 0, takže prosté `Number(x) || null`
 * spolkne chybějící hodnotu a udělá z ní nulu — u skóre regenerace by to
 * znamenalo tvrdit „0/100“ tam, kde jsme prostě nic nenaměřili.
 *
 * Stejná past je ošetřená v `lib/health/insights.ts`; drží se tu záměrně
 * stejný postup, ať se obě místa chovají shodně.
 *
 * @param {unknown} hodnota
 * @returns {number|null}
 */
function cisloNeboNull(hodnota) {
  if (hodnota === null || hodnota === undefined || hodnota === '') return null;
  const n = Number(hodnota);
  return Number.isFinite(n) ? n : null;
}

/**
 * Skóre regenerace z nejnovějšího záznamu, nebo null.
 *
 * Řádky chodí z `/api/health/recovery` seřazené od nejnovějšího, takže se bere
 * nultý. Když hodnota chybí, vrací se null a odznak se nevykreslí — návrh měl
 * na tomhle místě natvrdo napsanou sedmdesátku, což by u člověka bez hodinek
 * vypadalo jako naměřený údaj.
 *
 * @param {Array<Record<string, unknown>>} radkyRegenerace
 * @returns {number|null}
 */
export function skoreRegenerace(radkyRegenerace) {
  if (!Array.isArray(radkyRegenerace) || radkyRegenerace.length === 0) return null;
  return cisloNeboNull(radkyRegenerace[0]?.recovery_score);
}

/**
 * Text odznaku u záložky, nebo null když se nemá vykreslit.
 *
 * Odznak nese jen to, co je opravdu naměřené nebo spočítané:
 *   regenerace — skóre z hodinek
 *   návyky     — kolik dnešních návyků ještě čeká
 *
 * @param {string} idZalozky
 * @param {{radkyRegenerace?: Array<Record<string, unknown>>, nesplnenoDnes?: number|null}} kontext
 * @returns {string|null}
 */
export function odznakZalozky(idZalozky, kontext = {}) {
  if (idZalozky === 'regenerace') {
    const skore = skoreRegenerace(kontext.radkyRegenerace);
    return skore === null ? null : String(Math.round(skore));
  }
  if (idZalozky === 'navyky') {
    const zbyva = cisloNeboNull(kontext.nesplnenoDnes);
    return zbyva !== null && zbyva > 0 ? String(Math.round(zbyva)) : null;
  }
  return null;
}
