// PATCH /api/profile-preferences – uloží preference (aktivita, cíl, strava, návyky) a přegeneruje plán
// Workouty zůstávají nedotčeny – mění se jen body_metrics a user_habits
// Orchestration: preference update + event (diet_changed, goal_changed) + triggerImmediateDecision.
// Přegenerování plánu je orchestration-compatible: generatePlanForEmail používá stejný trainer jako task executor; v budoucnu lze nahradit za event + task adjust_plan.
import { supabaseServer } from '../lib/supabaseServer.js';
import { generatePlanForEmail } from '../lib/generatePlan.js';
import { isValidHabitId, invalidHabitIds, POSITIVE_HABITS } from '../lib/habits.js';
import { normalizeOccupation, normalizeActivity, normalizeStress, normalizeGoal, normalizeFrequency, getFrequencyDayRange } from '../lib/preferenceConstants.js';
import { enqueueAIEvent, triggerImmediateDecision } from '../lib/aiEvents.js';
import { mergeTrainingEnvironmentIntoNotes } from '../lib/trainingEnvironment.js';
import { dietTypeRejectionReason } from '../lib/dietOptions.js';
import {
  buildCalorieTargetBodyMetricsPatch,
  CALORIE_TARGET_RECALC_FIELDS,
  emitCalorieTargetChangedEvent,
} from '../lib/calorieTargetIntegrity.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const userId = user.id;
    const email = user.email?.toLowerCase();
    if (!email) return res.status(400).json({ error: 'Chybí e-mail.' });

    const b = req.body || {};
    // Explicitní žádost o „přegeneruj jídelníček na aktuální cíl", ne o změnu
    // preferencí — posílá ji tlačítko u nesouladu cíle a plánu
    // (docs/DALSI_KROK.md 7.2a). Bez tohohle by prázdné tělo spustilo
    // `mealsOnly: false` a přegenerovalo i trénink, který se nezměnil.
    const regenerateMealsOnly = b.regenerateMealsOnly === true;

    // Načíst nejnovější body_metrics
    const { data: metricsRows, error: metricsErr } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (metricsErr || !metricsRows?.length) {
      return res.status(400).json({ error: 'Žádné metriky pro tohoto uživatele. Nejprve dokonči registraci.' });
    }

    const latest = metricsRows[0];
    const updates = {};

    if (b.activity !== undefined) updates.activity = normalizeActivity(b.activity) ?? latest.activity;
    if (b.stress_level !== undefined) updates.stress_level = normalizeStress(b.stress_level) ?? latest.stress_level;
    if (b.occupation !== undefined || b.worktype !== undefined) {
      updates.occupation = normalizeOccupation(b.occupation ?? b.worktype) ?? normalizeOccupation(latest.occupation) ?? null;
    }
    if (b.goal !== undefined) updates.goal = normalizeGoal(b.goal) ?? latest.goal;
    if (b.freq_choice !== undefined || b.frequency !== undefined) {
      const canonicalFreq = normalizeFrequency(b.freq_choice ?? b.frequency) ?? latest.freq_choice;
      if (canonicalFreq) {
        updates.freq_choice = canonicalFreq;
        updates.weekly_sessions_user = canonicalFreq.includes('1') ? 1 : canonicalFreq.includes('4') ? 5 : 3;
      }
    }
    if (b.diet_type !== undefined) {
      // Stejná brána jako v registraci — `disabled` v UI je jen kosmetika.
      // Bez tohohle šlo změnou profilu nastavit dietu, kterou neumíme sestavit.
      const dietDuvod = dietTypeRejectionReason(b.diet_type);
      if (dietDuvod) return res.status(400).json({ error: dietDuvod });
      updates.diet_type = (b.diet_type || '').trim() || null;
    }
    if (b.dietary_restrictions !== undefined) updates.dietary_restrictions = (b.dietary_restrictions || '').trim() || null;
    if (b.foods_to_avoid !== undefined) updates.foods_to_avoid = (b.foods_to_avoid || '').trim() || null;
    if (b.workout_days !== undefined) {
      const wd = b.workout_days;
      const normalizedDays = Array.isArray(wd) && wd.length > 0
        ? wd.filter((n) => Number.isFinite(Number(n)) && n >= 0 && n <= 6)
        : [];
      updates.workout_days = normalizedDays.length > 0 ? normalizedDays.join(',') : null;
    }
    if (b.training_environment !== undefined) {
      const trainingEnvironment = ['gym', 'home_bodyweight', 'home_equipment', 'other'].includes(String(b.training_environment || '').trim())
        ? String(b.training_environment).trim()
        : null;
      if (!trainingEnvironment) {
        return res.status(400).json({ error: 'Vyber prostředí tréninku.' });
      }
      const availableEquipment = trainingEnvironment === 'home_equipment' && Array.isArray(b.available_equipment)
        ? b.available_equipment.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const trainingEnvironmentDetail = trainingEnvironment === 'other'
        ? String(b.training_environment_detail || '').trim().slice(0, 280)
        : '';
      if (trainingEnvironment === 'other' && !trainingEnvironmentDetail) {
        return res.status(400).json({ error: 'Napiš, kde a s čím budeš cvičit.' });
      }
      updates.notes = mergeTrainingEnvironmentIntoNotes(
        latest.notes,
        trainingEnvironment,
        availableEquipment,
        trainingEnvironmentDetail || null
      );
    }

    const effectiveFrequency = normalizeFrequency(
      updates.freq_choice ?? b.freq_choice ?? b.frequency ?? latest.freq_choice
    );
    if (effectiveFrequency) {
      const { min, max } = getFrequencyDayRange(effectiveFrequency);
      const effectiveWorkoutDaysRaw = updates.workout_days ?? latest.workout_days;
      const effectiveWorkoutDays = (
        Array.isArray(effectiveWorkoutDaysRaw)
          ? effectiveWorkoutDaysRaw
          : typeof effectiveWorkoutDaysRaw === 'string' && effectiveWorkoutDaysRaw
            ? effectiveWorkoutDaysRaw.split(',').map((s) => Number(s.trim()))
            : []
      ).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);

      if (effectiveWorkoutDays.length < min || effectiveWorkoutDays.length > max) {
        return res.status(400).json({
          error: `Pro frekvenci ${effectiveFrequency} musí být vybráno ${min}-${max} tréninkových dní (aktuálně ${effectiveWorkoutDays.length}).`,
        });
      }
    }

    // Návyky se ověřují TADY, před jakýmkoli zápisem — ne až u samotného
    // user_habits bloku níž. Ten dřív smazal existující návyky ještě před
    // kontrolou vstupu: request se samými neplatnými klíči smazal člověku
    // celý seznam a nevložil nic, beze chyby. Viz docs/DALSI_KROK.md 6.7.
    if (b.selected_habits !== undefined) {
      const neplatneNavyky = invalidHabitIds(b.selected_habits);
      if (neplatneNavyky.length > 0) {
        return res.status(400).json({
          error: `Neznámé návyky: ${neplatneNavyky.map((v) => String(v)).join(', ')}.`,
        });
      }
    }

    if (Object.keys(updates).length > 0) {
      let toUpdate = { ...updates };
      const shouldRecalcCalories = Object.keys(updates).some((k) => CALORIE_TARGET_RECALC_FIELDS.includes(k));
      if (shouldRecalcCalories) {
        Object.assign(toUpdate, buildCalorieTargetBodyMetricsPatch({ ...latest, ...updates }, { forceRecalculate: true }));
      }
      let updateErr = null;
      let result = await supabaseServer.from('body_metrics').update(toUpdate).eq('id', latest.id);
      updateErr = result.error;

      // Retry bez volitelných sloupců, pokud DB nemá novější migraci
      const columnMissing = updateErr?.message && (
        /does not exist|neexistuje|column.*not found/i.test(updateErr.message)
      );
      if (updateErr && columnMissing) {
        const optionalCols = ['foods_to_avoid', 'dietary_restrictions', 'workout_days'];
        for (const col of optionalCols) {
          if (col in toUpdate) {
            delete toUpdate[col];
            if (Object.keys(toUpdate).length > 0) {
              result = await supabaseServer.from('body_metrics').update(toUpdate).eq('id', latest.id);
              updateErr = result.error;
              if (!updateErr) break;
            }
          }
        }
      }

      if (updateErr) {
        console.error('[profile-preferences] body_metrics update:', updateErr);
        const msg = updateErr.message || '';
        const friendly =
          /foods_to_avoid|dietary_restrictions/i.test(msg) && /does not exist|neexistuje/i.test(msg)
            ? 'Databáze ještě nemá sloupec – spusť migraci 20260320_body_metrics_foods_to_avoid.sql v Supabase.'
            : /violates check constraint|check constraint/i.test(msg)
            ? 'Neplatná hodnota v jednom z polí (aktivita, typ práce, cíl). Zkus znovu vybrat z nabídky.'
            : null;
        return res.status(500).json({
          error: friendly || 'Nepodařilo se uložit preference.',
          detail: process.env.NODE_ENV === 'development' ? msg : undefined,
        });
      }

      // docs/DALSI_KROK.md 8.1 — jedno z pěti míst, kde se `calories_target`
      // opravdu mění (cíl/aktivita/váha/frekvence v preferencích).
      if (shouldRecalcCalories) {
        await emitCalorieTargetChangedEvent(userId, {
          oldCaloriesTarget: latest.calories_target,
          patch: toUpdate,
          source: 'preferences_updated',
        });
      }
    }

    // Event-driven autonomy for dynamic reactions.
    const changedKeys = Object.keys(updates);
    if (changedKeys.length > 0) {
      if (changedKeys.some((k) => ['diet_type', 'dietary_restrictions', 'foods_to_avoid'].includes(k))) {
        await enqueueAIEvent('diet_changed', userId, { changed_keys: changedKeys });
      }
      if (changedKeys.includes('goal')) {
        await enqueueAIEvent('goal_changed', userId, { changed_keys: changedKeys });
      }
      await triggerImmediateDecision(userId);
    }

    // Aktualizovat user_habits
    if (Array.isArray(b.selected_habits)) {
      const validHabits = b.selected_habits
        .filter((id) => typeof id === 'string' && isValidHabitId(id.trim()))
        .map((id, i) => ({
          user_id: userId,
          habit_id: String(id).trim(),
          is_positive: POSITIVE_HABITS.some((p) => p.id === String(id).trim()),
          sort_order: i,
        }));

      const { error: delErr } = await supabaseServer
        .from('user_habits')
        .delete()
        .eq('user_id', userId);

      if (delErr) console.warn('[profile-preferences] user_habits delete:', delErr.message);

      if (validHabits.length > 0) {
        const { error: insErr } = await supabaseServer.from('user_habits').insert(validHabits);
        if (insErr) console.warn('[profile-preferences] user_habits insert:', insErr.message);
      }
    }

    // Přegenerovat plán a odeslat e-mail – při změně jen stravy jen jídelníček, ne tréninkový rozvrh
    const dietOnlyKeys = ['diet_type', 'dietary_restrictions', 'foods_to_avoid'];
    const onlyDietChanged = Object.keys(updates).length > 0 && Object.keys(updates).every((k) => dietOnlyKeys.includes(k));
    const bmOverride = { ...latest, ...updates, email };
    if (updates.notes !== undefined) {
      bmOverride.notes = updates.notes;
    }
    const shouldRecalcCalories = Object.keys(updates).some((k) => CALORIE_TARGET_RECALC_FIELDS.includes(k));
    if (shouldRecalcCalories) {
      Object.assign(bmOverride, buildCalorieTargetBodyMetricsPatch(bmOverride, { forceRecalculate: true }));
    }
    // ZACHOVAT ROZPRACOVANÝ TÝDEN, KDYŽ SE MĚNÍ JEN JÍDELNÍČEK.
    //
    // `daily_activity_completions` páruje odškrtnutí přes `plan_id` (viz
    // `klicDokonceni` v src/data/adaptery.ts:360). `persistPlanFromUnified`
    // upsertuje `ai_generated_plans` podle (`user_id`, `valid_from`) — když se
    // `valid_from` neřekne, spadne na DNEŠEK, ne na začátek aktivního plánu,
    // takže vznikne NOVÝ řádek s NOVÝM `id` a všechna odškrtnutí za tenhle
    // týden (jídla i tréninky) tiše zmizí. Ověřeno na datech 31. 8. 2026.
    //
    // Když posíláme stejné `valid_from`/`valid_until`, jaké má aktivní plán,
    // upsert aktualizuje TENTÝŽ řádek (unique constraint
    // `uq_ai_generated_plans_user_valid_from`) — `plan_id` se nemění.
    // S `mealsOnly: true` navíc `loadResolvedWorkoutsFromLatestPlan()`
    // zkopíruje trénink z aktivního plánu BEZE ZMĚNY, takže tréninková
    // odškrtnutí zůstanou platná (stejný obsah, stejný klíč). Jídla se
    // přepočítávají na nový cíl, takže jejich odškrtnutí se ztratí — ale
    // poctivě, protože jídla se opravdu mění.
    let validFromOverride;
    let validUntilOverride;
    if (regenerateMealsOnly) {
      const { data: aktivniPlan } = await supabaseServer
        .from('ai_generated_plans')
        .select('valid_from, valid_until')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (aktivniPlan?.valid_from) {
        validFromOverride = aktivniPlan.valid_from;
        validUntilOverride = aktivniPlan.valid_until;
      }
    }

    let planRegenerated = false;
    try {
      const result = await generatePlanForEmail(email, {
        bmOverride,
        planChangeContext: true,
        mealsOnly: onlyDietChanged || regenerateMealsOnly,
        ...(validFromOverride ? { validFromOverride, validUntilOverride } : {}),
      });
      planRegenerated = result?.ok === true;
    } catch (e) {
      console.error('[profile-preferences] generatePlanForEmail:', e);
      return res.status(200).json({
        ok: true,
        message: 'Preference byly uloženy. Přegenerování plánu se nepodařilo – zkus to znovu nebo nás kontaktuj.',
        planRegenerated: false,
      });
    }

    return res.status(200).json({
      ok: true,
      message: planRegenerated
        ? regenerateMealsOnly
          ? 'Jídelníček přegenerován na aktuální cíl a odeslán na e-mail. Trénink zůstal beze změny.'
          : 'Preference uloženy, plán přegenerován a odeslán na e-mail.'
        : 'Preference uloženy.',
      planRegenerated,
    });
  } catch (err) {
    console.error('[profile-preferences] ERROR:', err);
    return res.status(500).json({ error: err.message || 'Chyba serveru' });
  }
}
