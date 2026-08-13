/**
 * KROK 3: dopad odvozené váhy na kalorický cíl.
 *
 * KDY. Jen při týdenní obnově plánu (`weekly_plan_update`), NE po každém
 * vážení. Vážení chodí ze zařízení několikrát denně; přepočítávat cíl při
 * každém by znamenalo, že člověk vidí jiné číslo ráno a jiné večer, a plán,
 * který drží v ruce, by se rozešel s profilem. Týdenní kadence je taky jediná,
 * u které má sedmidenní medián smysl.
 *
 * CO SE NEDĚJE. Když odvozená váha chybí (za 14 dní nepřišlo nic), cíl se
 * NEMĚNÍ a nic se neloguje jako změna. Tichý pád zpátky na registrační váhu
 * by vypadal jako regulérní přepočet — viz komentář v `derivedWeight.js`.
 *
 * `body_metrics.weight_kg` zůstává registračním snímkem. Odvozená váha se do
 * něj NEZAPISUJE; jen se s ní počítá. Přepsat ji by znamenalo zahodit jediný
 * záznam o tom, s čím uživatel začínal.
 */
import { nactiOdvozenouVahu } from './derivedWeight.js';
import { calculateNutritionTargets } from './nutritionTargets.js';

/** Pod tímhle rozdílem se cíl nepřepisuje — šum z jednoho vážení. */
export const MIN_ROZDIL_KG = 0.3;

function asNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Spočítá, jaký by byl cíl pro danou váhu. Čistá funkce nad `body_metrics`.
 *
 * @param {object} bodyMetrics
 * @param {number} weightKg
 */
export function cilProVahu(bodyMetrics, weightKg) {
  return calculateNutritionTargets({
    // `calories_target` se schválně vynechává: kdyby zůstal, funkce by ho
    // beze změny vrátila zpátky (viz větev `!forceRecalculate` ve výpočtu)
    // a přepočet by nikdy nic nezměnil.
    bodyMetrics: { ...bodyMetrics, weight_kg: weightKg, calories_target: null },
    goal: bodyMetrics?.goal,
    activity: bodyMetrics?.activity,
    workoutDays: bodyMetrics?.workout_days,
    forceRecalculate: true,
  });
}

/**
 * Rozhodne, jestli se má cíl změnit. Bez DB, aby šla otestovat pravidla.
 *
 * @param {object} bodyMetrics
 * @param {import('./derivedWeight.js').OdvozenaVaha} odvozena
 * @returns {{ zmenit: boolean, duvod: string, novyCil: number|null, staryCil: number|null, cile: object|null }}
 */
export function vyhodnotPrepocet(bodyMetrics, odvozena) {
  const staryCil = asNum(bodyMetrics?.calories_target);
  const registracniVaha = asNum(bodyMetrics?.weight_kg);

  if (!odvozena || odvozena.weight_kg === null) {
    return {
      zmenit: false,
      duvod: odvozena?.duvod === 'starsi_nez_14_dni'
        ? 'bez_zmeny_mereni_starsi_14_dni'
        : 'bez_zmeny_zadna_mereni',
      novyCil: null,
      staryCil,
      cile: null,
    };
  }

  const odvozenaVaha = asNum(odvozena.weight_kg);
  if (registracniVaha !== null && Math.abs(odvozenaVaha - registracniVaha) < MIN_ROZDIL_KG) {
    return { zmenit: false, duvod: 'bez_zmeny_vaha_stejna', novyCil: null, staryCil, cile: null };
  }

  const cile = cilProVahu(bodyMetrics, odvozenaVaha);
  const novyCil = asNum(cile?.calories_target);

  if (novyCil === null) {
    return { zmenit: false, duvod: 'bez_zmeny_vypocet_selhal', novyCil: null, staryCil, cile: null };
  }
  if (staryCil !== null && novyCil === staryCil) {
    return { zmenit: false, duvod: 'bez_zmeny_cil_stejny', novyCil, staryCil, cile };
  }

  return {
    zmenit: true,
    duvod: odvozena.okno === '14d'
      ? 'prepocet_z_odvozene_vahy_sirsi_okno'
      : 'prepocet_z_odvozene_vahy',
    novyCil,
    staryCil,
    cile,
  };
}

/**
 * Celý krok: načte měření, rozhodne, zapíše cíl a audit.
 *
 * Vrací upravené `body_metrics` pro další zpracování — volající s nimi
 * pokračuje do generování plánu.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {object} bodyMetrics
 * @param {{ taskId?: string|null, ted?: Date }} [opts]
 */
export async function prepocitejCilPriObnove(db, bodyMetrics, opts = {}) {
  const userId = bodyMetrics?.user_id;
  if (!userId) return { bodyMetrics, zmeneno: false, duvod: 'bez_zmeny_chybi_user_id' };

  let odvozena;
  try {
    odvozena = await nactiOdvozenouVahu(db, userId, opts.ted);
  } catch (e) {
    // Výpadek čtení nesmí shodit generování plánu — plán je pro uživatele
    // důležitější než aktuálnost cíle. Ale musí být vidět.
    console.error('[weeklyWeightRecalc] načtení odvozené váhy selhalo', {
      user_id: userId,
      error: e?.message || String(e),
    });
    return { bodyMetrics, zmeneno: false, duvod: 'bez_zmeny_chyba_cteni' };
  }

  const verdikt = vyhodnotPrepocet(bodyMetrics, odvozena);
  if (!verdikt.zmenit) {
    return { bodyMetrics, zmeneno: false, duvod: verdikt.duvod, odvozena };
  }

  const patch = { calories_target: verdikt.novyCil };
  if (bodyMetrics?.id) {
    const { error } = await db.from('body_metrics').update(patch).eq('id', bodyMetrics.id);
    if (error) {
      console.error('[weeklyWeightRecalc] zápis calories_target selhal', {
        user_id: userId,
        error: error.message,
      });
      return { bodyMetrics, zmeneno: false, duvod: 'bez_zmeny_zapis_selhal', odvozena };
    }
  }

  const { error: auditErr } = await db.from('calorie_target_changes').insert({
    user_id: userId,
    old_calories: verdikt.staryCil,
    new_calories: verdikt.novyCil,
    reason: verdikt.duvod,
    derived_weight_kg: odvozena.weight_kg,
    previous_weight_kg: asNum(bodyMetrics?.weight_kg),
    measurement_count: odvozena.pocet_mereni,
    measurement_window: odvozena.okno,
    newest_measurement_at: odvozena.nejnovejsi_at,
    floor_applied: verdikt.cile?.floor_applied === true,
    floor_value: verdikt.cile?.floor_value ?? null,
    task_id: opts.taskId ?? null,
  });
  if (auditErr) {
    // Cíl už je zapsaný. Chybějící audit je vážný, ale plán se kvůli němu
    // neruší — jinak by selhání logu bralo uživateli týdenní plán.
    console.error('[weeklyWeightRecalc] audit změny cíle se nezapsal', {
      user_id: userId,
      old: verdikt.staryCil,
      new: verdikt.novyCil,
      error: auditErr.message,
    });
  }

  console.log('[weeklyWeightRecalc] kalorický cíl přepočítán', {
    user_id: userId,
    duvod: verdikt.duvod,
    stary_cil: verdikt.staryCil,
    novy_cil: verdikt.novyCil,
    odvozena_vaha_kg: odvozena.weight_kg,
    registracni_vaha_kg: asNum(bodyMetrics?.weight_kg),
    pocet_mereni: odvozena.pocet_mereni,
    okno: odvozena.okno,
    limit_pouzit: verdikt.cile?.floor_applied === true,
    limit_hodnota: verdikt.cile?.floor_value ?? null,
  });

  return {
    bodyMetrics: { ...bodyMetrics, ...patch },
    zmeneno: true,
    duvod: verdikt.duvod,
    odvozena,
    staryCil: verdikt.staryCil,
    novyCil: verdikt.novyCil,
  };
}
