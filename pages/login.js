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

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      router.replace('/profil');
      return;
    } catch (err) {
      setMessage(err?.message === 'Invalid login credentials'
        ? 'Nesprávný e-mail nebo heslo.'
        : (err?.message || 'Přihlášení se nepodařilo.'));
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
