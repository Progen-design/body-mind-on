// /pages/login.js – Přihlášení do profilu (e-mail + heslo z registrace)
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCheckingSession(false);
      if (session) router.replace('/profil');
    }).catch(() => setCheckingSession(false));
  }, [router]);

  // Chyba z Supabase při vypršeném odkazu na potvrzení e-mailu (např. po registraci trenéra)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const error = params.get('error');
    const code = params.get('error_code');
    const desc = params.get('error_description') || '';
    if (error === 'access_denied' && (code === 'otp_expired' || desc.includes('expired') || desc.includes('invalid'))) {
      setMessage('Odkaz pro potvrzení e-mailu vypršel nebo byl již použit. Přihlas se níže e-mailem a heslem (účet už existuje), nebo se zaregistruj znovu na stránce Pro trenéry.');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      // Po přihlášení necháme Supabase uložit session, pak přesměrujeme
      if (data?.session) {
        await new Promise((r) => setTimeout(r, 100));
        router.replace('/profil');
      } else {
        setMessage('Přihlášení se nepodařilo. Zkus to znovu.');
      }
    } catch (err) {
      const msg = err?.message || '';
      if (msg === 'Invalid login credentials' || msg.includes('invalid') || msg.includes('credentials')) {
        setMessage('Nesprávný e-mail nebo heslo.');
      } else if (msg.includes('Supabase není nakonfigurován')) {
        setMessage('Aplikace nemá nastavené připojení k databázi. Kontaktuj provozovatele.');
      } else {
        setMessage(msg || 'Přihlášení se nepodařilo.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <>
        <Header />
        <main className="container" style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px', textAlign: 'center' }}>
          <p className="muted">Načítám…</p>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="container" style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
        <h1 style={{ marginBottom: 8 }}>Přihlášení</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Zadej e-mail a heslo, které máš z registrace (poslali jsme ti je e-mailem).
        </p>
        <form onSubmit={handleSubmit} className="form">
          <div>
            <label className="label block mb-2 text-gray-400">E-mail</label>
            <input
              type="email"
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jan@example.com"
              required
            />
          </div>
          <div>
            <label className="label block mb-2 text-gray-400">Heslo</label>
            <input
              type="password"
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="btn submit" disabled={loading}>
            {loading ? 'Přihlašuji…' : 'Přihlásit se'}
          </button>
          {message && <p style={{ color: 'var(--error, #e74c3c)', marginTop: 12 }}>{message}</p>}
        </form>
        <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
          Nemáš účet? <Link href="/start">Registruj se ve START programu</Link> – dostaneš plán a přihlašovací údaje e-mailem.
        </p>
      </main>
      <Footer />
    </>
  );
}
