import { START_PRICE_LABEL } from '../lib/pricing';
import { shouldShowTrialPlanScopeNote } from '../lib/planRenewalRules.js';

// Predikát žije v lib/planRenewalRules.js vedle ostatních pravidel o obnově
// plánu — komponenta s JSX se nedá naimportovat do testu v holém Node.
// Re-export drží dosavadní importy z téhle cesty.
export { shouldShowTrialPlanScopeNote };


/**
 * Nenápadná věta pro uživatele, kterému trial JEŠTĚ BĚŽÍ.
 *
 * PROČ EXISTUJE. Zjištěno 11. 8. 2026: profil měl paywall po expiraci
 * (TrialExpiredPaywall) i varování dva dny předem (TrialEndingSoonBanner), ale
 * uprostřed trialu uživatel nikde nevidí, že týdenní plán je až za předplatné.
 * Ze 43 členství jich 41 bylo přesně v tomhle stavu. Dozvěděli by se to teprve
 * tím, že v pondělí nepřijde plán.
 *
 * Není to paywall a nemá tlačítko — na prodej je banner dva dny před koncem
 * a paywall po něm. Tohle jen říká pravdu o tom, co je součástí trialu.
 *
 * @param {{ trialEndsAt?: string|null }} props
 */
export default function TrialPlanScopeNote({ trialEndsAt }) {
  const doKdy = (() => {
    if (!trialEndsAt) return null;
    const d = new Date(trialEndsAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
  })();

  return (
    <p className="trial-scope-note">
      {doKdy
        ? `Tvůj plán platí do ${doKdy}. Další týdenní plán je součástí předplatného (${START_PRICE_LABEL}).`
        : `Další týdenní plán je součástí předplatného (${START_PRICE_LABEL}).`}
      <style jsx>{`
        .trial-scope-note {
          margin: 0 0 16px;
          padding: 10px 14px;
          border-left: 3px solid rgba(148, 163, 184, 0.5);
          background: rgba(148, 163, 184, 0.08);
          border-radius: 0 8px 8px 0;
          font-size: 0.875rem;
          line-height: 1.5;
          color: #cbd5e1;
        }
      `}</style>
    </p>
  );
}
