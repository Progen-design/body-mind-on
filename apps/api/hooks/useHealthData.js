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

const HEALTH_ENDPOINTS = [
  { key: 'connection', path: '/api/health/connection' },
  { key: 'watch', path: (days) => `/api/health/watch?days=${days}` },
  { key: 'recovery', path: (days) => `/api/health/recovery?days=${days}` },
  { key: 'scale', path: (days) => `/api/health/scale?days=${days}` },
  { key: 'workouts', path: (_days, workoutLimit) => `/api/health/workouts?limit=${workoutLimit}` },
  { key: 'metrics', path: (days) => `/api/health/metrics?days=${days}` },
];

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
      const settled = await Promise.allSettled(
        HEALTH_ENDPOINTS.map(({ path }) =>
          fetchHealthJson(
            typeof path === 'function' ? path(days, workoutLimit) : path,
            accessToken
          )
        )
      );

      const next = { ...INITIAL };
      const failures = [];
      settled.forEach((result, i) => {
        const key = HEALTH_ENDPOINTS[i].key;
        if (result.status === 'fulfilled') {
          next[key] = result.value;
        } else {
          failures.push(result.reason?.message || key);
        }
      });

      setData(next);
      if (failures.length === HEALTH_ENDPOINTS.length) {
        setError(failures[0] || 'Nepodařilo se načíst zdravotní data.');
      } else if (failures.length > 0) {
        setError('Část zdravotních dat se nepodařilo načíst. Zbytek je dostupný.');
      }
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
