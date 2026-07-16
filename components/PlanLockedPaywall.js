import { useState } from 'react';
import {
  START_FEATURES,
  START_PRICE_LABEL,
  TRIAL_DAYS,
  VIP_PRICE_LABEL,
} from '../lib/pricing';
import { isOnClubSalesEnabled, isVipSalesEnabled } from '../lib/salesFeatureFlags';
import { supabase } from '../lib/supabaseClient';
import { createStripeCheckoutUrl } from '../lib/stripeCheckoutClient';

const ON_CLUB_FEATURES = [
  'Napojení chytrého zařízení — nastavení zdarma',
  'Vše ze STARTU',
  'AI trenér TED 24/7',
  'Soukromá komunita',
];

const VIP_FEATURES = [
  'Vše z ON CLUBU',
  'Osobní kouč',
  '1:1 videokonzultace',
  'Prioritní podpora',
];

/**
 * Stav `pending_payment` — účet i plán existují, uživatel ještě neprošel
 * checkoutem. Vybere si program a odemkne. START má 7 dní zdarma.
 *
 * Platí se přes Apple Pay / Google Pay, takže kartu obvykle nikdo neopisuje.
 */
export default function PlanLockedPaywall() {
  const [loadingTier, setLoadingTier] = useState('');
  const [error, setError] = useState('');

  const onClubEnabled = isOnClubSalesEnabled();
  const vipEnabled = isVipSalesEnabled();

  /** @param {'START'|'ON_CLUB'|'VIP'} tier */
  async function handleCheckout(tier) {
    setError('');
    setLoadingTier(tier);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Pro aktivaci se nejdřív přihlas.');
        return;
      }
      const url = await createStripeCheckoutUrl(tier, token);
      window.location.href = url;
    } catch (err) {
      setError(err?.message || 'Checkout se nepodařilo spustit.');
    } finally {
      setLoadingTier('');
    }
  }

  return (
    <aside className="trial-banner trial-banner--locked" role="status">
      <div className="plan-locked-head">
        <span className="plan-locked-icon" aria-hidden>🔒</span>
        <div>
          <p className="plan-locked-title">Tvůj plán je připravený</p>
          <p className="trial-banner-text trial-banner-text--small">
            Vyber si program a odemkni ho. Platíš přes Apple Pay, Google Pay nebo kartou — zrušíš kdykoliv jedním klikem.
          </p>
        </div>
      </div>

      <div className="trial-banner-upgrade-cards trial-paywall-grid plan-locked-grid">

        <article className="trial-upgrade-card trial-upgrade-card--start">
          <span className="trial-upgrade-badge trial-upgrade-badge--free">{TRIAL_DAYS} dní zdarma</span>
          <h3 className="trial-upgrade-title">START</h3>
          <p className="trial-upgrade-subtitle">Plán, jídelníček a prvních 12 týdnů s jasnou mapou.</p>
          <span className="trial-upgrade-price">{START_PRICE_LABEL}</span>
          <ul className="trial-paywall-features">
            {START_FEATURES.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <button
            type="button"
            className="trial-upgrade-cta trial-upgrade-cta--button"
            disabled={loadingTier !== ''}
            onClick={() => handleCheckout('START')}
          >
            {loadingTier === 'START' ? 'Načítám…' : `Odemknout — ${TRIAL_DAYS} dní zdarma →`}
          </button>
        </article>

        <article className="trial-upgrade-card trial-upgrade-card--club">
          <span className="trial-upgrade-badge">Doporučeno</span>
          <h3 className="trial-upgrade-title">ON CLUB</h3>
          <p className="trial-upgrade-subtitle">Napojíme chytré zařízení za tebe — nastavení zdarma. AI trenér TED a soukromá komunita.</p>
          <span className="trial-upgrade-price">1 499 Kč/měsíc</span>
          <ul className="trial-paywall-features">
            {ON_CLUB_FEATURES.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {onClubEnabled ? (
            <button
              type="button"
              className="trial-upgrade-cta trial-upgrade-cta--button"
              disabled={loadingTier !== ''}
              onClick={() => handleCheckout('ON_CLUB')}
            >
              {loadingTier === 'ON_CLUB' ? 'Načítám…' : 'Vstoupit do ON CLUBU →'}
            </button>
          ) : (
            <span className="trial-upgrade-cta trial-upgrade-cta--disabled">Připravujeme</span>
          )}
        </article>

        <article className="trial-upgrade-card trial-upgrade-card--vip">
          <h3 className="trial-upgrade-title">VIP COACHING</h3>
          <p className="trial-upgrade-subtitle">Osobní kouč, konzultace 1:1, strategie na míru.</p>
          <span className="trial-upgrade-price">{VIP_PRICE_LABEL}</span>
          <ul className="trial-paywall-features">
            {VIP_FEATURES.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {vipEnabled ? (
            <button
              type="button"
              className="trial-upgrade-cta trial-upgrade-cta--button"
              disabled={loadingTier !== ''}
              onClick={() => handleCheckout('VIP')}
            >
              {loadingTier === 'VIP' ? 'Načítám…' : 'Chci VIP →'}
            </button>
          ) : (
            <span className="trial-upgrade-cta trial-upgrade-cta--disabled">Připravujeme</span>
          )}
        </article>

      </div>

      {error ? (
        <p className="trial-banner-text trial-banner-text--small" role="alert">{error}</p>
      ) : null}
    </aside>
  );
}
