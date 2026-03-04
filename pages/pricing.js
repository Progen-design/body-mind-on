// /pages/pricing.js – Ceník plánů, registrace jen přes /start
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Pricing from '../components/Pricing';

export default function PricingPage() {
  return (
    <>
      <Header />

      <main className="app-page">
      <section className="pricing-page container">
        <h1 className="pricing-title">Ceník</h1>
        <p className="pricing-intro">
          Vyber si plán. Program <strong>Start</strong> je zdarma – vyplníš krátký dotazník a na e-mail ti přijde osobní plán.
        </p>

        <Pricing />

        <p className="pricing-cta">
          <Link href="/start">Začít 7denní START zdarma</Link>
          {' · '}
          <Link href="/on-club">Připojit se k ON Clubu</Link>
          {' · '}
          <Link href="/chci-vip">Chci VIP přístup</Link>
        </p>
      </section>
      </main>
      <Footer />

      <style jsx>{`
        .pricing-page {
          padding: 32px 0 48px;
        }
        .pricing-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: #38bdf8;
          margin: 0 0 8px;
          text-align: center;
        }
        .pricing-intro {
          color: #94a3b8;
          margin: 0 0 24px;
          line-height: 1.6;
          text-align: center;
        }
        .pricing-page :global(.pricing) {
          margin-bottom: 28px;
        }
        .pricing-page :global(.pricing .grid) {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          max-width: 720px;
          margin: 0 auto;
        }
        @media (max-width: 768px) {
          .pricing-page :global(.pricing .grid) {
            grid-template-columns: 1fr;
            max-width: 360px;
          }
        }
        .pricing-page :global(.pricing .card) {
          background: #121212;
          border-radius: 16px;
          padding: 20px 16px;
          border: 2px solid #475569;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .pricing-page :global(.pricing .card:hover) {
          border-color: #0ea5e9;
          background: #1a1a2e;
          box-shadow: 0 4px 20px rgba(14, 165, 233, 0.15);
        }
        .pricing-page :global(.pricing .card-on-club:hover) {
          border-color: #f59e0b;
          box-shadow: 0 4px 20px rgba(245, 158, 11, 0.2);
        }
        .pricing-page :global(.pricing .card-vip:hover) {
          border-color: #eab308;
          box-shadow: 0 4px 20px rgba(234, 179, 8, 0.2);
        }
        .pricing-page :global(.pricing .card-recommended) {
          border-color: rgba(139, 92, 255, 0.6);
          background: rgba(30, 27, 75, 0.5);
          box-shadow: 0 0 0 1px rgba(139, 92, 255, 0.3), 0 4px 20px rgba(139, 92, 255, 0.15);
        }
        .pricing-page :global(.pricing .card-recommended:hover) {
          border-color: #a78bfa;
          background: rgba(49, 46, 129, 0.6);
          box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.4), 0 6px 24px rgba(139, 92, 255, 0.25);
        }
        .pricing-page :global(.pricing .card .badge) {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 20px;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(124, 58, 237, 0.4);
        }
        .pricing-page :global(.pricing .card h3) {
          margin: 16px 0 8px;
          font-size: 1.15rem;
          color: #e2e8f0;
          text-align: center;
        }
        .pricing-page :global(.pricing .card .sub) {
          font-size: 0.85rem;
          color: #94a3b8;
          margin: 0 0 12px;
          text-align: center;
          line-height: 1.4;
        }
        .pricing-page :global(.pricing .card .price) {
          font-size: 1rem;
          font-weight: 600;
          color: #86efac;
          margin-bottom: 16px;
          text-align: center;
        }
        .pricing-page :global(.pricing .card ul) {
          list-style: none;
          padding: 0;
          margin: 0 0 20px;
          font-size: 0.85rem;
          color: #94a3b8;
          line-height: 1.5;
        }
        .pricing-page :global(.pricing .card ul li) {
          padding: 4px 0;
          padding-left: 16px;
          position: relative;
        }
        .pricing-page :global(.pricing .card ul li::before) {
          content: '•';
          position: absolute;
          left: 0;
          color: #64748b;
        }
        .pricing-page :global(.pricing .card .btn) {
          margin-top: auto;
          width: 100%;
          text-align: center;
          padding: 12px 16px;
          border-radius: 12px;
          font-weight: 600;
          text-decoration: none;
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          color: #fff;
          border: none;
          cursor: pointer;
          display: block;
          transition: opacity 0.2s;
        }
        .pricing-page :global(.pricing .card .btn:hover) {
          opacity: 0.9;
        }
        .pricing-page :global(.pricing .card-on-club .btn) {
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
        }
        .pricing-page :global(.pricing .card-vip .btn) {
          background: linear-gradient(135deg, #7c3aed, #9b5cff);
        }
        .pricing-cta {
          text-align: center;
          color: #94a3b8;
          font-size: 0.95rem;
        }
        .pricing-cta a {
          color: #a78bfa;
          text-decoration: none;
        }
        .pricing-cta a:hover {
          text-decoration: underline;
          color: #c4b5fd;
        }
      `}</style>
    </>
  );
}
