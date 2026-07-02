// /pages/obchodni-podminky.js – Obchodní podmínky (jednoduchá legal stránka)
import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function ObchodniPodminky() {
  return (
    <>
      <Head>
        <title>Obchodní podmínky | Body &amp; Mind ON</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />
      <main className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">Obchodní podmínky</h1>
          <p className="legal-updated">Poslední aktualizace: červenec 2026</p>

          <section className="legal-section">
            <h2>1. Provozovatel</h2>
            <p>
              Službu Body &amp; Mind ON provozuje Body &amp; Mind ON.
              Kontakt: <a href="mailto:info@bodyandmindon.cz">info@bodyandmindon.cz</a>.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Popis služby</h2>
            <p>
              Body &amp; Mind ON je online služba, která na základě údajů zadaných uživatelem
              generuje individuální jídelníček a tréninkový plán. Plány mají orientační
              a doporučující charakter.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Registrace a uživatelský účet</h2>
            <p>
              Pro využívání služby je nutná registrace. Uživatel odpovídá za správnost
              zadaných údajů a za ochranu svých přihlašovacích údajů. Účet je nepřenosný.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Ceny a platby</h2>
            <p>
              Aktuální ceny programů jsou uvedeny na webu před dokončením objednávky.
              Platby probíhají prostřednictvím zabezpečené platební brány.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Zdravotní upozornění</h2>
            <p>
              Plány nenahrazují doporučení lékaře nebo nutričního specialisty. Pokud máš
              zdravotní omezení, konzultuj změny stravování nebo tréninku s odborníkem.
              Službu využíváš na vlastní odpovědnost.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Odstoupení od smlouvy a reklamace</h2>
            <p>
              Spotřebitel má právo odstoupit od smlouvy dle platných právních předpisů.
              Reklamace a podněty vyřizujeme na e-mailu{' '}
              <a href="mailto:info@bodyandmindon.cz">info@bodyandmindon.cz</a>.
            </p>
          </section>

          <section className="legal-section">
            <h2>7. Závěrečná ustanovení</h2>
            <p>
              Tyto podmínky se řídí právním řádem České republiky. Provozovatel si vyhrazuje
              právo podmínky aktualizovat; aktuální znění je vždy dostupné na této stránce.
            </p>
          </section>
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .legal-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #0a021f 0%, #0d0d1a 30%, #0a0a12 100%);
          padding: 40px 20px 56px;
        }
        .legal-container { max-width: 720px; margin: 0 auto; }
        .legal-title { font-size: 1.75rem; font-weight: 700; color: #f1f5f9; margin: 0 0 6px; }
        .legal-updated { color: #64748b; font-size: 13px; margin: 0 0 28px; }
        .legal-section { margin-bottom: 24px; }
        .legal-section h2 { font-size: 1.1rem; font-weight: 600; color: #e2e8f0; margin: 0 0 8px; }
        .legal-section p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0; }
        .legal-section a { color: #7c3aed; }
      `}</style>
    </>
  );
}
