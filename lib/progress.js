export function getProgressData(metrics) {
  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
    return {
      currentWeight: null,
      startWeight: null,
      diff: null
    };
  }

  const sorted = [...metrics].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const current = sorted[0];
  const first = sorted[sorted.length - 1];

  const currentWeight = current?.weight_kg ?? null;
  const startWeight = first?.weight_kg ?? null;

  const diff =
    currentWeight !== null && startWeight !== null
      ? currentWeight - startWeight
      : null;

  return {
    currentWeight,
    startWeight,
    diff
  };
}
