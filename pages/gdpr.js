// /pages/gdpr.js – Zásady zpracování osobních údajů (jednoduchá legal stránka)
import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function Gdpr() {
  return (
    <>
      <Head>
        <title>Ochrana osobních údajů (GDPR) | Body &amp; Mind ON</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />
      <main className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">Ochrana osobních údajů (GDPR)</h1>
          <p className="legal-updated">Poslední aktualizace: červenec 2026</p>

          <section className="legal-section">
            <h2>1. Správce osobních údajů</h2>
            <p>
              Správcem osobních údajů je provozovatel služby Body &amp; Mind ON.
              Kontakt: <a href="mailto:info@bodyandmindon.cz">info@bodyandmindon.cz</a>.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Jaké údaje zpracováváme</h2>
            <p>
              Zpracováváme údaje, které nám zadáš při registraci a používání služby:
              jméno, e-mail, tělesné údaje (výška, váha, datum narození), cíle a preference
              pro tvorbu plánu. Pokud propojíš Withings, zpracováváme také měření z této služby.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Účel zpracování</h2>
            <p>
              Údaje používáme výhradně pro poskytování služby – vytvoření a správu účtu,
              generování individuálního jídelníčku a tréninkového plánu, zasílání plánů
              e-mailem a komunikaci ohledně služby.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Doba uchování a zpracovatelé</h2>
            <p>
              Údaje uchováváme po dobu existence účtu. Pro provoz služby využíváme
              prověřené zpracovatele (hosting, databáze, e-mailová komunikace, platební brána),
              kteří údaje zpracovávají dle našich pokynů.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Tvoje práva</h2>
            <p>
              Máš právo na přístup ke svým údajům, jejich opravu, výmaz, omezení zpracování,
              přenositelnost a právo vznést námitku. Žádosti vyřizujeme na e-mailu{' '}
              <a href="mailto:info@bodyandmindon.cz">info@bodyandmindon.cz</a>.
              Máš také právo podat stížnost u Úřadu pro ochranu osobních údajů.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Zabezpečení</h2>
            <p>
              Údaje chráníme technickými a organizačními opatřeními – šifrovaným přenosem,
              řízením přístupů a ukládáním v zabezpečené databázi.
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
