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

  const redirectTo = (router.query.redirect && typeof router.query.redirect === 'string' && router.query.redirect.startsWith('/'))
    ? router.query.redirect
    : '/profil';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCheckingSession(false);
      if (session) router.replace(redirectTo);
    }).catch(() => setCheckingSession(false));
  }, [router, redirectTo]);

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
        router.replace(redirectTo);
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
        <main className="login-page">
          <div className="login-hero">
            <h2 className="login-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
            <span className="login-hero-badge">Přihlášení</span>
          </div>
          <div className="login-content">
            <p className="login-loading">Načítám…</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="login-page">
        <div className="login-hero">
          <h2 className="login-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
          <span className="login-hero-badge">Přihlášení</span>
        </div>
        <div className="login-content">
          {router.query.registered === '1' && (
            <div className="login-registered-msg">
              Registrace dokončena. Přihlaste se e-mailem a heslem. Odkaz na plán a přístup do profilu najdete také v e-mailu.
            </div>
          )}
          <p className="login-hint">
            Zadej e-mail a heslo, které máš z registrace (poslali jsme ti je e-mailem).
          </p>
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-label">E-mail</label>
              <input
                type="email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jan@example.com"
                required
              />
            </div>
            <div className="login-field">
              <label className="login-label">Heslo</label>
              <input
                type="password"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Přihlašuji…' : 'Přihlásit se'}
            </button>
            {message && <p className="login-error" role="alert">{message}</p>}
          </form>
          <p className="login-footer-hint">
            Nemáš účet? <Link href="/start">Registruj se ve START programu</Link> – dostaneš plán a přihlašovací údaje e-mailem.
          </p>
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          padding: 0 20px 100px;
          background: radial-gradient(circle at 30% 0%, #1c1333, #0b0b15 60%), #0a0a0f;
          color: #fff;
          font-family: Inter, sans-serif;
        }
        .login-hero {
          text-align: center;
          padding: 28px 24px 32px;
          margin: 0 -20px 32px -20px;
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%);
          border-radius: 0 0 20px 20px;
          position: relative;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
        }
        .login-hero::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(167, 139, 250, 0.5), transparent);
        }
        .login-hero-title {
          margin: 0 0 12px;
          font-size: 22px;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);
        }
        .login-hero-badge {
          display: inline-block;
          background: rgba(255, 255, 255, 0.35);
          color: #fff;
          padding: 8px 18px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
        }
        .login-content {
          max-width: 420px;
          margin: 0 auto;
        }
        .login-loading {
          text-align: center;
          color: #94a3b8;
          margin: 0;
        }
        .login-registered-msg {
          margin-bottom: 20px;
          padding: 14px;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.4);
          border-radius: 12px;
          color: #86efac;
          font-size: 14px;
          line-height: 1.5;
        }
        .login-hint {
          color: #94a3b8;
          margin: 0 0 24px;
          font-size: 15px;
          line-height: 1.5;
        }
        .login-form {
          display: grid;
          gap: 18px;
        }
        .login-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .login-label {
          font-size: 14px;
          color: #94a3b8;
        }
        .login-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid #334155;
          background: #0f0f1a;
          color: #fff;
          font-size: 16px;
          box-sizing: border-box;
        }
        .login-input::placeholder {
          color: #64748b;
        }
        .login-input:focus {
          outline: none;
          border-color: rgba(139, 92, 255, 0.6);
          box-shadow: 0 0 0 2px rgba(139, 92, 255, 0.2);
        }
        .login-submit {
          margin-top: 8px;
          padding: 14px 24px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .login-submit:hover:not(:disabled) {
          opacity: 0.95;
        }
        .login-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .login-error {
          color: #f87171;
          font-size: 14px;
          margin: 0;
          padding: 10px 12px;
          background: rgba(239, 68, 68, 0.15);
          border-radius: 8px;
        }
        .login-footer-hint {
          margin-top: 24px;
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.5;
        }
        .login-footer-hint a {
          color: #a78bfa;
          text-decoration: underline;
        }
        .login-footer-hint a:hover {
          color: #c4b5fd;
        }
      `}</style>
    </>
  );
}
