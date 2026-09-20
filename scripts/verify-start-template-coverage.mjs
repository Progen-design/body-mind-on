#!/usr/bin/env node
/**
 * GATE NA POKRYTÍ POOLU (PROMPT_PRO_CODE.md bod B, 2026-09-17).
 *
 * Kaloricky vědomý `pickTemplateForSlot` (PR 3) umí jen vybrat NEJLÉPE
 * SEDÍCÍ šablonu z toho, co v poolu je — když pool žádnou sedící nemá,
 * propadne se (po vyčerpání i degenerované větve z bodu A) na jídlo mimo
 * pásmo. Tenhle skript hlídá KAPACITU poolu, ne výběr: pro každý balík
 * (`standard`/`vegetarian`/`vegan`), typ jídla a kalorický cíl spočítá,
 * kolik šablon se vejde do `[START_MIN_SCALE, START_MAX_SCALE]` a jestli
 * jich je dost na celý týden při `MAX_MEAL_USES_PER_WEEK` opakováních.
 *
 * FAIL, když kapacita < potřeba — to je přesně stav, kdy `pickTemplateForSlot`
 * musí sáhnout mimo pásmo, ať je sebechytřejší.
 */
import {
  START_MEAL_TEMPLATES,
  resolveMealsPerDay,
  templateBaseKcal,
  MAX_MEAL_USES_PER_WEEK,
} from '../lib/services/simpleMealPlannerAgent.js';
import { mealSlotTypes, slotTargetKcal, planMealTypeToWeightKey, START_MIN_SCALE, START_MAX_SCALE } from '../lib/nutrition/portionScaling.js';

const TARGETS = [1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000, 3300, 3600, 3900];
const PACKS = ['standard', 'vegetarian', 'vegan'];
const DAYS_PER_WEEK = 7;

/**
 * ROZSAH, KTERÝ BRÁNA DOOPRAVDY VYMÁHÁ (PROMPT_KALORIE_OBSAH.md, 2026-09-18).
 *
 * Ze 107 původních FAILů byla většina mimo dohodnutý rozsah: vegan (0
 * uživatelů) a cíle nad 2400 kcal jsou vědomě odložené —
 * viz `BMON_ODLOZENE_KALORIE_2026-09-17.md`. Brána, která je napořád
 * červená kvůli položkám, které jsme se rozhodli neřešit, je brána, kterou
 * si za týden všichni odvyknou číst (přesně stav, co se uklízel v #242).
 *
 * Mimo rozsah se nezametá pod koberec — pořád se vypisuje ve stejné
 * tabulce, jen jako WARN, ne jako FAIL, a nepočítá se do exit kódu.
 * Až se vegan/vyšší cíle otevřou, mění se JEN tahle konstanta.
 */
export const HARD_FAIL_SCOPE = Object.freeze({
  packs: Object.freeze(['standard', 'vegetarian']),
  minKcal: 1400,
  maxKcal: 2400,
});

function jeVRozsahu(pack, target) {
  return HARD_FAIL_SCOPE.packs.includes(pack)
    && target >= HARD_FAIL_SCOPE.minKcal
    && target <= HARD_FAIL_SCOPE.maxKcal;
}

let failed = 0;
let warned = 0;
const rows = [];

for (const pack of PACKS) {
  const packTemplates = START_MEAL_TEMPLATES[pack];
  for (const target of TARGETS) {
    const mealsPerDay = resolveMealsPerDay({ calories_target: target });
    const slots = mealSlotTypes(mealsPerDay);
    const typesInDay = [...new Set(slots)];

    for (const type of typesInDay) {
      const pool = packTemplates[type] || [];
      const slotsPerDayOfType = slots.filter((t) => t === type).length;
      const slotTarget = slotTargetKcal(target, mealsPerDay, planMealTypeToWeightKey(type));

      const fitting = pool.filter((tpl) => {
        const baseKcal = templateBaseKcal(tpl, type);
        if (baseKcal == null) return false;
        const needed = slotTarget / baseKcal;
        return needed >= START_MIN_SCALE && needed <= START_MAX_SCALE;
      });

      const needed = slotsPerDayOfType * DAYS_PER_WEEK;
      const capacity = fitting.length * MAX_MEAL_USES_PER_WEEK;
      const ok = capacity >= needed;
      const vRozsahu = jeVRozsahu(pack, target);
      if (!ok && vRozsahu) failed += 1;
      if (!ok && !vRozsahu) warned += 1;

      rows.push({
        pack,
        target,
        type,
        mealsPerDay,
        slotTarget: Math.round(slotTarget),
        poolSize: pool.length,
        fitting: fitting.length,
        needed,
        capacity,
        missing: Math.max(0, Math.ceil((needed - capacity) / MAX_MEAL_USES_PER_WEEK)),
        ok,
        vRozsahu,
      });
    }
  }
}

console.log('--- verify-start-template-coverage ---');
console.log('| pack | cíl | typ | cíl slotu | sedí/pool | potřeba | kapacita | chybí šablon | stav |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const stav = r.ok ? 'OK' : (r.vRozsahu ? 'FAIL' : 'WARN');
  console.log(
    `| ${r.pack} | ${r.target} | ${r.type} | ${r.slotTarget} | ${r.fitting}/${r.poolSize} | ${r.needed} | ${r.capacity} | ${r.ok ? 0 : r.missing} | ${stav} |`
  );
}

console.log(`\nWARN mimo rozsah: ${warned} kombinací (vegan, cíle > 2400) — viz BMON_ODLOZENE_KALORIE_2026-09-17.md`);
console.log(`${failed ? `RESULT: FAIL (${failed})` : 'RESULT: PASS'}`);
process.exit(failed ? 1 : 0);
