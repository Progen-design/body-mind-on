// /components/Header.js – na main doméně (bodyandmindon.cz) marketing, na app (app.bodyandmindon.cz) odkazy na main + registrace/profil
import Link from "next/link";
import { useState, useEffect } from "react";

const MAIN_SITE = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://bodyandmindon.cz";

export default function Header() {
  const [isApp, setIsApp] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "app.bodyandmindon.cz") setIsApp(true);
  }, []);

  const homeHref = isApp ? MAIN_SITE : "/";
  const jakHref = isApp ? `${MAIN_SITE}/#jak-to-funguje` : "/#jak-to-funguje";
  const cenikHref = isApp ? `${MAIN_SITE}/#cenik` : "/#cenik";

  return (
    <header className="header">
      <div className="container">
        <a href={homeHref} className="logo">
          <strong>Body & Mind ON</strong>
        </a>
        <nav>
          <a href={jakHref}>Jak to funguje</a>
          <a href={cenikHref}>Ceník</a>
          <Link href="/start">Registrace</Link>
          <Link href="/profil">Profil</Link>
          <Link href="/login">Přihlášení</Link>
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
      `}</style>
    </header>
  );
}
