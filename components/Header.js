// /components/Header.js – na main doméně marketing, na app registrace/profil; při přihlášení jen Odhlásit se
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const MAIN_SITE = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://bodyandmindon.cz";

export default function Header() {
  const router = useRouter();
  const [isApp, setIsApp] = useState(false);
  const [session, setSession] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "app.bodyandmindon.cz") setIsApp(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setAvatarUrl(null);
      return;
    }
    fetch("/api/profile", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.json())
      .then((data) => setAvatarUrl(data?.user?.avatar_url || null))
      .catch(() => setAvatarUrl(null));
  }, [session?.access_token]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push(isApp ? "/login" : "/");
  }

  const homeHref = isApp ? MAIN_SITE : "/";
  const registraceUrl = "https://bodyandmindon.cz/#card-pnjildktpojs3bo";

  const isRegistrationPage = ["/start", "/on-club", "/chci-vip"].includes(router.pathname);
  const showLoggedInNav = session && !isRegistrationPage;

  return (
    <header className="header">
      <div className="container">
        <a href={homeHref} className="logo">
          <strong>Body & Mind ON</strong>
        </a>
        <nav>
          {showLoggedInNav ? (
            <>
              <Link href="/komunita">Komunita</Link>
              <Link href="/profil" className="nav-profil-link">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="nav-avatar" />
                ) : (
                  <span className="nav-avatar-placeholder" aria-hidden />
                )}
                <span className="nav-profil-text">Profil</span>
              </Link>
              <button type="button" onClick={handleLogout} className="nav-logout">
                Odhlásit se
              </button>
            </>
          ) : (
            <>
              <Link href="/trener">Pro trenéry</Link>
              <a href={registraceUrl} target="_blank" rel="noopener noreferrer">Registrace</a>
              <Link href="/profil">Profil</Link>
              <Link href="/login">Přihlášení</Link>
            </>
          )}
        </nav>
      </div>

      <style jsx>{`
        .header {
          background: linear-gradient(180deg, #1a1625 0%, #0f0d14 100%);
          border-bottom: 1px solid rgba(139, 92, 255, 0.25);
          padding: 14px 24px;
          padding-left: max(16px, env(safe-area-inset-left));
          padding-right: max(16px, env(safe-area-inset-right));
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
        }
        @media (max-width: 640px) {
          .header { padding: 12px 16px; padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); }
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          width: 100%;
        }

        .logo {
          font-size: 1.2rem;
          color: #fff;
          text-decoration: none;
          flex-shrink: 0;
          font-weight: 600;
        }
        @media (max-width: 480px) {
          .logo { font-size: 1rem; }
        }

        nav {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: nowrap;
          white-space: nowrap;
          justify-content: flex-end;
          min-width: 0;
        }
        @media (max-width: 768px) {
          nav {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            padding: 8px 4px 8px 8px;
            margin: -8px -4px -8px -8px;
            gap: 16px;
          }
          nav::-webkit-scrollbar { height: 4px; }
          nav::-webkit-scrollbar-thumb { background: rgba(139, 92, 255, 0.4); border-radius: 3px; }
          nav a, .nav-logout { flex-shrink: 0; }
        }
        @media (max-width: 640px) {
          nav { gap: 12px; font-size: 14px; }
          nav a, .nav-logout { padding: 0 6px; min-height: 40px; }
        }
        @media (max-width: 480px) {
          nav { gap: 10px; font-size: 13px; }
          .nav-profil-text { display: none; }
          .nav-profil-link { padding: 0 8px; }
        }

        nav a {
          color: #c4b5fd;
          text-decoration: none;
          transition: color 0.2s;
        }

        nav a:hover {
          color: #fff;
        }

        .nav-profil-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 6px;
          color: #c4b5fd;
          text-decoration: none;
          font-size: inherit;
          font-family: inherit;
          transition: color 0.2s ease;
        }
        .nav-profil-link:hover { color: #fff; }
        .nav-avatar, .nav-avatar-placeholder {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
        }
        .nav-avatar-placeholder {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.15);
          color: #ccc;
          font-size: 12px;
        }

        .nav-logout {
          background: none;
          border: none;
          color: #c4b5fd;
          font-size: inherit;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
          text-decoration: none;
          transition: color 0.2s;
        }
        .nav-logout:hover {
          color: #fff;
        }
        nav a, .nav-logout {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          padding: 0 4px;
        }
        @media (max-width: 640px) {
          nav a { font-size: 14px; }
        }
      `}</style>
    </header>
  );
}
