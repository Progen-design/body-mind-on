import { useState } from 'react';
import { START_FEATURES, START_PRICE_LABEL, TRIAL_DAYS } from '../lib/pricing';
import { supabase } from '../lib/supabaseClient';
import { createStripeCheckoutUrl } from '../lib/stripeCheckoutClient';

/**
 * Stav `pending_payment` — účet i plán existují, ale uživatel ještě neprošel
 * checkoutem. Vidí, že je hotovo, a odemkne to jedním klikem.
 *
 * Platí se přes Apple Pay / Google Pay, takže kartu obvykle nikdo neopisuje.
 */
export default function PlanLockedPaywall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUnlock() {
    setError('');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Pro aktivaci se nejdřív přihlas.');
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
    <aside className="trial-banner trial-banner--locked" role="status">
      <div className="plan-locked-head">
        <span className="plan-locked-icon" aria-hidden>🔒</span>
        <div>
          <p className="plan-locked-title">Tvůj plán je připravený</p>
          <p className="trial-banner-text trial-banner-text--small">
            {`Odemkni ho a máš ${TRIAL_DAYS} dní zdarma. Platíš až ${TRIAL_DAYS + 1}. den — ${START_PRICE_LABEL}. Zrušíš kdykoliv jedním klikem.`}
          </p>
        </div>
      </div>

      <ul className="trial-paywall-features plan-locked-features">
        {START_FEATURES.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <button
        type="button"
        className="trial-upgrade-cta trial-upgrade-cta--button plan-locked-cta"
        disabled={loading}
        onClick={handleUnlock}
      >
        {loading ? 'Načítám…' : `Odemknout — ${TRIAL_DAYS} dní zdarma →`}
      </button>

      <p className="plan-locked-note">Apple Pay · Google Pay · karta</p>

      {error ? (
        <p className="trial-banner-text trial-banner-text--small" role="alert">{error}</p>
      ) : null}
    </aside>
  );
}
