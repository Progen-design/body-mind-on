<<<<<<< HEAD
// /pages/pricing.js
import { useEffect } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import BodyMetricsForm from '../components/BodyMetricsForm'

export default function PricingPage() {
  useEffect(() => { window.__BMON_FORM_V2 = true }, [])

  return (
    <>
      <Header />
      <section className="container">
        <h2>Detaily pro „Start“</h2>
        <BodyMetricsForm submitLabel="Dokončit registraci" />
=======
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
            Jediná registrace pro Start: <Link href="/start">Začít 7denní START zdarma →</Link>
        </p>
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d
      </section>
      <Footer />

      <style jsx>{`
<<<<<<< HEAD
        .container { max-width: 980px; margin: 32px auto; padding: 0 16px; }
=======
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
>>>>>>> 6f5240f6f8b1258409583a0b19f720f567efd04d
      `}</style>
    </>
  );
}
