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
  const jakHref = isApp ? `${MAIN_SITE}/#jak-to-funguje` : "/#jak-to-funguje";
  const cenikHref = isApp ? `${MAIN_SITE}/#cenik` : "/#cenik";

  const isRegistrationPage = ["/start", "/on-club", "/chci-vip"].includes(router.pathname);
  const showLoggedInNav = session && !isRegistrationPage;

  return (
    <header className="header">
      <div className="container">
        <a href={homeHref} className="logo">
          <strong>Body & Mind ON</strong>
        </a>
        <nav>
          <a href={jakHref}>Jak to funguje</a>
          <a href={cenikHref}>Ceník</a>
          {showLoggedInNav ? (
            <>
              <Link href="/komunita">Komunita</Link>
              <Link href="/profil" className="nav-profil-link">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="nav-avatar" />
                ) : (
                  <span className="nav-avatar-placeholder">?</span>
                )}
                Profil
              </Link>
              <button type="button" onClick={handleLogout} className="nav-logout">
                Odhlásit se
              </button>
            </>
          ) : (
            <>
              <Link href="/trener">Pro trenéry</Link>
              <Link href="/start">Registrace</Link>
              <Link href="/profil">Profil</Link>
              <Link href="/login">Přihlášení</Link>
            </>
          )}
        </nav>
      </div>

      <style jsx>{`
        .header {
          background: #0b0b0f;
          border-bottom: 1px solid #222;
          padding: 16px 24px;
          padding-left: max(16px, env(safe-area-inset-left));
          padding-right: max(16px, env(safe-area-inset-right));
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
          gap: 12px;
          width: 100%;
        }

        .logo {
          font-size: 1.2rem;
          color: #fff;
          text-decoration: none;
          flex-shrink: 0;
        }
        @media (max-width: 480px) {
          .logo { font-size: 1rem; }
        }

        nav {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        @media (max-width: 640px) {
          nav { gap: 12px; }
        }
        @media (max-width: 380px) {
          nav { gap: 8px; }
        }

        nav a {
          color: #ccc;
          text-decoration: none;
          transition: color 0.3s;
        }

        nav a:hover {
          color: #fff;
        }

        .nav-profil-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
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
          color: #ccc;
          font-size: inherit;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
          text-decoration: none;
          transition: color 0.3s;
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
