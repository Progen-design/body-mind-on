/**
 * Čistá logika pro Export &amp; Tisk jídelníčku (ExportMealPlanModal.tsx) —
 * vytažená z JSX, ať jde otestovat bez renderu.
 */
import type { MealItem } from '../types';

export interface PostupJidla {
  /** null = neodhadnuto, řádek s časem se v dokumentu nekreslí. */
  prepTimeMin: number | null;
  /** Vždy neprázdné — když by bylo prázdné, funkce vrátí null místo objektu. */
  kroky: string[];
}

/**
 * Postup přípravy pro jedno jídlo v tiskovém dokumentu.
 *
 * `null`, když jídlo nemá `recipe`, nebo recept nemá jediný použitelný krok
 * — DOKUMENT PAK NEKRESLÍ NIC, žádné „Postup není k dispozici", stejné
 * pravidlo jako u cviků (docs/DALSI_KROK.md 9.9). Prázdné/whitespace kroky
 * ze zdroje se zahazují, aby se nepočítaly do délky seznamu.
 *
 * @param meal
 */
export function postupProJidlo(meal: MealItem): PostupJidla | null {
  const instructions = meal.recipe?.instructions;
  if (!Array.isArray(instructions)) return null;

  const kroky = instructions.map((s) => String(s ?? '').trim()).filter(Boolean);
  if (kroky.length === 0) return null;

  return { prepTimeMin: meal.recipe?.prepTimeMin ?? null, kroky };
}

/**
 * Součet kalorií CELÉHO plánu (všech jídel), ne jen snězených.
 *
 * NAMĚŘENÁ CHYBA: `App.tsx` počítal `totalCalories` jako
 * `meals.reduce((acc, m) => acc + (m.completed ? m.calories : 0), 0)` —
 * dokument pak tiskl „Celkem: 0 kcal", i když jídla dole sečtou 2 632,
 * protože nic ještě nebylo odškrtnuté jako snězené. `totalCalories` se
 * v `App.tsx` nikde jinde nepoužíval (jen v téhle jedné hlášce), takže
 * modal si součet počítá sám ze `meals`, které stejně dostává — žádný
 * další prop, žádná šance příště poslat znovu špatné číslo.
 */
export function soucetKcalPlanu(meals: MealItem[]): number {
  return meals.reduce((acc, m) => acc + (Number(m.calories) || 0), 0);
}
