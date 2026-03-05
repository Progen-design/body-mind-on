// /components/Header.js – na main doméně marketing, na app registrace/profil; při přihlášení jen Odhlásit se
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useRef } from "react";
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
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    if (profileOpen) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [profileOpen]);

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
              <div className="nav-profil-wrap" ref={profileRef} data-open={profileOpen || undefined}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className="nav-profil-trigger"
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="nav-avatar" />
                  ) : (
                    <span className="nav-avatar-placeholder" aria-hidden />
                  )}
                  Profil
                  <span className="nav-profil-chevron" aria-hidden>▼</span>
                </button>
                {profileOpen && (
                  <div className="nav-profil-dropdown" role="menu">
                    <Link href="/profil?edit=preferences" onClick={() => setProfileOpen(false)} className="nav-profil-dropdown-item" role="menuitem">
                      <span className="nav-profil-item-icon" aria-hidden>✏️</span>
                      <span className="nav-profil-item-text">Upravit preference</span>
                    </Link>
                  </div>
                )}
              </div>
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
          nav { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
          nav::-webkit-scrollbar { height: 3px; }
          nav::-webkit-scrollbar-thumb { background: rgba(139, 92, 255, 0.4); border-radius: 3px; }
        }
        @media (max-width: 640px) {
          nav { gap: 14px; font-size: 14px; }
        }
        @media (max-width: 480px) {
          nav { gap: 10px; font-size: 13px; }
        }

        nav a {
          color: #c4b5fd;
          text-decoration: none;
          transition: color 0.2s;
        }

        nav a:hover {
          color: #fff;
        }

        .nav-profil-wrap { position: relative; display: inline-flex; align-items: center; }
        .nav-profil-trigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 6px;
          background: none;
          border: none;
          color: #c4b5fd;
          font-size: inherit;
          font-family: inherit;
          cursor: pointer;
          transition: color 0.2s ease;
        }
        .nav-profil-trigger:hover { color: #fff; }
        .nav-profil-chevron { font-size: 10px; opacity: 0.7; transition: transform 0.2s; }
        .nav-profil-wrap[data-open] .nav-profil-chevron { transform: rotate(180deg); }
        .nav-profil-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 10px;
          min-width: 240px;
          padding: 10px;
          background: #1a1a2e;
          border: 1px solid #334155;
          border-radius: 20px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          z-index: 100;
          animation: nav-dropdown-in 0.2s ease-out;
        }
        @keyframes nav-dropdown-in {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nav-profil-dropdown-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          color: #e2e8f0;
          text-decoration: none;
          font-size: 15px;
          font-weight: 500;
          line-height: 1.35;
          border-radius: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid transparent;
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }
        .nav-profil-dropdown-item:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(148,163,184,0.2);
          color: #fff;
        }
        .nav-profil-item-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
          font-size: 1rem;
          line-height: 1;
          border-radius: 50%;
          background: rgba(124,58,237,0.2);
        }
        .nav-profil-item-text {
          flex: 1;
          white-space: nowrap;
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
