<<<<<<< HEAD
// /pages/login.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function Login() {
  const router = useRouter();
  const redirectTo = Array.isArray(router.query.redirect) ? router.query.redirect[0] : (router.query.redirect || '/dashboard');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [msgType, setMsgType] = useState('info');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email) {
      setMsg('Zadej e-mailovou adresu.');
      setMsgType('error');
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}${redirectTo}`
        }
      });

      if (error) throw error;

      setSent(true);
      setMsg('Zkontroluj svůj e-mail a klikni na přihlašovací odkaz.');
      setMsgType('success');
    } catch (err) {
      setMsg(err.message || 'Chyba při odesílání přihlašovacího odkazu.');
      setMsgType('error');
=======
// /pages/login.js – Přihlášení do profilu
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
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      router.replace('/profil');
      return;
    } catch (err) {
      setMessage(err?.message === 'Invalid login credentials'
        ? 'Nesprávný e-mail nebo heslo.'
        : (err?.message || 'Přihlášení se nepodařilo.'));
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d
    } finally {
      setLoading(false);
    }
  }

<<<<<<< HEAD
  return (
    <>
      <Header />
      <main className="container">
        <div className="card">
          <h1>Přihlášení</h1>
          <p className="subtitle">
            Zadej svůj e-mail a pošleme ti přihlašovací odkaz.
          </p>

          {!sent ? (
            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jan@example.com"
                  required
                  autoFocus
                />
              </div>

              <button className="btn" type="submit" disabled={loading}>
                {loading ? 'Odesílám...' : 'Odeslat přihlašovací odkaz'}
              </button>

              {msg && (
                <p className={`msg ${msgType}`}>{msg}</p>
              )}
            </form>
          ) : (
            <div className="success-box">
              <div className="icon">✉️</div>
              <h2>Zkontroluj e-mail</h2>
              <p>Odeslali jsme ti přihlašovací odkaz na <strong>{email}</strong>.</p>
              <p className="hint">Odkaz je platný 1 hodinu. Zkontroluj i složku spam.</p>
              <button
                className="btn ghost"
                onClick={() => {
                  setSent(false);
                  setMsg(null);
                  setEmail('');
                }}
              >
                Zkusit jiný e-mail
              </button>
            </div>
          )}

          <div className="divider">
            <span>nebo</span>
          </div>

          <p className="alt-link">
            Nemáš účet? <a href="/start">Začni zdarma</a>
          </p>
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .container {
          max-width: 440px;
          margin: 48px auto;
          padding: 0 16px;
        }

        .card {
          background: #111;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 40px 32px;
        }

        h1 {
          font-size: 28px;
          margin: 0 0 8px 0;
          background: linear-gradient(90deg, #9b5cff, #2ECC71);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .subtitle {
          color: #888;
          margin: 0 0 32px 0;
          font-size: 15px;
        }

        .field {
          margin-bottom: 20px;
        }

        label {
          display: block;
          margin-bottom: 8px;
          color: #bbb;
          font-size: 14px;
        }

        input {
          width: 100%;
          padding: 14px 16px;
          background: #0a0a0a;
          color: #fff;
          border: 1px solid #2a2a2a;
          border-radius: 10px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
        }

        input:focus {
          border-color: #9b5cff;
        }

        .btn {
          width: 100%;
          padding: 14px 16px;
          background: linear-gradient(90deg, #9b5cff, #2ECC71);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.2s;
        }

        .btn:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn.ghost {
          background: transparent;
          border: 1px solid #2a2a2a;
          color: #888;
        }

        .btn.ghost:hover {
          border-color: #9b5cff;
          color: #fff;
        }

        .msg {
          margin-top: 16px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
        }

        .msg.success {
          background: rgba(46, 204, 113, 0.1);
          color: #2ECC71;
          border: 1px solid rgba(46, 204, 113, 0.3);
        }

        .msg.error {
          background: rgba(231, 76, 60, 0.1);
          color: #e74c3c;
          border: 1px solid rgba(231, 76, 60, 0.3);
        }

        .success-box {
          text-align: center;
          padding: 20px 0;
        }

        .success-box .icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .success-box h2 {
          color: #2ECC71;
          margin: 0 0 12px 0;
          font-size: 22px;
        }

        .success-box p {
          color: #ccc;
          margin: 0 0 8px 0;
        }

        .success-box .hint {
          color: #666;
          font-size: 13px;
          margin-bottom: 24px;
        }

        .divider {
          display: flex;
          align-items: center;
          margin: 28px 0;
          color: #444;
          font-size: 13px;
        }

        .divider::before,
        .divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #2a2a2a;
        }

        .divider span {
          padding: 0 16px;
        }

        .alt-link {
          text-align: center;
          color: #666;
          font-size: 14px;
          margin: 0;
        }

        .alt-link a {
          color: #9b5cff;
          text-decoration: none;
        }

        .alt-link a:hover {
          text-decoration: underline;
        }
      `}</style>
=======
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
          {message && <p style={{ color: 'var(--error)', marginTop: 12 }}>{message}</p>}
        </form>
        <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
          Nemáš účet? <Link href="/start">Registruj se ve START programu</Link> – dostaneš plán a přihlašovací údaje e-mailem.
        </p>
      </main>
      <Footer />
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d
    </>
  );
}
