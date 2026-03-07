/**
 * Analyze user progress from recent check-ins for adaptive trainer/coach context.
 * Used by buildAgentContext to add progress_analysis (weight change, adherence, stress, recommendation_hint).
 */
import { supabaseServer } from './supabaseServer';

const MAX_CHECKINS = 2;

/**
 * @param {string} userId
 * @returns {Promise<{ weight_change: number | null, adherence_score: number | null, stress_level: string | null, recommendation_hint: string | null, recent_checkins?: Array<object> }>}
 */
export async function analyzeUserProgress(userId) {
  const empty = {
    weight_change: null,
    adherence_score: null,
    stress_level: null,
    recommendation_hint: null,
  };

  if (!userId) return empty;

  try {
    const { data: checkIns, error } = await supabaseServer
      .from('user_checkins')
      .select('weight, stress_level, adherence_score, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_CHECKINS);

    if (error || !checkIns?.length) {
      return { ...empty, recent_checkins: [] };
    }

    const latest = checkIns[0];
    const previous = checkIns[1] ?? null;

    const adherence_score =
      latest.adherence_score != null ? Number(latest.adherence_score) : null;
    const stress_level =
      latest.stress_level && typeof latest.stress_level === 'string'
        ? latest.stress_level.toLowerCase().trim()
        : null;

    let weight_change = null;
    if (
      latest.weight != null &&
      previous?.weight != null &&
      Number.isFinite(Number(latest.weight)) &&
      Number.isFinite(Number(previous.weight))
    ) {
      weight_change = Number(latest.weight) - Number(previous.weight);
    }

    // Get goal for recommendation (reduction vs maintenance/gain)
    let goal = null;
    const { data: bm } = await supabaseServer
      .from('body_metrics')
      .select('goal')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bm?.goal) goal = String(bm.goal).toLowerCase();

    let recommendation_hint = null;

    if (weight_change != null) {
      if (weight_change < -0.5) {
        recommendation_hint = 'fat_loss_progress_good';
      } else if (weight_change > 0.5 && (goal === 'redukce' || goal === 'reduction')) {
        recommendation_hint = 'fat_loss_not_working';
      }
    }
    if (adherence_score != null && adherence_score < 60) {
      recommendation_hint = 'low_adherence';
    }
    if (stress_level === 'high') {
      recommendation_hint = 'reduce_training_load';
    }

    return {
      weight_change,
      adherence_score,
      stress_level,
      recommendation_hint,
      recent_checkins: checkIns,
    };
  } catch (err) {
    return { ...empty, recent_checkins: [] };
  }
}
