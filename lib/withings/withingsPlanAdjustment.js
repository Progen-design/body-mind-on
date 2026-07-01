function asNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function buildWithingsPlanAdjustmentSignal(withingsSummary, currentGoal) {
  const summary = withingsSummary && typeof withingsSummary === 'object' ? withingsSummary : {};
  const goal = String(currentGoal || '').toLowerCase().trim();
  const measurementCount30d = asNum(summary.measurement_count_30d) ?? 0;
  const weightChange7d = asNum(summary.weight_change_7d_kg) ?? 0;
  const fatChange7d = asNum(summary.fat_change_7d_percent);
  const muscleDrop = asNum(summary.latest_muscle_mass_kg) != null
    && asNum(summary.previous_muscle_mass_kg) != null
    && asNum(summary.latest_muscle_mass_kg) < asNum(summary.previous_muscle_mass_kg);
  const trendQuality = String(summary.trend_quality || 'low');

  const guardrails = [
    'Upravit až další týdenní plán, ne dnešní den.',
    'Ignorovat jednorázové výkyvy po jednom měření.',
  ];

  if (measurementCount30d < 3 || trendQuality === 'low') {
    return {
      should_adjust_next_plan: false,
      calorie_delta_next_plan: 0,
      protein_delta_g: 0,
      reason: 'Nedostatek měření pro bezpečnou úpravu.',
      confidence: 'low',
      trend_quality: trendQuality || 'low',
      guardrails,
    };
  }

  let calorieDelta = 0;
  let proteinDelta = 0;
  let reason = 'Trend je stabilní, plán beze změny.';

  if (goal === 'redukce') {
    if (Math.abs(weightChange7d) <= 0.1 && measurementCount30d >= 6) {
      calorieDelta = -125;
      reason = 'Váha delší dobu stagnuje při cíli hubnutí.';
    } else if (weightChange7d <= -1.0) {
      calorieDelta = 125;
      reason = 'Váha klesá příliš rychle, deficit je vhodné zmírnit.';
    }
  }

  if (fatChange7d != null && fatChange7d < 0 && !muscleDrop) {
    calorieDelta = 0;
    reason = 'Tuk klesá a svalová hmota se drží, plán ponechán.';
  }

  if (muscleDrop) {
    proteinDelta = clamp(15, 10, 20);
    if (calorieDelta < 0) calorieDelta = Math.round(calorieDelta / 2);
    reason = 'Svalová hmota klesá, navýšení bílkovin a mírnější deficit.';
  }

  const confidence = trendQuality === 'high' && measurementCount30d >= 8 ? 'high' : 'medium';

  return {
    should_adjust_next_plan: calorieDelta !== 0 || proteinDelta !== 0,
    calorie_delta_next_plan: calorieDelta,
    protein_delta_g: proteinDelta,
    reason,
    confidence,
    trend_quality: trendQuality || 'medium',
    guardrails,
  };
}
