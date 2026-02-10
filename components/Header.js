// /components/Header.js
import Link from "next/link";

export default function Header() {
  return (
    <header className="header">
      <div className="container">
        <Link href="/" className="logo">
          <strong>Body & Mind ON</strong>
        </Link>
        <nav>
          <Link href="/#jak-to-funguje">Jak to funguje</Link>
          <Link href="/pricing">Ceník</Link>
          <Link href="/start">Registrace</Link>
          <a href="https://app.bodyandmindon.cz">Přihlášení</a>
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
