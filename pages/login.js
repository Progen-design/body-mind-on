// /pages/login.js – Přihlášení do profilu (e-mail + heslo z registrace)
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../lib/supabaseClient';
import { getPublicMainSiteUrl } from '../lib/siteUrls';

const MAIN_SITE = getPublicMainSiteUrl();

function mapAuthErrorToCzechMessage(raw) {
  const msg = String(raw || '');
  const lower = msg.toLowerCase();
  if (lower.includes('legacy api keys are disabled')) {
    return 'Přihlášení je teď dočasně nedostupné. Zkus to prosím za chvíli znovu.';
  }
  if (msg === 'Invalid login credentials' || lower.includes('invalid') || lower.includes('credentials')) {
    return 'Nesprávný e-mail nebo heslo.';
  }
  if (lower.includes('supabase není nakonfigurován')) {
    return 'Aplikace nemá nastavené připojení k databázi. Kontaktuj provozovatele.';
  }
  return msg || 'Přihlášení se nepodařilo.';
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  const redirectTo = (router.query.redirect && typeof router.query.redirect === 'string' && router.query.redirect.startsWith('/'))
    ? router.query.redirect
    : '/profil';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCheckingSession(false);
      if (session) router.replace(redirectTo, undefined, { scroll: true });
    }).catch(() => setCheckingSession(false));
  }, [router, redirectTo]);

  useEffect(() => {
    if (typeof router.query.email === 'string' && router.query.email.trim()) {
      setEmail(router.query.email.trim().toLowerCase());
    }
  }, [router.query.email]);

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
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        router.replace(redirectTo, undefined, { scroll: true });
      } else {
        setMessage('Přihlášení se nepodařilo. Zkus to znovu.');
      }
    } catch (err) {
      setMessage(mapAuthErrorToCzechMessage(err?.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage('Nejdřív zadej svůj e-mail a potom klikni na Zapomenuté heslo.');
      return;
    }
    setResetLoading(true);
    setMessage('');
    try {
      const redirectToReset = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        redirectToReset ? { redirectTo: redirectToReset } : undefined
      );
      if (error) throw error;
      setMessage('Odkaz pro obnovení hesla jsme poslali na tvůj e-mail.');
    } catch (err) {
      setMessage(mapAuthErrorToCzechMessage(err?.message) || 'Nepodařilo se odeslat e-mail pro obnovu hesla.');
    } finally {
      setResetLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <>
        <Header />
        <main className="login-page app-page">
          <div className="login-bg-decor" aria-hidden>
            <span className="login-bg-orb login-bg-orb--top" />
            <span className="login-bg-orb login-bg-orb--bottom" />
          </div>
          <div className="login-shell">
            <div className="login-top-links">
              <a href={MAIN_SITE} className="login-top-link">Hlavní stránka</a>
              <span className="login-top-sep">·</span>
              <Link href="/start" className="login-top-link">Registrace (START)</Link>
              <span className="login-top-sep">·</span>
              <Link href="/on-club" className="login-top-link">ON Club</Link>
            </div>
            <div className="login-hero">
              <h2 className="login-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
              <p className="login-hero-sub">Zapni své tělo i mysl a pokračuj ve svém plánu.</p>
            </div>
            <div className="login-content">
              <p className="login-loading">Načítám…</p>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="login-page app-page">
        <div className="login-bg-decor" aria-hidden>
          <span className="login-bg-orb login-bg-orb--top" />
          <span className="login-bg-orb login-bg-orb--bottom" />
        </div>
        <div className="login-shell">
          <div className="login-top-links">
            <a href={MAIN_SITE} className="login-top-link">Hlavní stránka</a>
            <span className="login-top-sep">·</span>
            <Link href="/start" className="login-top-link">Registrace (START)</Link>
            <span className="login-top-sep">·</span>
            <Link href="/on-club" className="login-top-link">ON Club</Link>
          </div>
          <div className="login-hero">
            <h2 className="login-hero-title">Tvůj osobní AI plán Body & Mind ON</h2>
            <p className="login-hero-sub">Zapni své tělo i mysl a pokračuj ve svém plánu.</p>
          </div>
          <div className="login-content">
            {router.query.registered === '1' && (
              <div className="login-registered-msg">
                Registrace dokončena. Přihlas se stejným e-mailem a heslem, které jsi zadal při registraci. Odkaz na plán a přístup do profilu najdeš také v e-mailu.
              </div>
            )}
            <p className="login-hint">
              Zadej stejný e-mail a heslo, které jsi použil při registraci.
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
              <button type="button" className="login-forgot" onClick={handleForgotPassword} disabled={resetLoading || loading}>
                {resetLoading ? 'Odesílám odkaz…' : 'Zapomenuté heslo?'}
              </button>
              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Přihlašuji…' : 'Přihlásit se'}
              </button>
              {message && <p className="login-error" role="alert">{message}</p>}
            </form>
            <p className="login-register-hint">
              Ještě nemáš účet?{' '}
              <Link href="/start">Vytvořit účet a plán (START)</Link>
              {' · '}
              <Link href="/on-club">ON Club</Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          padding: 24px 20px 100px;
          color: #fff;
          font-family: Inter, sans-serif;
          position: relative;
          overflow: hidden;
        }
        .login-bg-decor {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-color: #0a0a0f;
          background-image:
            linear-gradient(180deg, rgba(10, 10, 15, 0.82) 0%, rgba(10, 10, 15, 0.7) 45%, rgba(10, 10, 15, 0.82) 100%),
            url('https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1920&q=80');
          background-size: cover;
          background-position: center;
        }
        .login-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          opacity: 0.28;
        }
        .login-bg-orb--top {
          width: 420px;
          height: 420px;
          top: -140px;
          right: -100px;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.7) 0%, transparent 70%);
        }
        .login-bg-orb--bottom {
          width: 360px;
          height: 360px;
          bottom: -120px;
          left: -80px;
          background: radial-gradient(circle, rgba(34, 211, 238, 0.38) 0%, transparent 72%);
        }
        .login-shell {
          position: relative;
          z-index: 1;
          max-width: 1080px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: 22px;
          align-items: stretch;
        }
        .login-top-links {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: -8px;
          font-size: 14px;
        }
        .login-top-link {
          color: #c4b5fd;
          text-decoration: none;
          font-weight: 500;
        }
        .login-top-link:hover {
          color: #e9d5ff;
          text-decoration: underline;
        }
        .login-top-sep {
          color: #64748b;
          font-weight: 400;
        }
        .login-hero,
        .login-content {
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: linear-gradient(145deg, rgba(20, 25, 40, 0.72), rgba(32, 28, 56, 0.58));
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
        }
        .login-hero {
          padding: 34px 30px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .login-hero-title {
          margin: 0 0 14px;
          font-size: clamp(24px, 4vw, 36px);
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.02em;
          text-shadow: 0 2px 20px rgba(0, 0, 0, 0.35);
        }
        .login-hero-sub {
          margin: 0;
          color: #cbd5e1;
          font-size: 16px;
          line-height: 1.5;
          max-width: 40ch;
        }
        .login-content {
          padding: 28px 24px;
          max-width: 460px;
          width: 100%;
          justify-self: end;
        }
        .login-loading {
          text-align: center;
          color: #cbd5e1;
          margin: 0;
          font-size: 16px;
        }
        .login-registered-msg {
          margin-bottom: 18px;
          padding: 14px;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.4);
          border-radius: 12px;
          color: #86efac;
          font-size: 14px;
          line-height: 1.5;
        }
        .login-hint {
          color: #cbd5e1;
          margin: 0 0 18px;
          font-size: 14px;
          line-height: 1.5;
        }
        .login-form {
          display: grid;
          gap: 16px;
        }
        .login-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .login-label {
          font-size: 13px;
          color: #cbd5e1;
          font-weight: 500;
        }
        .login-input {
          width: 100%;
          padding: 13px 14px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.55);
          color: #fff;
          font-size: 16px;
          box-sizing: border-box;
        }
        .login-input::placeholder {
          color: #94a3b8;
        }
        .login-input:focus {
          outline: none;
          border-color: rgba(139, 92, 246, 0.8);
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.22);
        }
        .login-submit {
          margin-top: 4px;
          padding: 14px 24px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #10b981, #14b8a6);
          color: #052e2b;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s, filter 0.2s;
        }
        .login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }
        .login-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .login-forgot {
          justify-self: start;
          border: none;
          background: none;
          color: #c4b5fd;
          font-size: 13px;
          font-weight: 600;
          text-decoration: underline;
          text-underline-offset: 2px;
          cursor: pointer;
          padding: 0;
          margin-top: -2px;
        }
        .login-forgot:hover:not(:disabled) {
          color: #e9d5ff;
        }
        .login-forgot:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .login-error {
          color: #fecaca;
          font-size: 14px;
          margin: 0;
          padding: 10px 12px;
          background: rgba(239, 68, 68, 0.16);
          border-radius: 10px;
          border: 1px solid rgba(248, 113, 113, 0.4);
        }
        .login-register-hint {
          margin: 18px 0 0;
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.5;
        }
        .login-register-hint :global(a) {
          color: #c4b5fd;
          font-weight: 600;
          text-decoration: none;
        }
        .login-register-hint :global(a:hover) {
          text-decoration: underline;
          color: #e9d5ff;
        }
        @media (max-width: 900px) {
          .login-page {
            padding: 14px 16px 80px;
          }
          .login-shell {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .login-content {
            justify-self: stretch;
            max-width: none;
          }
          .login-hero {
            padding: 24px 20px;
          }
          .login-hero-title {
            font-size: 28px;
          }
        }
      `}</style>
    </>
  );
}
