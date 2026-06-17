import { useState } from 'react';
import dynamic from 'next/dynamic';
import { START_FEATURES, START_POST_TRIAL_OFFER } from '../lib/pricing';

const PricingTable = dynamic(() => import('./PricingTable'), { ssr: false });

/**
 * Paywall po vypršení START programu – vlastní START karta (bez trial copy),
 * ON Club + VIP beze změny. Stripe Pricing Table jen pro dokončení platby START.
 */
export default function TrialExpiredPaywall() {
  const [showStartCheckout, setShowStartCheckout] = useState(false);

  return (
    <>
      <p className="trial-banner-text">
        Tvůj 7denní START program vypršel. Pro pokračování aktivuj předplatné 499 Kč/měsíc.
      </p>
      <div className="trial-banner-upgrade-cards trial-paywall-grid">
        <article className="trial-upgrade-card trial-upgrade-card--start">
          <h3 className="trial-upgrade-title">START</h3>
          <p className="trial-upgrade-subtitle">{START_POST_TRIAL_OFFER.subtitle}</p>
          <span className="trial-upgrade-price">{START_POST_TRIAL_OFFER.priceLabel}</span>
          <ul className="trial-paywall-features">
            {START_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button
            type="button"
            className="trial-upgrade-cta trial-upgrade-cta--button"
            onClick={() => {
              setShowStartCheckout(true);
              requestAnimationFrame(() => {
                document.getElementById('start-subscribe-checkout')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              });
            }}
          >
            {START_POST_TRIAL_OFFER.cta.label} →
          </button>
        </article>
        <a href="/on-club" className="trial-upgrade-card trial-upgrade-card--club">
          <span className="trial-upgrade-badge">Doporučeno</span>
          <h3 className="trial-upgrade-title">ON Club</h3>
          <p className="trial-upgrade-subtitle">AI trenér 24/7, habit tracker, komunita a video konzultace</p>
          <span className="trial-upgrade-price">1 499 Kč/měsíc</span>
          <span className="trial-upgrade-cta">Připojit se k ON Clubu →</span>
        </a>
        <a href="/chci-vip" className="trial-upgrade-card trial-upgrade-card--vip">
          <h3 className="trial-upgrade-title">VIP Coaching</h3>
          <p className="trial-upgrade-subtitle">Elitní lidský kouč, týdenní 1:1 konzultace, strategie na míru</p>
          <span className="trial-upgrade-price">3 999 Kč/měsíc</span>
          <span className="trial-upgrade-cta">Chci VIP přístup →</span>
        </a>
      </div>
      {showStartCheckout && (
        <div id="start-subscribe-checkout" className="trial-banner-stripe">
          <p className="trial-banner-text trial-banner-text--small">Dokonči aktivaci START předplatného:</p>
          <PricingTable />
        </div>
      )}
    </>
  );
}
