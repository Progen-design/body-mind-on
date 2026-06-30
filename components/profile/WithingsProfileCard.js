// /components/profile/WithingsProfileCard.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

function useProfilePortalTarget(enabled) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    let holder = null;
    const mount = () => {
      const anchor = document.querySelector('.profile-membership-plan-card');
      const fallback = document.querySelector('main.page');
      const parent = anchor?.parentElement || fallback;
      if (!parent) return false;
      holder = document.getElementById('withings-profile-card-portal');
      if (!holder) {
        holder = document.createElement('div');
        holder.id = 'withings-profile-card-portal';
        if (anchor?.parentElement) anchor.insertAdjacentElement('afterend', holder);
        else parent.prepend(holder);
      }
      setTarget(holder);
      return true;
    };
    if (mount()) return undefined;
    const interval = window.setInterval(() => {
      if (mount()) window.clearInterval(interval);
    }, 250);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 6000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [enabled]);

  return target;
}

export default function WithingsProfileCard() {
  const router = useRouter();
  const enabled = router.pathname === '/profil';
  const target = useProfilePortalTarget(enabled);
  const [session, setSession] = useState(null);
  const [latest, setLatest] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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

  if (!enabled || !target) return null;
  const connected = latest?.connected === true;

  return createPortal(
    <section className="withings-profile-card" aria-label="Withings chytrá váha">
      <div className="withings-profile-card__head">
        <div>
          <p className="withings-profile-card__eyebrow">Chytrá váha</p>
          <h2>Withings v profilu</h2>
          <p>Automaticky načítej váhu, tuk a svalovou hmotu do svého progresu.</p>
        </div>
        <span className={`withings-profile-card__badge ${connected ? 'is-connected' : ''}`}>{connected ? 'Propojeno' : 'Nepřipojeno'}</span>
      </div>

      {message ? <div className="withings-profile-card__notice">{message}</div> : null}

      <div className="withings-profile-card__grid">
        <div><span>Váha</span><strong>{metrics.weight ? `${metrics.weight} kg` : '—'}</strong></div>
        <div><span>Tuk</span><strong>{metrics.fat ? `${metrics.fat} %` : '—'}</strong></div>
        <div><span>Svaly</span><strong>{metrics.muscle ? `${metrics.muscle} kg` : '—'}</strong></div>
        <div><span>Poslední měření</span><strong>{formatDateTime(metrics.measuredAt || latest?.connection?.last_sync_at)}</strong></div>
      </div>

      {latest?.connection?.last_sync_error ? <div className="withings-profile-card__notice">Poslední chyba syncu: {latest.connection.last_sync_error}</div> : null}

      <div className="withings-profile-card__actions">
        <button type="button" onClick={startConnect} disabled={busy}>{connected ? 'Znovu propojit Withings' : 'Propojit Withings'}</button>
        <button type="button" onClick={() => syncNow(false)} disabled={busy || !connected} className="secondary">Synchronizovat teď</button>
        <button type="button" onClick={() => syncNow(true)} disabled={busy || !connected} className="secondary">Načíst historii</button>
      </div>

      <style jsx>{`
        .withings-profile-card { max-width: 1180px; margin: 18px auto 26px; padding: 22px; border-radius: 28px; color: #fff; background: linear-gradient(135deg, rgba(14,165,233,.18), rgba(15,23,42,.94)); border: 1px solid rgba(148,163,184,.22); box-shadow: 0 20px 70px rgba(2,6,23,.24); }
        .withings-profile-card__head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
        .withings-profile-card__eyebrow { margin: 0 0 6px; color: #38bdf8; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
        h2 { margin: 0 0 8px; font-size: clamp(24px, 3vw, 34px); }
        p { margin: 0; color: rgba(255,255,255,.72); line-height: 1.5; }
        .withings-profile-card__badge { flex: 0 0 auto; padding: 8px 12px; border-radius: 999px; background: rgba(148,163,184,.16); color: rgba(255,255,255,.78); font-weight: 800; font-size: 13px; }
        .withings-profile-card__badge.is-connected { background: rgba(34,197,94,.18); color: #86efac; }
        .withings-profile-card__notice { margin-top: 16px; padding: 12px 14px; border-radius: 16px; background: rgba(56,189,248,.12); border: 1px solid rgba(56,189,248,.24); color: rgba(255,255,255,.86); }
        .withings-profile-card__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
        .withings-profile-card__grid div { padding: 16px; border-radius: 20px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1); }
        .withings-profile-card__grid span { display: block; color: rgba(255,255,255,.58); font-size: 13px; margin-bottom: 8px; }
        .withings-profile-card__grid strong { font-size: 20px; }
        .withings-profile-card__actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
        button { border: 0; border-radius: 999px; padding: 11px 16px; background: linear-gradient(135deg, #0ea5e9, #22c55e); color: #fff; font-weight: 800; cursor: pointer; }
        button.secondary { background: rgba(255,255,255,.11); }
        button:disabled { opacity: .46; cursor: not-allowed; }
        @media (max-width: 760px) { .withings-profile-card { margin: 14px 12px 22px; padding: 18px; } .withings-profile-card__head { flex-direction: column; } .withings-profile-card__grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 460px) { .withings-profile-card__grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>,
    target
  );
}
