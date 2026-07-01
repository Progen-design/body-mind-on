import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatTrendDelta } from '../../lib/withings/withingsTrends.js';

const AUTO_SYNC_WINDOW_MS = 30 * 60 * 1000;

function toDateMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function formatDateTime(value) {
  const ms = toDateMs(value);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMetric(value, unit = '') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1).replace('.', ',')}${unit}`;
}

function summarizeTrendQuality({ latest, trends, history }) {
  if (!latest) return 'insufficient_data';
  const count = (history || []).length;
  if (count >= 8 && trends?.hasEnoughData) return 'high';
  if (count >= 3) return 'medium';
  return 'low';
}

export default function WithingsBodyDevelopmentSection({ profile }) {
  const [session, setSession] = useState(null);
  const [latestData, setLatestData] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [message, setMessage] = useState('');
  const autoSyncDoneRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data?.session || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const loadLatest = useCallback(async (token, { silent = false } = {}) => {
    if (!token) return null;
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/withings/latest', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Nelze načíst Withings data.');
      setLatestData(json);
      return json;
    } catch (err) {
      setMessage(err?.message || 'Nelze načíst Withings data.');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (token) => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/withings/history?limit=30', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Nelze načíst historii Withings.');
      const items = Array.isArray(json?.measurements) ? json.measurements : [];
      setHistoryItems(items);
      if (!items.length) setMessage('Zatím nejsou k dispozici žádná měření z chytré váhy.');
    } catch (err) {
      setMessage(err?.message || 'Nelze načíst historii Withings.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const runSync = useCallback(async (token, { silent = false } = {}) => {
    if (!token) return false;
    if (!silent) setSyncing(true);
    try {
      const res = await fetch('/api/withings/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ full: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Synchronizace Withings selhala.');
      if (!silent) setMessage('Synchronizace dokončena.');
      await loadLatest(token, { silent: true });
      if (historyOpen) await loadHistory(token);
      return true;
    } catch (err) {
      setMessage(err?.message || 'Synchronizace Withings selhala.');
      return false;
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [historyOpen, loadHistory, loadLatest]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    loadLatest(token);
  }, [session?.access_token, loadLatest]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !latestData || autoSyncDoneRef.current) return;
    if (latestData?.connected !== true) return;
    const lastSyncMs = toDateMs(latestData?.connection?.last_sync_at);
    if (!lastSyncMs || Date.now() - lastSyncMs <= AUTO_SYNC_WINDOW_MS) return;
    autoSyncDoneRef.current = true;
    runSync(token, { silent: true }).catch(() => {});
  }, [latestData, runSync, session?.access_token]);

  const connected = latestData?.connected === true;
  const profileProgram = profile?.program || 'START';
  const latest = latestData?.latest || null;
  const trends = useMemo(() => latestData?.trends ?? null, [latestData?.trends]);

  const measurementCount30d = useMemo(() => {
    const since = Date.now() - (30 * 24 * 60 * 60 * 1000);
    return (historyItems || []).filter((item) => toDateMs(item?.measured_at) >= since).length;
  }, [historyItems]);

  // withings_summary je připravený pro další krok:
  // generování dalšího týdenního plánu podle dlouhodobého vývoje.
  const withingsSummary = useMemo(() => {
    return {
      latest_weight_kg: latest?.weight_kg ?? null,
      latest_fat_percent: latest?.fat_percent ?? null,
      latest_fat_mass_kg: latest?.fat_mass_kg ?? null,
      latest_muscle_mass_kg: latest?.muscle_mass_kg ?? null,
      latest_bone_mass_kg: latest?.bone_mass_kg ?? null,
      latest_hydration_kg: latest?.hydration_kg ?? null,
      latest_bmi: latest?.bmi ?? null,
      weight_change_7d_kg: trends?.trend7d?.weight_kg ?? null,
      weight_change_30d_kg: trends?.trend30d?.weight_kg ?? null,
      fat_change_7d_percent: trends?.trend7d?.fat_percent ?? null,
      measurement_count_30d: measurementCount30d,
      trend_quality: summarizeTrendQuality({ latest, trends, history: historyItems }),
    };
  }, [historyItems, latest, measurementCount30d, trends]);

  const reconnectLabel = connected ? 'Znovu propojit Withings' : 'Propojit Withings';
  const connectDisabled = latestData?.configured === false;

  async function openHistory() {
    setHistoryOpen((prev) => !prev);
    if (!historyOpen && session?.access_token) {
      await loadHistory(session.access_token);
    }
  }

  async function startConnect() {
    const token = session?.access_token;
    if (!token || connectDisabled) return;
    try {
      const res = await fetch('/api/withings/connect?format=json&return_to=/profil', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Nelze spustit propojení Withings.');
      window.location.href = json.url;
    } catch (err) {
      setMessage(err?.message || 'Nelze spustit propojení Withings.');
    }
  }

  const infoText = 'Hodnoty z chytré váhy se používají pro vyhodnocení trendu. Další týdenní plán se může automaticky upravit podle vývoje, ne podle jednoho měření.';
  const measuredAt = latest?.measured_at || latestData?.connection?.last_sync_at;

  return (
    <section className="withings-body-dev" aria-label="Tělesný vývoj" data-profile-program={profileProgram}>
      <div className="withings-head">
        <div>
          <h2>Tělesný vývoj</h2>
          <p>Data z chytré váhy Withings se automaticky propisují do profilu a slouží jako vstup pro další týdenní plán.</p>
        </div>
        {connected ? <span className="withings-state withings-state--ok">Propojeno</span> : <span className="withings-state">Nepřipojeno</span>}
      </div>

      {(loading || syncing) ? <p className="withings-status">Načítám Withings data…</p> : null}
      {message ? <p className="withings-status">{message}</p> : null}

      {connected ? (
        <>
          <div className="withings-metrics">
            <div><span>Váha</span><strong>{formatMetric(latest?.weight_kg, ' kg')}</strong></div>
            <div><span>Tuk %</span><strong>{formatMetric(latest?.fat_percent, ' %')}</strong></div>
            <div><span>Tuková hmota</span><strong>{formatMetric(latest?.fat_mass_kg, ' kg')}</strong></div>
            <div><span>Svalová hmota</span><strong>{formatMetric(latest?.muscle_mass_kg, ' kg')}</strong></div>
            <div><span>Kostní hmota</span><strong>{formatMetric(latest?.bone_mass_kg, ' kg')}</strong></div>
            <div><span>Hydratace</span><strong>{formatMetric(latest?.hydration_kg, ' kg')}</strong></div>
            <div><span>BMI</span><strong>{formatMetric(latest?.bmi)}</strong></div>
            <div><span>Tep</span><strong>{formatMetric(latest?.pulse, ' bpm')}</strong></div>
            <div className="withings-metric-wide"><span>Poslední měření</span><strong>{formatDateTime(measuredAt)}</strong></div>
          </div>

          <div className="withings-trends">
            <h3>Trend</h3>
            <div className="withings-trend-grid">
              <div><span>Od minula</span><strong>{formatTrendDelta(trends?.delta?.weight_kg, ' kg')}</strong></div>
              <div><span>7 dní</span><strong>{formatTrendDelta(trends?.trend7d?.weight_kg, ' kg')}</strong></div>
              <div><span>30 dní</span><strong>{formatTrendDelta(trends?.trend30d?.weight_kg, ' kg')}</strong></div>
              <div><span>Tuk 7 dní</span><strong>{formatTrendDelta(trends?.trend7d?.fat_percent, ' %')}</strong></div>
            </div>
          </div>

          <div className="withings-impact">
            <h3>Vliv na další plán</h3>
            <p>{infoText}</p>
          </div>
        </>
      ) : (
        <div className="withings-impact">
          <h3>Vliv na další plán</h3>
          <p>{infoText}</p>
        </div>
      )}

      <div className="withings-actions">
        {connected ? (
          <>
            <button type="button" onClick={() => runSync(session?.access_token)} disabled={syncing || !session?.access_token}>Synchronizovat teď</button>
            <button type="button" className="secondary" onClick={openHistory} disabled={historyLoading || !session?.access_token}>Historie</button>
            <button type="button" className="secondary" onClick={startConnect} disabled={!session?.access_token}>Znovu propojit Withings</button>
          </>
        ) : (
          <button type="button" onClick={startConnect} disabled={!session?.access_token || connectDisabled}>Propojit Withings</button>
        )}
      </div>

      {historyOpen ? (
        <div className="withings-history">
          {historyLoading ? <p>Načítám historii…</p> : null}
          {!historyLoading && !historyItems.length ? <p>Zatím nejsou k dispozici žádná měření.</p> : null}
          {!historyLoading && historyItems.length ? (
            <ul>
              {historyItems.map((item) => (
                <li key={`${item.measured_at}-${item.weight_kg || 'x'}`}>
                  <strong>{formatDateTime(item.measured_at)}</strong>
                  <span>
                    {formatMetric(item.weight_kg, ' kg')} · tuk {formatMetric(item.fat_percent, ' %')} · svaly {formatMetric(item.muscle_mass_kg, ' kg')}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <style jsx>{`
        .withings-body-dev {
          width: min(1180px, 100%);
          max-width: 1180px;
          margin: 16px auto 20px;
          padding: 22px;
          border-radius: 24px;
          border: 1px solid rgba(56, 189, 248, 0.25);
          background: linear-gradient(145deg, rgba(15, 23, 42, 0.96), rgba(12, 18, 32, 0.96));
          box-shadow: 0 16px 48px rgba(2, 6, 23, 0.38);
        }
        .withings-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 14px;
        }
        h2 { margin: 0 0 6px; color: #f8fafc; font-size: 28px; }
        h3 { margin: 0 0 10px; color: #dbeafe; font-size: 16px; }
        p { margin: 0; color: rgba(226, 232, 240, 0.82); line-height: 1.5; }
        .withings-state {
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 6px 10px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 700;
        }
        .withings-state--ok {
          border-color: rgba(34, 197, 94, 0.5);
          color: #86efac;
          background: rgba(34, 197, 94, 0.14);
        }
        .withings-status {
          margin-top: 10px;
          margin-bottom: 8px;
        }
        .withings-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }
        .withings-metrics div {
          padding: 12px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(51, 65, 85, 0.82);
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .withings-metrics span { font-size: 12px; color: rgba(203, 213, 225, 0.78); }
        .withings-metrics strong { font-size: 17px; color: #f8fafc; }
        .withings-metric-wide { grid-column: 1 / -1; }
        .withings-trends, .withings-impact {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid rgba(51, 65, 85, 0.7);
        }
        .withings-trend-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .withings-trend-grid div {
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(30, 41, 59, 0.64);
          border: 1px solid rgba(51, 65, 85, 0.78);
        }
        .withings-trend-grid span { display: block; margin-bottom: 6px; font-size: 12px; color: #cbd5e1; }
        .withings-trend-grid strong { color: #f8fafc; }
        .withings-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }
        .withings-actions button {
          border: 0;
          border-radius: 12px;
          min-height: 42px;
          padding: 10px 14px;
          background: linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%);
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .withings-actions .secondary {
          background: rgba(51, 65, 85, 0.7);
          border: 1px solid rgba(100, 116, 139, 0.7);
        }
        .withings-actions button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .withings-history {
          margin-top: 14px;
          border-top: 1px solid rgba(51, 65, 85, 0.7);
          padding-top: 12px;
        }
        .withings-history ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 8px;
        }
        .withings-history li {
          border-radius: 12px;
          border: 1px solid rgba(51, 65, 85, 0.8);
          background: rgba(15, 23, 42, 0.72);
          padding: 10px 12px;
          display: grid;
          gap: 4px;
        }
        .withings-history strong { color: #cbd5e1; font-size: 12px; }
        .withings-history span { color: #f8fafc; font-size: 14px; }
        @media (max-width: 1100px) {
          .withings-metrics, .withings-trend-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .withings-body-dev {
            margin-top: 16px;
            margin-bottom: 20px;
            padding: 18px 16px;
            border-radius: 18px;
          }
          .withings-head {
            flex-direction: column;
          }
          .withings-metrics, .withings-trend-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
