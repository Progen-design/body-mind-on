import { useState } from 'react';
import { START_FEATURES, START_POST_TRIAL_OFFER, START_PRICE_LABEL, TRIAL_DAYS, VIP_PRICE_LABEL } from '../lib/pricing';
import { isOnClubSalesEnabled, isVipSalesEnabled } from '../lib/salesFeatureFlags';
import { supabase } from '../lib/supabaseClient';
import { createStripeCheckoutUrl } from '../lib/stripeCheckoutClient';

const WAITLIST_COPY = 'Připravujeme — přidej se na waitlist';

/**
 * Paywall po vypršení START programu – vlastní START karta,
 * ON Club + VIP dle feature flags. Checkout přes autentizovaný API endpoint.
 */
export default function TrialExpiredPaywall() {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const onClubEnabled = isOnClubSalesEnabled();
  const vipEnabled = isVipSalesEnabled();

  async function handleStartCheckout() {
    setCheckoutError('');
    setCheckoutLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setCheckoutError('Pro aktivaci předplatného se nejdřív přihlas.');
        return;
      }
      const url = await createStripeCheckoutUrl('START', token);
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err?.message || 'Checkout se nepodařilo spustit.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <>
      <p className="trial-banner-text">
        {`Tvůj ${TRIAL_DAYS}denní START program vypršel. Pro pokračování aktivuj předplatné ${START_PRICE_LABEL}.`}
      </p>
      <div className="trial-banner-upgrade-cards trial-paywall-grid">
        <article className="trial-upgrade-card trial-upgrade-card--start">
          <span className="trial-upgrade-badge trial-upgrade-badge--expired">Vypršelo</span>
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
            disabled={checkoutLoading}
            onClick={handleStartCheckout}
          >
            {checkoutLoading ? 'Načítám…' : `${START_POST_TRIAL_OFFER.cta.label} →`}
          </button>
          {checkoutError ? (
            <p className="trial-banner-text trial-banner-text--small" role="alert">{checkoutError}</p>
          ) : null}
        </article>
        {onClubEnabled ? (
          <a href="/on-club" className="trial-upgrade-card trial-upgrade-card--club">
            <span className="trial-upgrade-badge">Doporučeno</span>
            <h3 className="trial-upgrade-title">ON Club</h3>
            <p className="trial-upgrade-subtitle">AI trenér 24/7, habit tracker, komunita a video konzultace</p>
            <span className="trial-upgrade-price">1 499 Kč/měsíc</span>
            <span className="trial-upgrade-cta">Připojit se k ON Clubu →</span>
          </a>
        ) : (
          <article className="trial-upgrade-card trial-upgrade-card--club trial-upgrade-card--disabled">
            <span className="trial-upgrade-badge">Připravujeme</span>
            <h3 className="trial-upgrade-title">ON Club</h3>
            <p className="trial-upgrade-subtitle">AI trenér 24/7, habit tracker, komunita a video konzultace</p>
            <span className="trial-upgrade-price">1 499 Kč/měsíc</span>
            <span className="trial-upgrade-cta trial-upgrade-cta--disabled">{WAITLIST_COPY}</span>
          </article>
        )}
        {vipEnabled ? (
          <a href="/chci-vip" className="trial-upgrade-card trial-upgrade-card--vip">
            <h3 className="trial-upgrade-title">VIP Coaching</h3>
            <p className="trial-upgrade-subtitle">Elitní lidský kouč, týdenní 1:1 konzultace, strategie na míru</p>
            <span className="trial-upgrade-price">{VIP_PRICE_LABEL}</span>
            <span className="trial-upgrade-cta">Chci VIP přístup →</span>
          </a>
        ) : (
          <article className="trial-upgrade-card trial-upgrade-card--vip trial-upgrade-card--disabled">
            <span className="trial-upgrade-badge">Připravujeme</span>
            <h3 className="trial-upgrade-title">VIP Coaching</h3>
            <p className="trial-upgrade-subtitle">Elitní lidský kouč, týdenní 1:1 konzultace, strategie na míru</p>
            <span className="trial-upgrade-price">{VIP_PRICE_LABEL}</span>
            <span className="trial-upgrade-cta trial-upgrade-cta--disabled">{WAITLIST_COPY}</span>
          </article>
        )}
      </div>
    </>
  );
}
