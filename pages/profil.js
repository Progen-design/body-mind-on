// /pages/profil.js – Můj profil: údaje, naměřené hodnoty
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabaseClient';

const LABELS = {
  created_at: 'Datum',
  email: 'E-mail',
  name: 'Jméno',
  gender: 'Pohlaví',
  age: 'Věk',
  height_cm: 'Výška (cm)',
  weight_kg: 'Váha (kg)',
  activity: 'Aktivita',
  stress_level: 'Stres',
  occupation: 'Typ práce',
  goal: 'Cíl',
  freq_choice: 'Frekvence cvičení',
  notes: 'Poznámky',
  program: 'Program',
};

function formatVal(val) {
  if (val == null || val === '') return '—';
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(val).toLocaleDateString('cs-CZ', { dateStyle: 'medium' });
  }
  return String(val);
}

export default function Profil() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) {
        router.replace('/login');
        return;
      }
      setSession(s);
      setEmail(s.user?.email || '');

      fetch('/api/my-metrics', {
        headers: { Authorization: `Bearer ${s.access_token}` },
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.error) setError(json.error);
          else {
            setMetrics(Array.isArray(json.data) ? json.data : []);
            if (json.email) setEmail(json.email);
          }
        })
        .catch(() => setError('Nepodařilo se načíst data'))
        .finally(() => setLoading(false));
    });
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (!session && !loading) return null;

  return (
    <>
      <Header />
      <main className="container" style={{ maxWidth: 900, margin: '32px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>Můj profil</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {email && <span className="muted" style={{ fontSize: 14 }}>{email}</span>}
            <button type="button" onClick={handleLogout} className="ghost" style={{ padding: '8px 14px', fontSize: 14 }}>
              Odhlásit se
            </button>
          </div>
        </div>

        {loading && <p className="muted">Načítám tvé údaje…</p>}
        {error && <p style={{ color: 'var(--error)' }}>{error}</p>}

        {!loading && !error && (
          <>
            <p className="muted" style={{ marginBottom: 24 }}>
              Zde jsou tvoje uložené hodnoty z registrace a dotazníků. Můžeš si je kdykoli prohlédnout.
            </p>

            {metrics.length === 0 ? (
              <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                <p className="muted">Zatím nemáš žádné záznamy.</p>
                <p style={{ marginTop: 12 }}><Link href="/start" className="btn">Vyplnit dotazník / START</Link></p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {metrics.map((row, idx) => (
                  <div key={row.id || idx} className="card" style={{ padding: 20 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--accent)' }}>
                      Záznam z {formatVal(row.created_at)}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 24px' }}>
                      {Object.entries(LABELS).map(([key, label]) => {
                        if (key === 'created_at') return null;
                        const val = row[key];
                        if (val == null && val !== 0) return null;
                        return (
                          <div key={key}>
                            <span className="muted" style={{ fontSize: 12 }}>{label}</span>
                            <div style={{ fontWeight: 500 }}>{formatVal(val)}</div>
                          </div>
                        );
                      })}
                    </div>
                    {row.notes && (
                      <p style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)' }}>
                        <strong>Poznámky:</strong> {row.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
