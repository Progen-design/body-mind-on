// /pages/withings-connect.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabaseClient';

const STATUS_TEXT = {
  connected: 'Withings účet je propojený a první synchronizace proběhla.',
  connected_sync_pending: 'Withings účet je propojený. První synchronizace se nepovedla, spusť ji ručně tlačítkem níže.',
  denied: 'Propojení bylo zrušeno.',
  error: 'Při propojení nastala chyba. Zkontroluj nastavení a zkus to znovu.',
  login_required: 'Nejdřív se přihlas do Body & Mind ON účtu.',
};

export default function WithingsConnectPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [latest, setLatest] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data?.session || null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (router.query.withings) setStatus(String(router.query.withings));
  }, [router.query.withings]);

  useEffect(() => {
    if (!session?.access_token) return;
    loadLatest(session.access_token);
  }, [session?.access_token]);

  async function loadLatest(accessToken) {
    try {
      const res = await fetch('/api/withings/latest', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Nelze načíst stav Withings.');
      setLatest(json);
    } catch (err) {
      setMessage(err?.message || 'Nelze načíst stav Withings.');
    }
  }

  async function startConnect() {
    if (!session?.access_token) {
      router.push('/login?next=/withings-connect');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/withings/auth?format=json&return_to=/withings-connect', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.url) throw new Error(json?.error || 'Nelze spustit Withings propojení.');
      window.location.href = json.url;
    } catch (err) {
      setMessage(err?.message || 'Nelze spustit Withings propojení.');
      setBusy(false);
    }
  }

  async function runSync(full = false) {
    if (!session?.access_token) return;
    setBusy(true);
    setMessage('Synchronizuji Withings data...');
    try {
      const res = await fetch(`/api/withings/sync${full ? '?full=1' : ''}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ full }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Synchronizace selhala.');
      setMessage(`Synchronizace hotová: uloženo ${json.measurements_stored || 0} měření.`);
      await loadLatest(session.access_token);
    } catch (err) {
      setMessage(err?.message || 'Synchronizace selhala.');
    } finally {
      setBusy(false);
    }
  }

  const latestWeight = latest?.latest_weight_kg;
  const connected = latest?.connected === true;

  return (
    <>
      <Header />
      <main className="withings-page">
        <section className="card">
          <p className="eyebrow">Integrace</p>
          <h1>Withings váha</h1>
          <p className="lead">
            Propoj svůj Withings účet a Body & Mind ON bude umět načíst váhu, tuk, svalovou hmotu a další metriky z chytré váhy.
          </p>

          {loading ? <p>Načítám přihlášení...</p> : null}

          {!loading && !session ? (
            <div className="notice">
              <p>Nejdřív se přihlas do svého účtu.</p>
              <a className="btn btn-primary" href="/login?next=/withings-connect">Přihlásit se</a>
            </div>
          ) : null}

          {status ? <div className="notice">{STATUS_TEXT[status] || status}</div> : null}
          {message ? <div className="notice muted">{message}</div> : null}

          {session ? (
            <div className="actions">
              <button className="btn btn-primary" onClick={startConnect} disabled={busy}>
                {connected ? 'Znovu propojit Withings' : 'Propojit Withings'}
              </button>
              <button className="btn btn-secondary" onClick={() => runSync(false)} disabled={busy || !connected}>
                Synchronizovat teď
              </button>
              <button className="btn btn-secondary" onClick={() => runSync(true)} disabled={busy || !connected}>
                Načíst historii
              </button>
            </div>
          ) : null}

          <div className="status-grid">
            <div>
              <span>Stav</span>
              <strong>{connected ? 'Propojeno' : 'Nepřipojeno'}</strong>
            </div>
            <div>
              <span>Poslední váha</span>
              <strong>{Number.isFinite(latestWeight) ? `${latestWeight.toFixed(1)} kg` : '—'}</strong>
            </div>
            <div>
              <span>Poslední sync</span>
              <strong>{latest?.connection?.last_sync_at ? new Date(latest.connection.last_sync_at).toLocaleString('cs-CZ') : '—'}</strong>
            </div>
          </div>

          {latest?.connection?.last_sync_error ? (
            <div className="notice error">Poslední chyba: {latest.connection.last_sync_error}</div>
          ) : null}
        </section>
      </main>
      <Footer />
      <style jsx>{`
        .withings-page {
          min-height: 70vh;
          padding: 48px 20px;
          background: #0f172a;
          color: #fff;
        }
        .card {
          max-width: 880px;
          margin: 0 auto;
          padding: 32px;
          border-radius: 28px;
          background: rgba(15, 23, 42, 0.92);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 24px 80px rgba(0,0,0,0.28);
        }
        .eyebrow { color: #38bdf8; text-transform: uppercase; letter-spacing: .12em; font-size: 12px; font-weight: 700; }
        h1 { margin: 8px 0 12px; font-size: clamp(32px, 5vw, 54px); }
        .lead { max-width: 720px; color: rgba(255,255,255,.78); line-height: 1.6; }
        .actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 28px 0; }
        button { cursor: pointer; }
        button:disabled { opacity: .45; cursor: not-allowed; }
        .notice { margin: 18px 0; padding: 14px 16px; border-radius: 18px; background: rgba(56,189,248,.12); border: 1px solid rgba(56,189,248,.25); }
        .notice.muted { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.12); }
        .notice.error { background: rgba(248,113,113,.12); border-color: rgba(248,113,113,.35); }
        .status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }
        .status-grid div { padding: 18px; border-radius: 20px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1); }
        .status-grid span { display: block; color: rgba(255,255,255,.58); font-size: 13px; margin-bottom: 8px; }
        .status-grid strong { font-size: 20px; }
        @media (max-width: 720px) {
          .card { padding: 24px; }
          .status-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
