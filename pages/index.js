// /pages/index.js – Hlavní marketingová stránka (bodyandmindon.cz)
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.bodyandmindon.cz';

export default function Home() {
  return (
    <>
      <Header />

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="hero-content">
            <h1>Body and Mind ON</h1>
            <p className="subtitle">Zapni své tělo i mysl</p>
            <p className="text">
              Body and Mind ON je místo, kde zapneš své tělo i mysl. Nejde jen o trénink nebo jídelníček – jde o kompletní systém, který ti ukáže, jak mít silné, funkční a zdravé tělo, víc energie každý den a pevnější sebevědomí. Vše je postavené na jednoduchých a ověřených krocích, které tě povedou od prvního dne.
            </p>
            <div className="buttons">
              <a href={`${APP_URL}/start`} className="btn btn-primary">
                Začni 7denní START zdarma
              </a>
              <a href="#jak-to-funguje" className="btn btn-secondary">
                Jak to funguje
              </a>
            </div>
            <p className="info">Ať už začínáš, nebo chceš posunout svůj výkon na další úroveň, dostaneš jasný plán, podporu i motivaci.</p>
          </div>
        </section>

        {/* Jak to funguje */}
        <section id="jak-to-funguje" className="section section-dark">
          <h2>Jak to funguje</h2>
          <p className="section-lead">Bez stresu. Bez výmluv. Jen ty a tvůj plán.</p>
          <div className="steps">
            <div className="step">
              <span className="step-num">1</span>
              <h3>Vyplň krátký kvíz o sobě</h3>
              <p>Sdílíš své cíle, možnosti a zdravotní stav v jednoduchém dotazníku.</p>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <h3>AI + kouč vytvoří tvůj osobní plán</h3>
              <p>Během 2 minut připraví personalizovaný tréninkový a jídelní plán přesně pro tebe.</p>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <h3>Sleduj pokrok a výsledky</h3>
              <p>V aplikaci vidíš výsledky a každý týden dostáváš doporučení od AI trenéra.</p>
            </div>
          </div>
        </section>

        {/* Tréninkový plán a jídelníček */}
        <section className="section">
          <h2>Tréninkový plán a jídelníček</h2>
          <p className="section-lead">Tvůj plán je plně přizpůsobený tobě – vychází z tvých dat a odpovědí z kvízu. Zohledňuje tvé cíle, možnosti i zdravotní stav.</p>
          <div className="two-cols">
            <div className="col-card">
              <h3>🍽️ Jídelníček</h3>
              <p>Ovesná kaše s ovocem, losos s quinoou, zelenina s kuřecím masem – vše přizpůsobené tvým potřebám.</p>
            </div>
            <div className="col-card">
              <h3>🏋️ Trénink</h3>
              <p>Konkrétní cviky, série, odpočinek a intenzita podle tvé úrovně a možností.</p>
            </div>
          </div>
          <div className="example-day">
            <h4>Ukázka jednoho dne</h4>
            <ul>
              <li><strong>Snídaně:</strong> Ovesná kaše s borůvkami a mandlemi + protein shake</li>
              <li><strong>Oběd:</strong> Grilovaný losos s quinoou a pečenou zeleninou</li>
              <li><strong>Večeře:</strong> Kuřecí prsa s batáty a salát s avokádem</li>
              <li><strong>Svačiny:</strong> Řecký jogurt s oříšky, ovoce dle sezóny</li>
            </ul>
          </div>
        </section>

        {/* Motivace a pokrok */}
        <section className="section section-dark">
          <h2>Motivace a pokrok</h2>
          <p className="section-lead">Tvůj každodenní systém, který tě udrží v pohybu a pomůže ti růst – fyzicky i mentálně.</p>
          <p>Každý den dostaneš malé výzvy, které tě motivují, odmění a pomůžou ti zůstat na cestě. Sleduj svůj progres, sbírej odznaky a nenech motivaci vyprchat.</p>
          <div className="features-grid">
            <div className="feature-card">
              <h4>Denní výzvy</h4>
              <p>Každý den nové úkoly – <strong>malé kroky, velké výsledky</strong>.</p>
            </div>
            <div className="feature-card">
              <h4>Odznaky & úspěchy</h4>
              <p>Plň cíle, <strong>získávaj medaile</strong> a sleduj, jak se posouváš.</p>
            </div>
            <div className="feature-card">
              <h4>Mindset & fokus</h4>
              <p>Krátké tipy, které ti pomůžou <strong>udržet rovnováhu a klid</strong>.</p>
            </div>
            <div className="feature-card">
              <h4>Chytré připomínky</h4>
              <p>Notifikace, které ti pomůžou <strong>držet tempo</strong> – přesně, když to potřebuješ.</p>
            </div>
          </div>
        </section>

        {/* Reference */}
        <section className="section testimonials">
          <h2>Skuteční lidé. Skutečné výsledky.</h2>
          <p className="section-lead">Reálné příběhy našich členů:</p>
          <div className="testimonial-grid">
            <blockquote className="testimonial">„Za 6 týdnů jsem získala energii a zhubnula 8 kg.“ <cite>– Petra, 34 let</cite></blockquote>
            <blockquote className="testimonial">„Konečně mám rutinu a cítím se silnější každý den.“ <cite>– Martin, 29 let</cite></blockquote>
            <blockquote className="testimonial">„Našla jsem čas na sebe a zlepšila kondici i náladu.“ <cite>– Tereza, 41 let</cite></blockquote>
            <blockquote className="testimonial">„Přestal jsem se vymlouvat a dosáhl svých fitness cílů.“ <cite>– Jakub, 26 let</cite></blockquote>
          </div>
        </section>

        {/* Ceník */}
        <section id="cenik" className="section section-dark">
          <h2>Vyber si cestu k úspěchu</h2>
          <p className="section-lead">Každý plán tě posune o krok blíž k tvému cíli. Přizpůsobené plány pro tvé cíle a potřeby. Tvá změna začíná teď!</p>
          <div className="pricing-cards">
            <div className="price-card">
              <h3>START</h3>
              <p className="price-desc">První krok k lepšímu já.</p>
              <div className="price-value">7 dní zdarma, pak 499 Kč/měsíc</div>
              <ul>
                <li>Osobní tréninkový plán</li>
                <li>Týdenní jídelníček</li>
                <li>7 pilířů zdraví</li>
              </ul>
              <a href={`${APP_URL}/start`} className="btn btn-primary">Začít zdarma</a>
            </div>
            <div className="price-card price-card-featured">
              <span className="badge">Doporučeno</span>
              <h3>ON Club</h3>
              <p className="price-desc">Tvůj osobní AI trenér vždy po ruce.</p>
              <div className="price-value">1 499 Kč/měsíc</div>
              <ul>
                <li>VŠE ze START +</li>
                <li>Osobní AI trenér 24/7</li>
                <li>Adaptivní plán dle výsledků</li>
                <li>Motivační komunita</li>
                <li>Video konzultace s experty</li>
                <li>Detailní statistiky a analýzy</li>
              </ul>
              <a href={`${APP_URL}/start?plan=club`} className="btn btn-primary">Připojit se k ON Clubu</a>
            </div>
            <div className="price-card">
              <h3>VIP Coaching</h3>
              <p className="price-desc">Luxusní péče pro ty, co chtějí víc.</p>
              <div className="price-value">3 999 Kč/měsíc</div>
              <ul>
                <li>VŠE z ON Club +</li>
                <li>Elitní lidský kouč</li>
                <li>Strategie šitá na míru</li>
                <li>Týdenní 1:1 video konzultace</li>
                <li>Prioritní podpora</li>
              </ul>
              <a href={`${APP_URL}/start?plan=vip`} className="btn btn-primary">Chci VIP přístup</a>
            </div>
          </div>
        </section>

        {/* Jak funguje START */}
        <section className="section">
          <h2>Jak funguje START program</h2>
          <p className="section-lead">Stačí pár kroků a začneš se hýbat s plánem na míru.</p>
          <ol className="start-steps">
            <li><strong>Vyplníš krátký dotazník</strong> – Odpovíš na pár otázek o svých cílech, pohybu a stravování.</li>
            <li><strong>AI vytvoří tvůj plán</strong> – Na základě odpovědí ti systém během pár vteřin sestaví osobní plán tréninku a jídelníček.</li>
            <li><strong>Začneš první den výzvy</strong> – Každý den uvidíš konkrétní úkoly, jídla a tipy, jak se posunout dál.</li>
            <li><strong>Sleduješ výsledky</strong> – Tvůj pokrok se ukládá automaticky. Získáváš přehled a motivaci pokračovat.</li>
          </ol>
          <div className="cta-block">
            <a href={`${APP_URL}/start`} className="btn btn-primary btn-large">Vyzkoušej START zdarma</a>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="section section-dark">
          <h2>Často kladené otázky</h2>
          <dl className="faq-list">
            <dt>Jak rychle uvidím výsledky?</dt>
            <dd>Už během 2–4 týdnů začneš pozorovat první změny v energii a kondici.</dd>
            <dt>Můžu cvičit i doma?</dt>
            <dd>Ano, každý plán má domácí i gym varianty přizpůsobené tvému vybavení.</dd>
            <dt>Co když mám zdravotní omezení?</dt>
            <dd>Plán se plně přizpůsobí tvému zdravotnímu stavu a fyzickým možnostem.</dd>
            <dt>Jak funguje AI trenér?</dt>
            <dd>AI analyzuje tvůj pokrok a každý týden upravuje plán podle výsledků a zpětné vazby.</dd>
            <dt>Můžu kdykoliv zrušit?</dt>
            <dd>Ano, můžeš zrušit kdykoliv bez poplatků. 7denní START je zcela zdarma.</dd>
            <dt>Co když ztratím motivaci?</dt>
            <dd>Máš přístup ke komunitě, denním výzvám a osobní podpoře od AI i lidských koučů.</dd>
          </dl>
        </section>

        {/* Finální CTA */}
        <section className="section cta-final">
          <h2>Jsi připraven zapnout své tělo i mysl?</h2>
          <p>Začni ještě dnes – tvůj osobní plán tě čeká. Během 2 minut získáš kompletní tréninkový a jídelní plán přizpůsobený přesně tobě.</p>
          <a href={`${APP_URL}/start`} className="btn btn-primary btn-large">Začni hned</a>
        </section>
      </main>

      <Footer />

      <style jsx>{`
        .hero {
          background: linear-gradient(135deg, #120638 0%, #34026b 100%);
          color: white;
          text-align: center;
          padding: 100px 20px 80px;
        }
        .hero-content { max-width: 800px; margin: 0 auto; }
        .hero h1 { font-size: clamp(2rem, 5vw, 3.2rem); margin-bottom: 10px; }
        .subtitle { font-size: 1.4rem; margin-bottom: 20px; color: #a8a8ff; }
        .hero .text { font-size: 1.05rem; line-height: 1.7; color: #ddd; margin-bottom: 28px; }
        .buttons { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
        .btn {
          padding: 14px 26px; border-radius: 10px; font-weight: 600; text-decoration: none;
          transition: all 0.3s ease; display: inline-block;
        }
        .btn-primary { background: #9f46ff; color: white; }
        .btn-primary:hover { background: #b564ff; }
        .btn-secondary { border: 2px solid #fff; color: #fff; }
        .btn-secondary:hover { background: #fff; color: #120638; }
        .btn-large { padding: 18px 36px; font-size: 1.1rem; }
        .info { margin-top: 12px; font-size: 0.95rem; color: #bbb; }

        .section {
          padding: 72px 24px;
          max-width: 1000px;
          margin: 0 auto;
          text-align: center;
        }
        .section-dark { background: #0b0b0f; color: #eee; }
        .section h2 { font-size: 1.9rem; margin-bottom: 12px; color: #fff; }
        .section-lead { color: #a1a1aa; margin-bottom: 32px; max-width: 640px; margin-left: auto; margin-right: auto; line-height: 1.6; }
        .section p { color: #ccc; line-height: 1.7; }

        .steps {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 28px;
          text-align: center;
          margin-top: 32px;
        }
        .step { padding: 24px 16px; background: rgba(255,255,255,0.04); border-radius: 16px; border: 1px solid #222; }
        .step-num { display: inline-block; width: 40px; height: 40px; line-height: 40px; background: #9f46ff; color: #fff; border-radius: 50%; font-weight: 700; margin-bottom: 12px; }
        .step h3 { font-size: 1.1rem; margin-bottom: 8px; color: #fff; }
        .step p { font-size: 0.95rem; margin: 0; color: #a1a1aa; }

        .two-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; margin: 32px 0; }
        .col-card { padding: 24px; background: rgba(24,24,36,0.8); border: 1px solid #2a2a3d; border-radius: 16px; text-align: left; }
        .col-card h3 { margin: 0 0 12px; font-size: 1.2rem; color: #e4e4e7; }
        .col-card p { margin: 0; font-size: 0.95rem; color: #a1a1aa; line-height: 1.6; }
        .example-day { text-align: left; max-width: 520px; margin: 24px auto 0; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 12px; }
        .example-day h4 { margin: 0 0 12px; font-size: 1rem; color: #a78bfa; }
        .example-day ul { margin: 0; padding-left: 20px; color: #a1a1aa; font-size: 0.95rem; line-height: 1.8; }

        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 28px; }
        .feature-card { padding: 20px; background: rgba(255,255,255,0.04); border-radius: 12px; border: 1px solid #2a2a3d; text-align: left; }
        .feature-card h4 { margin: 0 0 8px; font-size: 1rem; color: #e4e4e7; }
        .feature-card p { margin: 0; font-size: 0.9rem; color: #a1a1aa; line-height: 1.5; }

        .testimonials { padding-bottom: 64px; }
        .testimonial-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 28px; text-align: left; }
        .testimonial { padding: 20px; background: rgba(255,255,255,0.04); border-radius: 12px; border-left: 4px solid #9f46ff; margin: 0; font-style: italic; color: #d4d4d8; }
        .testimonial cite { display: block; margin-top: 10px; font-style: normal; font-size: 0.9rem; color: #71717a; }

        .pricing-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; margin-top: 32px; }
        .price-card { position: relative; padding: 28px; background: rgba(24,24,36,0.9); border: 1px solid #2a2a3d; border-radius: 20px; text-align: center; display: flex; flex-direction: column; align-items: center; }
        .price-card-featured { border-color: #9f46ff; box-shadow: 0 0 30px rgba(159, 70, 255, 0.2); }
        .price-card .badge { position: absolute; top: -10px; background: linear-gradient(90deg, #9f46ff, #0ea5e9); color: #fff; font-size: 0.75rem; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
        .price-card h3 { margin: 0 0 8px; font-size: 1.4rem; color: #fff; }
        .price-desc { margin: 0 0 12px; font-size: 0.9rem; color: #a1a1aa; }
        .price-value { font-size: 1.2rem; font-weight: 700; color: #a78bfa; margin-bottom: 20px; }
        .price-card ul { list-style: none; padding: 0; margin: 0 0 24px; text-align: left; width: 100%; }
        .price-card li { padding: 6px 0; font-size: 0.9rem; color: #d4d4d8; }
        .price-card .btn { width: 100%; text-align: center; }

        .start-steps { max-width: 560px; margin: 0 auto 32px; text-align: left; padding-left: 24px; line-height: 1.8; color: #ccc; }
        .start-steps li { margin-bottom: 12px; }
        .cta-block { margin-top: 24px; }
        .faq-list { max-width: 640px; margin: 28px auto 0; text-align: left; }
        .faq-list dt { font-weight: 600; color: #e4e4e7; margin-top: 20px; margin-bottom: 6px; }
        .faq-list dd { margin: 0; color: #a1a1aa; line-height: 1.6; font-size: 0.95rem; }
        .cta-final { padding: 80px 24px; }
        .cta-final .btn { margin-top: 16px; }
      `}</style>
    </>
  );
}
