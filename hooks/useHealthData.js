import { useCallback, useEffect, useState } from 'react';

async function fetchHealthJson(path, accessToken) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Nepodařilo se načíst ${path}.`);
  }
  return json;
}

const INITIAL = {
  connection: null,
  watch: null,
  recovery: null,
  scale: null,
  workouts: null,
  metrics: null,
};

export function useHealthData(accessToken, { days = 30, workoutLimit = 20 } = {}) {
  const [data, setData] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!accessToken) {
      setData(INITIAL);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const qs = `days=${days}`;
      const [connection, watch, recovery, scale, workouts, metrics] = await Promise.all([
        fetchHealthJson('/api/health/connection', accessToken),
        fetchHealthJson(`/api/health/watch?${qs}`, accessToken),
        fetchHealthJson(`/api/health/recovery?${qs}`, accessToken),
        fetchHealthJson(`/api/health/scale?${qs}`, accessToken),
        fetchHealthJson(`/api/health/workouts?limit=${workoutLimit}`, accessToken),
        fetchHealthJson(`/api/health/metrics?${qs}`, accessToken),
      ]);

      setData({ connection, watch, recovery, scale, workouts, metrics });
    } catch (err) {
      setError(err?.message || 'Nepodařilo se načíst zdravotní data.');
      setData(INITIAL);
    } finally {
      setLoading(false);
    }
  }, [accessToken, days, workoutLimit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
