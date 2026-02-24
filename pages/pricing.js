// /pages/pricing.js – Ceník plánů, registrace jen přes /start
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Pricing from '../components/Pricing';

export default function PricingPage() {
  return (
    <>
      <Header />

      <section className="pricing-page">
        <h1>Ceník</h1>
        <p className="intro">
          Vyber si plán. Program <strong>Start</strong> je zdarma – vyplníš krátký dotazník a na e-mail ti přijde osobní plán.
        </p>

        <Pricing />

        <p className="single-cta">
          <Link href="/start">Začít 7denní START zdarma</Link>
          {' · '}
          <Link href="/on-club">Připojit se k ON Clubu</Link>
          {' · '}
          <Link href="/chci-vip">Chci VIP přístup</Link>
        </p>
      </section>
      <Footer />

      <style jsx>{`
        .pricing-page {
          max-width: 980px;
          margin: 0 auto;
          padding: 32px 16px 48px;
        }
        h1 {
          font-size: 2rem;
          margin-bottom: 8px;
          color: #fff;
        }
        .intro {
          color: #a1a1aa;
          margin-bottom: 32px;
          line-height: 1.6;
        }
        .pricing-page :global(.pricing) {
          margin-bottom: 32px;
        }
        .pricing-page :global(.pricing .grid) {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 24px;
        }
        .pricing-page :global(.pricing .card) {
          background: var(--panel, #121212);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid var(--border, #222);
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .pricing-page :global(.pricing .card .badge) {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(90deg, #0ea5e9, #06b6d4);
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .pricing-page :global(.pricing .card .btn) {
          margin-top: auto;
          width: 100%;
          text-align: center;
          padding: 12px 16px;
          border-radius: 12px;
          font-weight: 600;
          text-decoration: none;
          background: linear-gradient(90deg, #0ea5e9, #0284c7);
          color: #fff;
          border: none;
          cursor: pointer;
          display: block;
        }
        .pricing-page :global(.pricing .card .btn:hover) {
          opacity: 0.95;
        }
        .single-cta {
          text-align: center;
          color: #a1a1aa;
          font-size: 0.95rem;
        }
        .single-cta a {
          color: #0ea5e9;
          text-decoration: none;
        }
        .single-cta a:hover {
          text-decoration: underline;
        }
      `}</style>
    </>
  );
}
