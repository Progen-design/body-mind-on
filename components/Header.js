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

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "app.bodyandmindon.cz") setIsApp(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription?.unsubscribe();
  }, []);

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
              <Link href="/profil">Profil</Link>
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
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo {
          font-size: 1.2rem;
          color: #fff;
          text-decoration: none;
        }

        nav {
          display: flex;
          gap: 20px;
        }

        nav a {
          color: #ccc;
          text-decoration: none;
          transition: color 0.3s;
        }

        nav a:hover {
          color: #fff;
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
      `}</style>
    </header>
  );
}
