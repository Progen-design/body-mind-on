// /pages/index.js
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <>
      <Header />

      <main className="hero">
        <div className="hero-content">
        <h1>Body and Mind ON – LIVE TEST</h1>
          <p className="subtitle">Zapni své tělo i mysl</p>
          <p className="text">
            Získej osobní plán tréninku, jídelníčku a regenerace. AI společně s
            trenérem vytvoří tvůj plán a sleduje pokrok v tvém profilu.
          </p>

          <div className="buttons">
            {/* 🔹 ODKAZ NA CENÍK / REGISTRACI */}
            <a
              href="https://app.bodyandmindon.cz/pricing"
              className="btn btn-primary"
            >
              Začít 7denní START zdarma
            </a>

            {/* 🔹 ODKAZ NA SEKCI „Jak to funguje“ */}
            <a href="#jak-to-funguje" className="btn btn-secondary">
              Jak to funguje
            </a>
          </div>

          <p className="info">
            Tvůj osobní plán bude připraven během 2 minut.
          </p>
        </div>
      </main>

      {/* 🔹 Sekce "Jak to funguje" */}
      <section id="jak-to-funguje" className="section">
        <h2>Jak to funguje</h2>
        <p>
          Vyplníš krátký dotazník, AI spočítá tvůj kalorický cíl, sestaví plán
          tréninku i jídelníček a propojí vše do jednoho přehledného profilu.
        </p>
        <p>
          Každý má svůj profil, kde se zaznamenávají hodnoty, pokrok a plněné
          úkoly. Za každý úspěch získáváš body a odměny.
        </p>
      </section>

      <Footer />

      <style jsx>{`
        .hero {
          background: linear-gradient(135deg, #120638 0%, #34026b 100%);
          color: white;
          text-align: center;
          padding: 100px 20px 60px;
        }

        .hero-content {
          max-width: 800px;
          margin: 0 auto;
        }

        h1 {
          font-size: 3.2rem;
          margin-bottom: 10px;
        }

        .subtitle {
          font-size: 1.5rem;
          margin-bottom: 20px;
          color: #a8a8ff;
        }

        .text {
          font-size: 1.1rem;
          line-height: 1.6;
          color: #ddd;
          margin-bottom: 30px;
        }

        .buttons {
          display: flex;
          justify-content: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .btn {
          padding: 14px 26px;
          border-radius: 10px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.3s ease;
        }

        .btn-primary {
          background-color: #9f46ff;
          color: white;
        }

        .btn-primary:hover {
          background-color: #b564ff;
        }

        .btn-secondary {
          border: 2px solid #fff;
          color: #fff;
        }

        .btn-secondary:hover {
          background-color: #fff;
          color: #120638;
        }

        .info {
          margin-top: 20px;
          font-size: 0.9rem;
          color: #bbb;
        }

        .section {
          padding: 80px 20px;
          background: #0b0b0f;
          color: #eee;
          text-align: center;
        }

        .section h2 {
          font-size: 2rem;
          margin-bottom: 20px;
        }

        .section p {
          max-width: 700px;
          margin: 10px auto;
          line-height: 1.7;
        }
      `}</style>
    </>
  );
}
