// /pages/dashboard.js - Profil přihlášeného uživatele
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      let { data: { session } } = await supabase.auth.getSession();

      if (!session && typeof window !== 'undefined' && window.location.hash) {
        await new Promise(r => setTimeout(r, 500));
        const retry = await supabase.auth.getSession();
        session = retry.data.session;
      }

      if (!mounted) return;

      if (!session?.user) {
        router.replace(`/login?redirect=${encodeURIComponent(router.asPath || '/dashboard')}`);
        return;
      }

      setUser(session.user);

      try {
        const res = await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (!res.ok) {
          if (res.status === 401) {
            router.replace('/login?redirect=/dashboard');
            return;
          }
          throw new Error('Nepodařilo se načíst profil');
        }

        const data = await res.json();
        setProfile(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="container">
          <div className="loading">Načítám profil…</div>
        </main>
        <Footer />
        <style jsx>{`
          .container { max-width: 800px; margin: 48px auto; padding: 0 16px; }
          .loading { color: #888; text-align: center; padding: 48px; }
        `}</style>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="container">
          <div className="error">{error}</div>
        </main>
        <Footer />
        <style jsx>{`
          .container { max-width: 800px; margin: 48px auto; padding: 0 16px; }
          .error { color: #e74c3c; padding: 24px; }
        `}</style>
      </>
    );
  }

  const { body_metrics: metrics = [], plans = [] } = profile || {};

  return (
    <>
      <Header />
      <main className="container">
        <div className="card header-card">
          <div className="user-info">
            <h1>Můj profil</h1>
            <p className="email">{user?.email}</p>
            {user?.user_metadata?.name && (
              <p className="name">{user.user_metadata.name}</p>
            )}
          </div>
          <button onClick={handleLogout} className="btn-logout">Odhlásit se</button>
        </div>

        {metrics.length > 0 && (
          <section className="section">
            <h2>Moje metriky</h2>
            <div className="metrics-grid">
              {metrics.slice(0, 3).map(m => (
                <div key={m.id} className="metric-card">
                  <div className="metric-date">
                    {new Date(m.created_at).toLocaleDateString('cs-CZ')}
                  </div>
                  <div className="metric-row">
                    <span>Váha</span>
                    <strong>{m.weight_kg} kg</strong>
                  </div>
                  <div className="metric-row">
                    <span>Výška</span>
                    <strong>{m.height_cm} cm</strong>
                  </div>
                  <div className="metric-row">
                    <span>Cíl</span>
                    <strong>{m.goal || '—'}</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {plans.length > 0 && (
          <section className="section">
            <h2>Moje plány</h2>
            <div className="plans-list">
              {plans.map(p => (
                <div key={p.id} className="plan-card">
                  <div className="plan-header">
                    <span className="plan-type">{p.plan_type}</span>
                    <span className="plan-date">
                      {new Date(p.created_at).toLocaleDateString('cs-CZ')}
                    </span>
                  </div>
                  {p.daily_calories && (
                    <p className="plan-calories">Kalorie: {p.daily_calories} kcal/den</p>
                  )}
                  {p.macros && (
                    <p className="plan-macros">
                      B: {p.macros.protein_g}g | T: {p.macros.fat_g}g | S: {p.macros.carbs_g}g
                    </p>
                  )}
                  {p.valid_from && p.valid_until && (
                    <p className="plan-valid">
                      Platný: {p.valid_from} – {p.valid_until}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {metrics.length === 0 && plans.length === 0 && (
          <div className="empty-state">
            <p>Zatím nemáš žádné uložené údaje.</p>
            <a href="/start" className="btn-start">Vyplň dotazník a získej plán</a>
          </div>
        )}
      </main>
      <Footer />

      <style jsx>{`
        .container { max-width: 800px; margin: 48px auto; padding: 0 16px 80px; }
        .card { background: #111; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
        .header-card { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
        .user-info h1 {
          font-size: 24px; margin: 0 0 8px 0;
          background: linear-gradient(90deg, #9b5cff, #2ECC71);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .email { color: #888; margin: 0; font-size: 15px; }
        .name { color: #ccc; margin: 4px 0 0 0; }
        .btn-logout {
          background: transparent; border: 1px solid #444; color: #888;
          padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px;
        }
        .btn-logout:hover { border-color: #666; color: #fff; }
        .section h2 { font-size: 18px; margin: 0 0 16px 0; color: #ccc; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
        .metric-card {
          background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px;
        }
        .metric-date { color: #666; font-size: 12px; margin-bottom: 12px; }
        .metric-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
        .metric-row span { color: #888; }
        .plans-list { display: flex; flex-direction: column; gap: 12px; }
        .plan-card {
          background: #0a0a0a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px;
        }
        .plan-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .plan-type { text-transform: capitalize; color: #2ECC71; font-weight: 600; }
        .plan-date { color: #666; font-size: 13px; }
        .plan-calories, .plan-macros, .plan-valid { margin: 4px 0; font-size: 13px; color: #999; }
        .empty-state { text-align: center; padding: 48px 24px; color: #888; }
        .btn-start {
          display: inline-block; margin-top: 16px;
          background: linear-gradient(90deg, #9b5cff, #2ECC71); color: #fff;
          padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600;
        }
        .btn-start:hover { opacity: 0.9; }
      `}</style>
    </>
  );
}
