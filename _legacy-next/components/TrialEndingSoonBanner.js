import { useState } from 'react';
import { START_PRICE_LABEL } from '../lib/pricing';
import { supabase } from '../lib/supabaseClient';
import { createStripeCheckoutUrl } from '../lib/stripeCheckoutClient';

/** Kolik dní před koncem trialu začneme upozorňovat. */
export const TRIAL_WARNING_DAYS = 2;

/**
 * Rozhodne, jestli se má banner zobrazit.
 * Vytaženo ven, aby to šlo testovat bez renderu.
 *
 * @param {{ membershipStatus?: string, isTrialExpired?: boolean, daysUntilTrialEnd?: number|null }} p
 * @returns {boolean}
 */
export function shouldShowTrialEndingSoon({ membershipStatus, isTrialExpired, daysUntilTrialEnd }) {
  if (membershipStatus !== 'trial') return false;
  if (isTrialExpired) return false; // po vypršení jede paywall, ne tenhle banner
  const days = Number(daysUntilTrialEnd);
  if (!Number.isFinite(days)) return false;
  return days >= 0 && days <= TRIAL_WARNING_DAYS;
}

/**
 * @param {number} days
 * @returns {string}
 */
function countdownLabel(days) {
  if (days <= 0) return 'Zkušební období končí dnes.';
  if (days === 1) return 'Zkušební období končí zítra.';
  return `Zkušební období končí za ${days} dny.`;
}

/**
 * Varovný banner 2 dny (a méně) před koncem trialu.
 * Nabízí aktivaci předplatného dřív, než uživatel ztratí přístup k plánu.
 *
 * @param {{ daysUntilTrialEnd: number|null }} props
 */
export default function TrialEndingSoonBanner({ daysUntilTrialEnd }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const days = Number(daysUntilTrialEnd);
  const safeDays = Number.isFinite(days) ? Math.max(0, days) : 0;

  async function handleActivate() {
    setError('');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Pro aktivaci předplatného se nejdřív přihlas.');
        return;
      }
      const url = await createStripeCheckoutUrl('START', token);
      window.location.href = url;
    } catch (err) {
      setError(err?.message || 'Checkout se nepodařilo spustit.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="trial-banner trial-banner--soon" role="status">
      <div className="trial-warning-row">
        <div className="trial-warning-copy">
          <p className="trial-warning-title">{countdownLabel(safeDays)}</p>
          <p className="trial-banner-text trial-banner-text--small">
            {`Aktivuj předplatné za ${START_PRICE_LABEL} a plán ti poběží dál bez přerušení. Zrušit můžeš kdykoliv.`}
          </p>
        </div>
        <button
          type="button"
          className="trial-upgrade-cta trial-upgrade-cta--button"
          disabled={loading}
          onClick={handleActivate}
        >
          {loading ? 'Načítám…' : 'Aktivovat předplatné →'}
        </button>
      </div>
      {error ? (
        <p className="trial-banner-text trial-banner-text--small" role="alert">{error}</p>
      ) : null}
    </aside>
  );
}
