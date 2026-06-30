// /components/profile/WithingsProfileCard.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

const COLLAPSED_STORAGE_KEY = 'bm-withings-widget-collapsed';

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatNumber(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits).replace('.', ',') : null;
}

function readCollapsedPreference() {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

function persistCollapsedPreference(collapsed) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

function sanitizeUserMessage(message) {
  const text = String(message || '').trim();
  if (!text) return '';
  const technical = /oauth|klientsk|dashboard|env|config|token|redirect uri|šifrovac/i.test(text);
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

export default function WithingsProfileCard() {
  const router = useRouter();
  const enabled = router.pathname === '/profil';
  const [session, setSession] = useState(null);
  const [latest, setLatest] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
    setHydrated(true);
  }, []);

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
    if (!authToken) return;
    try {
      const res = await fetch('/api/withings/latest', { headers: { Authorization: `Bearer ${authToken}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Nelze načíst stav chytré váhy.');
      setLatest(json);
    } catch (err) {
      console.error('[WithingsProfileCard] loadLatest failed:', err);
      setMessage(sanitizeUserMessage(err?.message || 'Nelze načíst stav chytré váhy.'));
    }
  }, []);

  useEffect(() => {
    if (session?.access_token) loadLatest(session.access_token);
  }, [session?.access_token, loadLatest]);

  const widgetState = useMemo(() => resolveWidgetState(latest), [latest]);
  const connected = widgetState === 'connected';
  const oauthReady = widgetState !== 'not_configured';

  const metrics = useMemo(() => {
    const byType = latest?.latest_by_type || {};
    return {
      weight: formatNumber(byType.weight_kg?.value ?? latest?.latest_weight_kg),
      fat: formatNumber(byType.fat_ratio_percent?.value),
      muscle: formatNumber(byType.muscle_mass_kg?.value),
      measuredAt: byType.weight_kg?.measured_at || byType.fat_ratio_percent?.measured_at || byType.muscle_mass_kg?.measured_at || null,
    };
  }, [latest]);

  const launcherLabel = connected ? 'Váha · Připojeno' : 'Váha';

  function setCollapsedState(nextCollapsed) {
    setCollapsed(nextCollapsed);
    persistCollapsedPreference(nextCollapsed);
  }

  function expandCard() {
    setCollapsedState(false);
  }

  function hideCard() {
    setMessage('');
    setCollapsedState(true);
  }

  async function startConnect() {
    if (!oauthReady || busy) return;
    const authToken = session?.access_token;
    if (!authToken) {
      router.push('/login?redirect=/profil');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/withings/auth?format=json&return_to=/profil', { headers: { Authorization: `Bearer ${authToken}` } });
      const json = await res.json();
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Nelze spustit propojení Withings.');
      window.location.href = json.url;
    } catch (err) {
      console.error('[WithingsProfileCard] startConnect failed:', err);
      setMessage(sanitizeUserMessage(err?.message || 'Nelze spustit propojení Withings.'));
      setBusy(false);
    }
  }

  async function syncNow(full = false) {
    const authToken = session?.access_token;
    if (!authToken || busy || !connected) return;
    setBusy(true);
    setMessage('Synchronizuji data…');
    try {
      const res = await fetch(`/api/withings/sync${full ? '?full=1' : ''}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ full }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Synchronizace selhala.');
      setMessage(`Hotovo. Uloženo ${json.measurements_stored || 0} měření.`);
      await loadLatest(authToken);
    } catch (err) {
      console.error('[WithingsProfileCard] syncNow failed:', err);
      setMessage(sanitizeUserMessage(err?.message || 'Synchronizace selhala.'));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled || !hydrated) return null;

  return (
    <aside
      className={`withings-floating-card ${collapsed ? 'is-collapsed' : 'is-expanded'} withings-state-${widgetState}`}
      aria-label="Chytrá váha"
      data-withings-state={widgetState}
      data-withings-collapsed={collapsed ? '1' : '0'}
    >
      {collapsed ? (
        <button type="button" className="withings-launcher" onClick={expandCard} aria-expanded="false">
          {launcherLabel}
        </button>
      ) : (
        <div className="withings-panel" role="dialog" aria-modal="true" aria-label="Chytrá váha">
          <div className="withings-panel-head">
            <div>
              <p className="withings-eyebrow">Chytrá váha</p>
              <h2>Withings</h2>
            </div>
            <button type="button" className="withings-close" onClick={hideCard} aria-label="Skrýt">
              Skrýt
            </button>
          </div>

          {widgetState === 'not_configured' ? (
            <>
              <p className="withings-lead">Chytrá váha zatím není aktivní.</p>
              <p className="withings-sub">Propojení s Withings připravujeme. Jakmile bude dostupné, půjde váhu propojit přímo z profilu.</p>
            </>
          ) : widgetState === 'not_connected' ? (
            <>
              <p className="withings-lead">Propoj chytrou váhu s profilem.</p>
              <p className="withings-sub">Po propojení uvidíš poslední měření váhy, tuku a svalů.</p>
            </>
          ) : (
            <>
              <p className="withings-lead">Poslední měření z chytré váhy.</p>
              <span className="withings-badge is-connected">Propojeno</span>
            </>
          )}

          {message ? <div className="withings-notice">{message}</div> : null}

          {connected ? (
            <div className="withings-grid">
              <div><span>Váha</span><strong>{metrics.weight ? `${metrics.weight} kg` : '—'}</strong></div>
              <div><span>Tuk</span><strong>{metrics.fat ? `${metrics.fat} %` : '—'}</strong></div>
              <div><span>Svaly</span><strong>{metrics.muscle ? `${metrics.muscle} kg` : '—'}</strong></div>
              <div><span>Měření</span><strong>{formatDateTime(metrics.measuredAt || latest?.connection?.last_sync_at)}</strong></div>
            </div>
          ) : null}

          <div className="withings-actions">
            {widgetState === 'not_configured' ? (
              <button type="button" disabled className="withings-primary">Připravujeme</button>
            ) : (
              <button type="button" onClick={startConnect} disabled={busy || !oauthReady} className="withings-primary">
                {connected ? 'Znovu propojit' : 'Propojit Withings'}
              </button>
            )}
            {oauthReady ? (
              <>
                <button type="button" onClick={() => syncNow(false)} disabled={busy || !connected} className="secondary">Sync teď</button>
                <button type="button" onClick={() => syncNow(true)} disabled={busy || !connected} className="secondary">Historie</button>
              </>
            ) : null}
          </div>
        </div>
      )}
      <style jsx>{`
        .withings-floating-card {
          position: fixed;
          right: 18px;
          bottom: max(18px, env(safe-area-inset-bottom));
          z-index: 1200;
          pointer-events: none;
        }
        .withings-floating-card.is-collapsed {
          width: auto;
        }
        .withings-floating-card.is-expanded {
          width: min(400px, calc(100vw - 24px));
          max-height: min(80vh, calc(100dvh - 24px));
          pointer-events: auto;
        }
        .withings-launcher {
          pointer-events: auto;
          border: 1px solid rgba(56, 189, 248, 0.45);
          border-radius: 999px;
          padding: 10px 14px;
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.95), rgba(34, 197, 94, 0.92));
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 10px 28px rgba(2, 6, 23, 0.35);
        }
        .withings-panel {
          pointer-events: auto;
          display: flex;
          flex-direction: column;
          max-height: inherit;
          padding: 16px;
          border-radius: 20px;
          color: #fff;
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.22), rgba(15, 23, 42, 0.98));
          border: 1px solid rgba(56, 189, 248, 0.38);
          box-shadow: 0 20px 60px rgba(2, 6, 23, 0.5);
          backdrop-filter: blur(16px);
          overflow: hidden;
        }
        .withings-panel-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .withings-eyebrow {
          margin: 0 0 4px;
          color: #7dd3fc;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        h2 {
          margin: 0;
          font-size: 22px;
        }
        .withings-lead {
          margin: 0 0 6px;
          color: rgba(255, 255, 255, 0.92);
          line-height: 1.45;
          font-weight: 700;
        }
        .withings-sub {
          margin: 0;
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.45;
          font-size: 14px;
        }
        .withings-close {
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 999px;
          padding: 7px 12px;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          font-weight: 800;
          cursor: pointer;
          flex-shrink: 0;
        }
        .withings-badge {
          display: inline-block;
          margin-top: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(34, 197, 94, 0.18);
          color: #86efac;
          font-size: 12px;
          font-weight: 900;
        }
        .withings-notice {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(56, 189, 248, 0.12);
          border: 1px solid rgba(56, 189, 248, 0.24);
          font-size: 13px;
        }
        .withings-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
          overflow: auto;
        }
        .withings-grid div {
          padding: 12px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .withings-grid span {
          display: block;
          color: rgba(255, 255, 255, 0.58);
          font-size: 12px;
          margin-bottom: 5px;
        }
        .withings-grid strong {
          font-size: 18px;
        }
        .withings-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
          overflow: auto;
        }
        .withings-actions button {
          border: 0;
          border-radius: 999px;
          padding: 10px 13px;
          background: linear-gradient(135deg, #0ea5e9, #22c55e);
          color: #fff;
          font-weight: 900;
          cursor: pointer;
        }
        .withings-actions button.secondary {
          background: rgba(255, 255, 255, 0.12);
        }
        .withings-actions button:disabled {
          opacity: 0.48;
          cursor: not-allowed;
        }
        @media (max-width: 640px) {
          .withings-floating-card.is-expanded {
            left: 12px;
            right: 12px;
            bottom: max(12px, env(safe-area-inset-bottom));
            width: auto;
            max-width: calc(100vw - 24px);
          }
          .withings-panel {
            max-height: min(80vh, calc(100dvh - 24px));
            overflow: auto;
          }
        }
      `}</style>
    </aside>
  );
}
