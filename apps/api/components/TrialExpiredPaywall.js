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
  const [loadingTier, setLoadingTier] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const onClubEnabled = isOnClubSalesEnabled();
  const vipEnabled = isVipSalesEnabled();

  /**
   * Přihlášený uživatel jde VŽDY rovnou do Stripe checkoutu.
   *
   * Dřív tu byl odkaz na /on-club — a to je registrační trychtýř.
   * Člověk, který už účet má, se tím posílal, aby se zaregistroval znovu.
   *
   * @param {'START'|'ON_CLUB'|'VIP'} tier
   */
  async function handleCheckout(tier) {
    setCheckoutError('');
    setLoadingTier(tier);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setCheckoutError('Pro aktivaci předplatného se nejdřív přihlas.');
        return;
      }
      const url = await createStripeCheckoutUrl(tier, token);
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err?.message || 'Checkout se nepodařilo spustit.');
    } finally {
      setLoadingTier('');
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
            disabled={loadingTier !== ''}
            onClick={() => handleCheckout('START')}
          >
            {loadingTier === 'START' ? 'Načítám…' : `${START_POST_TRIAL_OFFER.cta.label} →`}
          </button>
        </article>

        <article className="trial-upgrade-card trial-upgrade-card--club">
          <span className="trial-upgrade-badge">{onClubEnabled ? 'Doporučeno' : 'Připravujeme'}</span>
          <h3 className="trial-upgrade-title">ON Club</h3>
          <p className="trial-upgrade-subtitle">AI trenér 24/7, habit tracker, komunita a video konzultace</p>
          <span className="trial-upgrade-price">1 499 Kč/měsíc</span>
          {onClubEnabled ? (
            <button
              type="button"
              className="trial-upgrade-cta trial-upgrade-cta--button"
              disabled={loadingTier !== ''}
              onClick={() => handleCheckout('ON_CLUB')}
            >
              {loadingTier === 'ON_CLUB' ? 'Načítám…' : 'Připojit se k ON Clubu →'}
            </button>
          ) : (
            <span className="trial-upgrade-cta trial-upgrade-cta--disabled">{WAITLIST_COPY}</span>
          )}
        </article>

        <article className="trial-upgrade-card trial-upgrade-card--vip">
          <span className="trial-upgrade-badge">{vipEnabled ? 'Osobní kouč' : 'Připravujeme'}</span>
          <h3 className="trial-upgrade-title">VIP Coaching</h3>
          <p className="trial-upgrade-subtitle">Elitní lidský kouč, týdenní 1:1 konzultace, strategie na míru</p>
          <span className="trial-upgrade-price">{VIP_PRICE_LABEL}</span>
          {vipEnabled ? (
            <button
              type="button"
              className="trial-upgrade-cta trial-upgrade-cta--button"
              disabled={loadingTier !== ''}
              onClick={() => handleCheckout('VIP')}
            >
              {loadingTier === 'VIP' ? 'Načítám…' : 'Chci VIP přístup →'}
            </button>
          ) : (
            <span className="trial-upgrade-cta trial-upgrade-cta--disabled">{WAITLIST_COPY}</span>
          )}
        </article>
      </div>

      {checkoutError ? (
        <p className="trial-banner-text trial-banner-text--small" role="alert">{checkoutError}</p>
      ) : null}
    </>
  );
}
