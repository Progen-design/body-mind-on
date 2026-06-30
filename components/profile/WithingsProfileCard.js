// /components/profile/WithingsProfileCard.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

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

export default function WithingsProfileCard() {
  const router = useRouter();
  const enabled = router.pathname === '/profil';
  const [session, setSession] = useState(null);
  const [latest, setLatest] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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
      if (!res.ok) throw new Error(json?.error || 'Nelze načíst stav Withings.');
      setLatest(json);
    } catch (err) {
      setMessage(err?.message || 'Nelze načíst stav Withings.');
    }
  }, []);

  useEffect(() => {
    if (session?.access_token) loadLatest(session.access_token);
  }, [session?.access_token, loadLatest]);

  const metrics = useMemo(() => {
    const byType = latest?.latest_by_type || {};
    return {
      weight: formatNumber(byType.weight_kg?.value ?? latest?.latest_weight_kg),
      fat: formatNumber(byType.fat_ratio_percent?.value),
      muscle: formatNumber(byType.muscle_mass_kg?.value),
      measuredAt: byType.weight_kg?.measured_at || byType.fat_ratio_percent?.measured_at || byType.muscle_mass_kg?.measured_at || null,
    };
  }, [latest]);

  async function startConnect() {
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
      setMessage(err?.message || 'Nelze spustit propojení Withings.');
      setBusy(false);
    }
  }

  async function syncNow(full = false) {
    const authToken = session?.access_token;
    if (!authToken || busy) return;
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
      setMessage(err?.message || 'Synchronizace selhala.');
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;
  const connected = latest?.connected === true;

  return (
    <aside className={`withings-floating-card ${collapsed ? 'is-collapsed' : ''}`} aria-label="Withings chytrá váha">
      <button type="button" className="withings-toggle" onClick={() => setCollapsed((v) => !v)}>
        {collapsed ? '⚖️ Withings' : 'Skrýt'}
      </button>
      {!collapsed && (
        <>
          <div className="withings-head">
            <div>
              <p className="withings-eyebrow">Chytrá váha</p>
              <h2>Withings</h2>
              <p>Napoj váhu na profil a načti poslední měření.</p>
            </div>
            <span className={`withings-badge ${connected ? 'is-connected' : ''}`}>{connected ? 'Propojeno' : 'Nepřipojeno'}</span>
          </div>

          {message ? <div className="withings-notice">{message}</div> : null}

          <div className="withings-grid">
            <div><span>Váha</span><strong>{metrics.weight ? `${metrics.weight} kg` : '—'}</strong></div>
            <div><span>Tuk</span><strong>{metrics.fat ? `${metrics.fat} %` : '—'}</strong></div>
            <div><span>Svaly</span><strong>{metrics.muscle ? `${metrics.muscle} kg` : '—'}</strong></div>
            <div><span>Měření</span><strong>{formatDateTime(metrics.measuredAt || latest?.connection?.last_sync_at)}</strong></div>
          </div>

          {latest?.connection?.last_sync_error ? <div className="withings-notice">Poslední chyba syncu: {latest.connection.last_sync_error}</div> : null}

          <div className="withings-actions">
            <button type="button" onClick={startConnect} disabled={busy}>{connected ? 'Znovu propojit' : 'Propojit Withings'}</button>
            <button type="button" onClick={() => syncNow(false)} disabled={busy || !connected} className="secondary">Sync teď</button>
            <button type="button" onClick={() => syncNow(true)} disabled={busy || !connected} className="secondary">Historie</button>
          </div>
        </>
      )}
      <style jsx>{`
        .withings-floating-card {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 2147483000;
          width: min(430px, calc(100vw - 28px));
          padding: 18px;
          border-radius: 24px;
          color: #fff;
          background: linear-gradient(135deg, rgba(14,165,233,.22), rgba(15,23,42,.98));
          border: 1px solid rgba(56,189,248,.38);
          box-shadow: 0 24px 90px rgba(2,6,23,.58);
          backdrop-filter: blur(16px);
        }
        .withings-floating-card.is-collapsed { width: auto; padding: 0; border-radius: 999px; overflow: hidden; }
        .withings-toggle {
          position: absolute;
          top: 10px;
          right: 10px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 999px;
          padding: 7px 10px;
          background: rgba(255,255,255,.1);
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .withings-floating-card.is-collapsed .withings-toggle { position: static; background: linear-gradient(135deg, #0ea5e9, #22c55e); padding: 12px 16px; }
        .withings-head { display: flex; justify-content: space-between; gap: 16px; padding-right: 68px; }
        .withings-eyebrow { margin: 0 0 4px; color: #7dd3fc; font-size: 11px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; }
        h2 { margin: 0 0 4px; font-size: 28px; }
        p { margin: 0; color: rgba(255,255,255,.74); line-height: 1.4; }
        .withings-badge { height: fit-content; padding: 7px 10px; border-radius: 999px; background: rgba(148,163,184,.17); color: rgba(255,255,255,.8); font-size: 12px; font-weight: 900; }
        .withings-badge.is-connected { background: rgba(34,197,94,.18); color: #86efac; }
        .withings-notice { margin-top: 12px; padding: 10px 12px; border-radius: 14px; background: rgba(56,189,248,.12); border: 1px solid rgba(56,189,248,.24); font-size: 13px; }
        .withings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
        .withings-grid div { padding: 12px; border-radius: 16px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); }
        .withings-grid span { display: block; color: rgba(255,255,255,.58); font-size: 12px; margin-bottom: 5px; }
        .withings-grid strong { font-size: 18px; }
        .withings-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .withings-actions button { border: 0; border-radius: 999px; padding: 10px 13px; background: linear-gradient(135deg, #0ea5e9, #22c55e); color: #fff; font-weight: 900; cursor: pointer; }
        .withings-actions button.secondary { background: rgba(255,255,255,.12); }
        .withings-actions button:disabled { opacity: .48; cursor: not-allowed; }
        @media (max-width: 640px) {
          .withings-floating-card { right: 12px; left: 12px; bottom: 12px; width: auto; }
          .withings-head { padding-right: 62px; }
        }
      `}</style>
    </aside>
  );
}
