// /components/profile/WithingsProfileCard.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { formatTrendDelta } from '../../lib/withings/withingsTrends.js';

const AUTO_SYNC_MIN_INTERVAL_MS = 30 * 60 * 1000;

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits).replace('.', ',') : null;
}

function displayMetric(value, unit = '') {
  const formatted = formatNumber(value);
  return formatted ? `${formatted}${unit}` : '—';
}

function sanitizeUserMessage(message) {
  const text = String(message || '').trim();
  if (!text) return '';
  const technical = /oauth|klientsk|dashboard|env|config|token|redirect uri|šifrovac|raw payload|status \d+/i.test(text);
  if (technical) {
    console.warn('[WithingsProfileCard] suppressed technical message:', text);
    return 'Propojení chytré váhy teď není k dispozici. Zkus to prosím později.';
  }
  return text;
}

function resolveWidgetState(latest) {
  if (latest?.connected === true) return 'connected';
  if (latest?.configured === false) return 'not_configured';
  if (latest?.configured === true) return 'not_connected';
  return 'not_connected';
}

function shouldAutoSync(connection) {
  if (!connection) return false;
  if (!connection.last_sync_at) return true;
  const last = new Date(connection.last_sync_at).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last > AUTO_SYNC_MIN_INTERVAL_MS;
}

function useProfileInlineHost(enabled) {
  const [host, setHost] = useState(null);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    let cancelled = false;

    const mount = () => {
      if (cancelled) return true;
      const existing = document.getElementById('withings-profile-inline-host');
      if (existing) {
        setHost(existing);
        return true;
      }

      const membershipCard = document.querySelector('.profile-membership-plan-card');
      const hero = document.querySelector('.profile-hero');
      const anchor = membershipCard || hero;
      if (!anchor || !anchor.parentElement) return false;

      const el = document.createElement('div');
      el.id = 'withings-profile-inline-host';
      el.className = 'withings-profile-inline-host';
      anchor.insertAdjacentElement('afterend', el);
      setHost(el);
      return true;
    };

    if (mount()) return undefined;
    const interval = window.setInterval(() => {
      if (mount()) window.clearInterval(interval);
    }, 200);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [enabled]);

  return host;
}

export default function WithingsProfileCard() {
  const router = useRouter();
  const enabled = router.pathname === '/profil';
  const host = useProfileInlineHost(enabled);
  const [session, setSession] = useState(null);
  const [latest, setLatest] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data?.session || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession || null));
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [enabled]);

  const loadLatest = useCallback(async (authToken) => {
    if (!authToken) return null;
    try {
      const res = await fetch('/api/withings/latest', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Nelze načíst stav chytré váhy.');
      setLatest(json);
      return json;
    } catch (err) {
      console.error('[WithingsProfileCard] loadLatest failed:', err);
      setMessage(sanitizeUserMessage(err?.message || 'Nelze načíst stav chytré váhy.'));
      return null;
    }
  }, []);

  const loadHistory = useCallback(async (authTokenArg = null) => {
    const authToken = authTokenArg || session?.access_token;
    if (!authToken || latest?.connected !== true) return;
    setHistoryLoading(true);
    setHistoryMessage('');
    setHistoryOpen(true);
    try {
      const res = await fetch('/api/withings/history?limit=30', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Nelze načíst historii měření.');
      const items = Array.isArray(json?.measurements) ? json.measurements : [];
      setHistoryItems(items);
      if (!items.length) setHistoryMessage('Zatím nemáme žádná měření.');
    } catch (err) {
      console.error('[WithingsProfileCard] loadHistory failed:', err);
      setHistoryItems([]);
      setHistoryMessage(sanitizeUserMessage(err?.message || 'Nelze načíst historii měření.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [session?.access_token, latest?.connected]);

  const syncNow = useCallback(async ({ silent = false } = {}) => {
    const authToken = session?.access_token;
    if (!authToken || busy) return null;
    setBusy(true);
    if (silent) setAutoSyncing(true);
    else setMessage('Synchronizuji data…');
    try {
      const res = await fetch('/api/withings/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ full: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Synchronizace selhala.');
      if (!silent) {
        const importedWeight = json?.profile_import?.weight_kg;
        setMessage(importedWeight
          ? `Hotovo. Váha ${String(importedWeight).replace('.', ',')} kg je propsaná do hlavního profilu.`
          : `Hotovo. Uloženo ${json.measurements_stored || 0} měření.`);
      }
      const refreshed = await loadLatest(authToken);
      if (historyOpen) await loadHistory(authToken);
      return refreshed || json;
    } catch (err) {
      console.error('[WithingsProfileCard] syncNow failed:', err);
      if (!silent) setMessage(sanitizeUserMessage(err?.message || 'Synchronizace selhala.'));
      return null;
    } finally {
      setBusy(false);
      setAutoSyncing(false);
    }
  }, [session?.access_token, busy, historyOpen, loadLatest, loadHistory]);

  useEffect(() => {
    if (session?.access_token) loadLatest(session.access_token);
  }, [session?.access_token, loadLatest]);

  useEffect(() => {
    if (!session?.access_token || !latest?.connected || autoSyncAttempted) return;
    if (!shouldAutoSync(latest.connection)) return;
    setAutoSyncAttempted(true);
    syncNow({ silent: true });
  }, [session?.access_token, latest?.connected, latest?.connection?.last_sync_at, autoSyncAttempted, syncNow]);

  async function startConnect() {
    if (busy) return;
    const authToken = session?.access_token;
    if (!authToken) {
      router.push('/login?redirect=/profil');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/withings/connect?format=json&return_to=/profil', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Nelze spustit propojení Withings.');
      window.location.href = json.url;
    } catch (err) {
      console.error('[WithingsProfileCard] startConnect failed:', err);
      setMessage(sanitizeUserMessage(err?.message || 'Nelze spustit propojení Withings.'));
      setBusy(false);
    }
  }

  function formatHistoryLine(item) {
    const parts = [];
    if (Number.isFinite(item?.weight_kg)) parts.push(`${String(item.weight_kg).replace('.', ',')} kg`);
    if (Number.isFinite(item?.fat_percent)) parts.push(`tuk ${String(item.fat_percent).replace('.', ',')} %`);
    if (Number.isFinite(item?.muscle_mass_kg)) parts.push(`svaly ${String(item.muscle_mass_kg).replace('.', ',')} kg`);
    return parts.length ? parts.join(' · ') : 'Měření bez detailů';
  }

  const widgetState = useMemo(() => resolveWidgetState(latest), [latest]);
  const connected = widgetState === 'connected';
  const oauthReady = widgetState !== 'not_configured';
  const snapshot = useMemo(() => latest?.latest || null, [latest]);
  const trends = useMemo(() => latest?.trends || null, [latest]);
  const recommendations = useMemo(() => latest?.recommendations || null, [latest]);

  const metrics = useMemo(() => {
    const byType = latest?.latest_by_type || {};
    const src = snapshot || {};
    return {
      weight: displayMetric(src.weight_kg ?? byType.weight_kg?.value, ' kg'),
      fat: displayMetric(src.fat_percent ?? byType.fat_ratio_percent?.value, ' %'),
      fatMass: displayMetric(src.fat_mass_kg ?? byType.fat_mass_kg?.value, ' kg'),
      muscle: displayMetric(src.muscle_mass_kg ?? byType.muscle_mass_kg?.value, ' kg'),
      bone: displayMetric(src.bone_mass_kg ?? byType.bone_mass_kg?.value, ' kg'),
      hydration: displayMetric(src.hydration_kg ?? byType.hydration_kg?.value, ' kg'),
      bmi: displayMetric(src.bmi),
      pulse: displayMetric(src.pulse, ' bpm'),
      measuredAt: src.measured_at || byType.weight_kg?.measured_at || byType.fat_ratio_percent?.measured_at || null,
    };
  }, [latest, snapshot]);

  if (!enabled || !host) return null;

  const section = (
    <section className="withings-profile-section" id="telesny-vyvoj" aria-label="Tělesný vývoj z chytré váhy">
      <div className="withings-profile-head">
        <div>
          <p className="withings-eyebrow">Chytrá váha</p>
          <h2>Tělesný vývoj</h2>
          <p className="withings-lead">
            Data z Withings jsou napojená na tvůj profil. Váha se propisuje do hlavních tělesných údajů a trend bude vstup pro další úpravu jídelníčku a tréninku.
          </p>
        </div>
        <div className="withings-head-status">
          {connected ? <span className="withings-badge is-connected">Připojeno</span> : <span className="withings-badge">Nepřipojeno</span>}
          {autoSyncing ? <span className="withings-sync-pill">Automatický sync…</span> : null}
        </div>
      </div>

      {message ? <div className="withings-notice">{message}</div> : null}

      {widgetState === 'not_configured' ? (
        <div className="withings-empty-state">
          <strong>Propojení chytré váhy zatím není aktivní.</strong>
          <span>Zkontroluj produkční nastavení Withings na Vercelu.</span>
        </div>
      ) : widgetState === 'not_connected' ? (
        <div className="withings-empty-state">
          <strong>Propoj Withings účet.</strong>
          <span>Po propojení se v profilu zobrazí váha, tuk, svalová hmota a trend.</span>
        </div>
      ) : (
        <>
          <div className="withings-grid">
            <div><span>Váha</span><strong>{metrics.weight}</strong></div>
            <div><span>Tuk</span><strong>{metrics.fat}</strong></div>
            <div><span>Tuková hmota</span><strong>{metrics.fatMass}</strong></div>
            <div><span>Svalová hmota</span><strong>{metrics.muscle}</strong></div>
            <div><span>Kostní hmota</span><strong>{metrics.bone}</strong></div>
            <div><span>Hydratace</span><strong>{metrics.hydration}</strong></div>
            <div><span>BMI</span><strong>{metrics.bmi}</strong></div>
            <div><span>Poslední měření</span><strong>{formatDateTime(metrics.measuredAt || latest?.connection?.last_sync_at)}</strong></div>
          </div>

          <div className="withings-profile-insights">
            <div className="withings-trends">
              <p className="withings-section-title">Trend</p>
              {!trends?.hasEnoughData ? (
                <p className="withings-sub">{trends?.message || 'Trend spočítáme po dalších měřeních.'}</p>
              ) : (
                <div className="withings-trend-grid">
                  <div><span>Od minula</span><strong>{formatTrendDelta(trends?.delta?.weight_kg, ' kg')}</strong></div>
                  <div><span>7 dní</span><strong>{formatTrendDelta(trends?.trend7d?.weight_kg, ' kg')}</strong></div>
                  <div><span>30 dní</span><strong>{formatTrendDelta(trends?.trend30d?.weight_kg, ' kg')}</strong></div>
                  <div><span>Tuk 7 dní</span><strong>{formatTrendDelta(trends?.trend7d?.fat_percent, ' %')}</strong></div>
                </div>
              )}
            </div>

            <div className="withings-plan-bridge">
              <p className="withings-section-title">Vliv na plán</p>
              <p>
                Aktuální měření se použije jako kontext pro další plán. Jídelníček nebudeme měnit automaticky po jednom měření — nejdřív vyhodnotíme trend a návrh úpravy se má schválit.
              </p>
              {recommendations?.summary ? <strong>{recommendations.summary}</strong> : null}
            </div>
          </div>
        </>
      )}

      <div className="withings-actions">
        {connected ? (
          <button type="button" onClick={() => syncNow({ silent: false })} disabled={busy} className="withings-primary">Synchronizovat teď</button>
        ) : (
          <button type="button" onClick={startConnect} disabled={busy || !oauthReady} className="withings-primary">Propojit Withings</button>
        )}
        {connected ? <button type="button" onClick={startConnect} disabled={busy} className="secondary">Znovu propojit</button> : null}
        {connected ? <button type="button" onClick={() => loadHistory()} disabled={busy || historyLoading} className="secondary">Historie</button> : null}
      </div>

      {historyOpen ? (
        <div className="withings-history">
          <p className="withings-history-title">Historie měření</p>
          {historyLoading ? <p className="withings-history-empty">Načítám historii…</p> : null}
          {!historyLoading && historyMessage ? <p className="withings-history-empty">{historyMessage}</p> : null}
          {!historyLoading && historyItems.length ? (
            <ul className="withings-history-list">
              {historyItems.map((item) => (
                <li key={`${item.measured_at}-${item.weight_kg || 'x'}`}>
                  <strong>{formatDateTime(item.measured_at)}</strong>
                  <span>{formatHistoryLine(item)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <style jsx>{`
        .withings-profile-section {
          max-width: 1180px;
          margin: 18px auto 26px;
          padding: 22px;
          border-radius: 28px;
          color: #fff;
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.16), rgba(15, 23, 42, 0.94));
          border: 1px solid rgba(56, 189, 248, 0.32);
          box-shadow: 0 20px 70px rgba(2, 6, 23, 0.24);
        }
        .withings-profile-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
        }
        .withings-eyebrow {
          margin: 0 0 6px;
          color: #7dd3fc;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        h2 {
          margin: 0 0 8px;
          font-size: clamp(24px, 3vw, 34px);
        }
        .withings-lead,
        .withings-sub,
        .withings-plan-bridge p,
        .withings-empty-state span {
          margin: 0;
          color: rgba(255,255,255,.74);
          line-height: 1.55;
        }
        .withings-head-status {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }
        .withings-badge,
        .withings-sync-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 7px 11px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
          background: rgba(148,163,184,.18);
          color: rgba(255,255,255,.8);
        }
        .withings-badge.is-connected {
          background: rgba(34,197,94,.18);
          color: #86efac;
        }
        .withings-sync-pill {
          background: rgba(56,189,248,.14);
          color: #bae6fd;
        }
        .withings-notice,
        .withings-empty-state {
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(56,189,248,.12);
          border: 1px solid rgba(56,189,248,.24);
        }
        .withings-empty-state strong {
          display: block;
          margin-bottom: 4px;
        }
        .withings-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 18px;
        }
        .withings-grid div,
        .withings-trend-grid div,
        .withings-plan-bridge,
        .withings-history-list li {
          border-radius: 18px;
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.1);
        }
        .withings-grid div {
          padding: 15px;
        }
        .withings-grid span,
        .withings-trend-grid span {
          display: block;
          color: rgba(255,255,255,.58);
          font-size: 12px;
          margin-bottom: 6px;
        }
        .withings-grid strong {
          font-size: 22px;
        }
        .withings-profile-insights {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
          gap: 14px;
          margin-top: 18px;
        }
        .withings-section-title {
          margin: 0 0 10px;
          color: rgba(255,255,255,.72);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .withings-trends,
        .withings-plan-bridge {
          padding: 16px;
        }
        .withings-trend-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .withings-trend-grid div {
          padding: 11px 12px;
        }
        .withings-plan-bridge strong {
          display: block;
          margin-top: 10px;
          color: #fff;
        }
        .withings-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
        }
        .withings-actions button {
          border: 0;
          border-radius: 999px;
          min-height: 42px;
          padding: 10px 15px;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
        }
        .withings-primary {
          background: linear-gradient(135deg, #0EA5E9 0%, #A78BFA 100%);
        }
        .withings-actions button.secondary {
          background: rgba(255,255,255,.12);
        }
        .withings-actions button:disabled {
          opacity: .48;
          cursor: not-allowed;
        }
        .withings-history {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid rgba(255,255,255,.12);
        }
        .withings-history-title {
          margin: 0 0 10px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: rgba(255,255,255,.72);
        }
        .withings-history-empty {
          margin: 0;
          color: rgba(255,255,255,.72);
          font-size: 13px;
        }
        .withings-history-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 8px;
        }
        .withings-history-list li {
          padding: 10px 12px;
        }
        .withings-history-list strong {
          display: block;
          margin-bottom: 4px;
          color: rgba(255,255,255,.62);
          font-size: 12px;
        }
        .withings-history-list span {
          display: block;
          color: rgba(255,255,255,.86);
          font-size: 14px;
        }
        @media (max-width: 900px) {
          .withings-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .withings-profile-insights {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 560px) {
          .withings-profile-section {
            margin: 14px 12px 22px;
            padding: 18px;
          }
          .withings-profile-head {
            flex-direction: column;
          }
          .withings-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );

  return createPortal(section, host);
}
