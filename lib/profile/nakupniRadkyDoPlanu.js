/**
 * ŘÁDKY SUROVIN DO ULOŽENÉHO PLÁNU.
 *
 * PROČ. `shopping_ingredient_lines` v `structured_plan_json` je zmražený text,
 * složený tou verzí kódu, která plán generovala. Ve starších plánech proto
 * pořád žijí vady, které jsou v kódu dávno opravené:
 *
 *   „whites", „old fashioned oats", „Salt to taste"   — nepřeložené `original`
 *   „1 /", „1 /2 lžičky cukru"                        — rozseknutý zlomek
 *   „celozrnná pita" bez gramáže                      — zahozené `amount`
 *   „olivový olej 0.9 lžíce"                          — obrácené pořadí
 *
 * Katalog přitom drží čistá data: změřeno 22. 8. 2026 na 325 surovinách
 * ve 105 jídlech aktivních plánů — všechny mají `amount` i `unit` a názvy
 * jsou české. Řádek se tedy skládá znovu při čtení profilu, ze stejného
 * formátovače, jaký používá generátor.
 *
 * PROČ PŘI ČTENÍ A NE MIGRACÍ. Uložený plán se nepřepisuje. Migrace by musela
 * proběhnout znovu po každé opravě formátovače a u historických plánů by
 * přepsala, co uživatel viděl. Takhle se oprava projeví všude okamžitě.
 *
 * BEZPEČNOSTNÍ POJISTKA. Když katalog pro jídlo nic použitelného nedá, původní
 * řádky zůstávají. Prázdný nákupní seznam je horší než seznam s vadou.
 *
 * MODUL JE ČISTÝ — jen sdílené formátovače, kvůli `node --test`.
 */

import { radkySurovin } from './surovinaRadek.js';
import { scaleIngredientsList } from '../nutrition/atomicPortionScale.js';

/** Sloupce katalogu, ze kterých se řádky skládají. */
export const SLOUPCE_KATALOGU_PRO_SUROVINY = 'ingredients';

function dnyPlanu(plan) {
  const dny = plan?.structured_plan_json?.days;
  return Array.isArray(dny) ? dny : [];
}

function jidlaDne(den) {
  return Array.isArray(den?.meals) ? den.meals : [];
}

/**
 * Suroviny katalogového řádku přeškálované na porci jídla.
 *
 * Katalog je uložený na násobku 1; jídlo v plánu má vlastní
 * `portion_multiplier`. Bez přeškálování by seznam ukazoval základní recept,
 * ne to, co má člověk opravdu sníst.
 *
 * @param {Array<object>} suroviny surové `recipes_catalog.ingredients`
 * @param {unknown} portionMultiplier
 * @returns {string[]} prázdné pole = katalog nic použitelného nedal
 */
export function radkyProJidlo(suroviny, portionMultiplier) {
  if (!Array.isArray(suroviny) || suroviny.length === 0) return [];

  const nasobek = Number(portionMultiplier);
  const cil = Number.isFinite(nasobek) && nasobek > 0 ? nasobek : 1;

  let skalovane;
  try {
    skalovane = cil === 1 ? suroviny : scaleIngredientsList(suroviny, 1, cil);
  } catch {
    // Škálování je doplněk, ne podmínka. Když selže, řádky se složí
    // aspoň v základní porci — to je pořád lepší než anglický `original`.
    skalovane = suroviny;
  }

  return radkySurovin(skalovane);
}

/**
 * Přepíše `shopping_ingredient_lines` u jídel, pro která má katalog suroviny.
 *
 * Mění `plany` na místě — objekt jde rovnou do odpovědi /api/profile.
 *
 * @param {Array<object>} plany
 * @param {Map<string, Array<object>>} surovinyPodleId catalog_id → ingredients
 * @returns {number} počet přepsaných jídel
 */
export function pridejNakupniRadkyDoPlanu(plany, surovinyPodleId) {
  if (!Array.isArray(plany) || !(surovinyPodleId instanceof Map)) return 0;

  let prepsano = 0;
  for (const plan of plany) {
    for (const den of dnyPlanu(plan)) {
      for (const jidlo of jidlaDne(den)) {
        if (!jidlo || typeof jidlo !== 'object') continue;

        const suroviny = surovinyPodleId.get(String(jidlo.catalog_id));
        if (!suroviny) continue;

        const nove = radkyProJidlo(suroviny, jidlo.portion_multiplier);
        if (nove.length === 0) continue;

        jidlo.shopping_ingredient_lines = nove;
        prepsano++;
      }
    }
  }

  return prepsano;
}
