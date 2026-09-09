/**
 * POST /api/plan/exercise-variant
 * Zamění jeden cvik v aktivním plánu za jeho lehčí/těžší variantu
 * (easier_key/harder_key z exercise_asset_registry).
 *
 * Body: { plan_id, day_index, canonical_key, smer: 'lehci' | 'tezsi' }
 */
import { supabaseServer } from '../../lib/supabaseServer.js';
import { swapWorkoutExerciseVariant } from '../../lib/planExerciseVariant.js';
import { startProgramEnvironment } from '../../lib/workoutStartProgram.js';
import { hasAnyExclusions, applyExclusions } from '../../lib/trainingExclusions.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Pouze POST' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ ok: false, error: 'Neplatná session' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const planId = body.plan_id;
    const dayIndex = Number(body.day_index);
    const canonicalKey = String(body.canonical_key || '').trim();
    const smer = body.smer;

    if (!planId || !Number.isFinite(dayIndex) || !canonicalKey) {
      return res.status(400).json({ ok: false, error: 'Chybí plan_id, day_index nebo canonical_key' });
    }
    if (smer !== 'lehci' && smer !== 'tezsi') {
      return res.status(400).json({ ok: false, error: "smer musí být 'lehci' nebo 'tezsi'" });
    }

    // VLASTNICTVÍ PLÁNU: cizí plán se nenajde vůbec (ne 403 s detaily) —
    // .eq('user_id', user.id) je součástí SELECTu, ne až následné kontroly.
    const { data: planRow, error: planErr } = await supabaseServer
      .from('ai_generated_plans')
      .select('id, user_id, structured_plan_json, plan_html')
      .eq('id', planId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (planErr) {
      console.error('[plan/exercise-variant] nelze načíst plán', planErr.message);
      return res.status(500).json({ ok: false, error: 'Nepodařilo se načíst plán' });
    }
    if (!planRow) {
      return res.status(404).json({ ok: false, error: 'Plán nenalezen' });
    }

    const structured = planRow.structured_plan_json && typeof planRow.structured_plan_json === 'object'
      ? JSON.parse(JSON.stringify(planRow.structured_plan_json))
      : null;
    if (!structured?.days?.length) {
      return res.status(400).json({ ok: false, error: 'Plán nemá structured data' });
    }

    const { data: bmRows, error: bmErr } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (bmErr) {
      console.error('[plan/exercise-variant] nelze načíst body_metrics', bmErr.message);
      return res.status(500).json({ ok: false, error: 'Nepodařilo se načíst profil' });
    }
    const bodyMetrics = bmRows?.[0] || { user_id: user.id };

    const result = await swapWorkoutExerciseVariant(
      structured,
      { dayIndex, canonicalKey, smer },
      bodyMetrics
    );

    // Vyloučení cviků (lib/trainingExclusions.js). Lehčí/těžší varianta je
    // pořád TENTÝŽ pohybový vzor (dřep zůstává dřep, easier_key/harder_key
    // se nikdy nepoužívá jako náhrada při vyloučení) — takže když je i sama
    // nově dosazená varianta mezi vyloučenými, swap se odmítá celý, nic
    // jiného se za ni nedosazuje.
    if (hasAnyExclusions(bodyMetrics?.training_exclusions)) {
      const envKey = startProgramEnvironment(bodyMetrics);
      const day = structured.days[dayIndex];
      const exerciseIdx = day?.workout?.exercises?.indexOf(result.exercise) ?? -1;
      const { days: checkedDays } = applyExclusions([day], bodyMetrics?.training_exclusions, envKey);
      const checkedKey = exerciseIdx >= 0 ? checkedDays[0]?.workout?.exercises?.[exerciseIdx]?.canonical_key : null;
      if (checkedKey !== result.exercise?.canonical_key) {
        return res.status(409).json({
          ok: false,
          error: 'Tahle varianta je mezi tvými vyloučenými cviky.',
        });
      }
    }

    const { error: updateErr } = await supabaseServer
      .from('ai_generated_plans')
      .update({
        structured_plan_json: result.structuredPlan,
        plan_html: result.planHtml,
      })
      .eq('id', planId)
      .eq('user_id', user.id);

    if (updateErr) {
      console.error('[plan/exercise-variant] nelze uložit plán', updateErr.message);
      return res.status(500).json({ ok: false, error: 'Nepodařilo se uložit plán' });
    }

    console.info('[plan/exercise-variant] swapped', {
      plan_id: planId,
      day_index: dayIndex,
      smer,
      from: result.previous_title,
      to: result.new_title,
    });

    return res.status(200).json({
      ok: true,
      exercise: result.exercise,
      previous_title: result.previous_title,
      new_title: result.new_title,
      structured_plan_json: result.structuredPlan,
      plan_html: result.planHtml,
    });
  } catch (err) {
    const code = String(err?.message || '').split(':')[0].trim();
    if (code === 'NO_VARIANT') {
      return res.status(409).json({
        ok: false,
        error: 'Pro tenhle cvik teď lehčí/těžší variantu nemáme.',
      });
    }
    if (code === 'EXERCISE_NOT_FOUND' || code === 'WORKOUT_NOT_FOUND' || code === 'STRUCTURED_PLAN_MISSING') {
      return res.status(404).json({ ok: false, error: 'Cvik v plánu nenalezen' });
    }
    if (code === 'INVALID_SMER') {
      return res.status(400).json({ ok: false, error: "smer musí být 'lehci' nebo 'tezsi'" });
    }
    console.error('[plan/exercise-variant]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Nepodařilo se zaměnit cvik' });
  }
}
