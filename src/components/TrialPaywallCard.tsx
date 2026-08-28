import React, { useState } from 'react';
import { Lock, Flame } from 'lucide-react';
import { motion } from 'motion/react';
import type { ZamcenyPlan } from '../types';
import { spustitCheckout, type ProgramTier } from '../lib/stripeCheckout';
import {
  PRICING, START_FEATURES, START_PRICE_LABEL, TRIAL_DAYS, VIP_PRICE_LABEL,
} from '@lib/pricing';

interface TrialPaywallCardProps {
  plan: ZamcenyPlan | null;
}

const ON_CLUB = PRICING.find((p) => p.id === 'on-club');

function formatDatum(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * Zamčený další týden — jídelníček je hotový a vidět, ale za předplatné.
 *
 * Slučuje `PlanLockedPaywall` + `TrialExpiredPaywall` z `_legacy-next/components/`:
 * náš datový model (`zamceny_plan.zamceno`) na rozdíl od Next.js verze
 * nerozlišuje „čeká na platbu" vs. „trial vypršel" — obojí znamená totéž,
 * plán existuje a je zamčený.
 */
export const TrialPaywallCard: React.FC<TrialPaywallCardProps> = ({ plan }) => {
  const [loadingTier, setLoadingTier] = useState<ProgramTier | ''>('');
  const [chyba, setChyba] = useState('');

  if (!plan || !plan.zamceno) return null;

  const od = formatDatum(plan.validFrom);
  const doKdy = formatDatum(plan.validUntil);

  async function handleCheckout(tier: ProgramTier) {
    setChyba('');
    setLoadingTier(tier);
    try {
      const url = await spustitCheckout(tier);
      window.location.href = url;
    } catch (err) {
      setChyba(err instanceof Error ? err.message : 'Checkout se nepodařilo spustit.');
      setLoadingTier('');
    }
  }

  // Prodává se, jen co isTierCheckoutEnabled na serveru pustí (rozhodnutí
  // 29. 8.: jen START, ON Club a VIP až po rozhodnutí). Nedostupný tier se
  // nezobrazí vůbec — ani zašedlý, ani s „Připravujeme": obrazovka, jejímž
  // jediným úkolem je vzít peníze, nemá mít rozbitá tlačítka.
  // Tailwind potřebuje pro generování CSS literální třídy — `border-${barva}-500/30`
  // by v buildu nevzniklo, proto je `okraj` celý řetězec, ne poskládaný z barvy.
  const KARTY: Record<ProgramTier, { okraj: string; obsah: React.ReactNode }> = {
    START: {
      okraj: 'border-cyan-500/30',
      obsah: (
        <>
          <h4 className="font-bold text-white text-sm mb-1">START</h4>
          <p className="text-xs text-slate-400 mb-2">{TRIAL_DAYS} dní zdarma, pak {START_PRICE_LABEL}</p>
          <ul className="text-xs text-slate-400 mb-3 space-y-0.5">
            {START_FEATURES.slice(0, 3).map((f) => <li key={f}>· {f}</li>)}
          </ul>
          <button
            type="button"
            disabled={loadingTier !== ''}
            onClick={() => handleCheckout('START')}
            className="w-full py-2 rounded-xl text-sm font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 transition-colors"
          >
            {loadingTier === 'START' ? 'Načítám…' : 'Odemknout →'}
          </button>
        </>
      ),
    },
    ON_CLUB: {
      okraj: 'border-lime-500/30',
      obsah: (
        <>
          <h4 className="font-bold text-white text-sm mb-1">ON CLUB</h4>
          <p className="text-xs text-slate-400 mb-2">{ON_CLUB ? `${ON_CLUB.priceCzk.toLocaleString('cs-CZ')} Kč/měsíc` : ''}</p>
          <ul className="text-xs text-slate-400 mb-3 space-y-0.5">
            {(ON_CLUB?.features ?? []).slice(0, 3).map((f) => <li key={f}>· {f}</li>)}
          </ul>
          <button
            type="button"
            disabled={loadingTier !== ''}
            onClick={() => handleCheckout('ON_CLUB')}
            className="w-full py-2 rounded-xl text-sm font-bold text-black bg-lime-400 hover:bg-lime-300 disabled:opacity-50 transition-colors"
          >
            {loadingTier === 'ON_CLUB' ? 'Načítám…' : 'Vstoupit →'}
          </button>
        </>
      ),
    },
    VIP: {
      okraj: 'border-amber-400/30',
      obsah: (
        <>
          <h4 className="font-bold text-white text-sm mb-1">VIP COACHING</h4>
          <p className="text-xs text-slate-400 mb-2">{VIP_PRICE_LABEL}</p>
          <ul className="text-xs text-slate-400 mb-3 space-y-0.5">
            <li>· Osobní kouč</li>
            <li>· 1:1 videokonzultace</li>
            <li>· Prioritní podpora</li>
          </ul>
          <button
            type="button"
            disabled={loadingTier !== ''}
            onClick={() => handleCheckout('VIP')}
            className="w-full py-2 rounded-xl text-sm font-bold text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition-colors"
          >
            {loadingTier === 'VIP' ? 'Načítám…' : 'Chci VIP →'}
          </button>
        </>
      ),
    },
  };

  const dostupne = plan.dostupneTiery.filter((t) => KARTY[t]);
  const mrizka = dostupne.length === 1 ? 'grid-cols-1' : dostupne.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0e131d]/90 backdrop-blur-xl border border-amber-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-amber-950/60 border border-amber-400/40 flex items-center justify-center shrink-0">
          <Lock className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <h3 className="text-lg font-extrabold text-white">Tvůj další týden je připravený</h3>
          <p className="text-sm text-slate-400">
            {od && doKdy ? `${od} – ${doKdy}` : 'Nový jídelníček'}
            {plan.dailyCalories ? ` · ${plan.dailyCalories} kcal/den` : ''}
          </p>
        </div>
      </div>

      {plan.ukazkaJidel.length > 0 && (
        <ul className="space-y-1.5 mb-5">
          {plan.ukazkaJidel.map((jidlo, i) => (
            <li
              key={`${jidlo.typ}-${i}`}
              className="flex items-center justify-between text-sm rounded-xl px-3 py-2 bg-slate-900/60 border border-slate-800"
            >
              <span className="text-slate-300">
                <span className="text-slate-500 uppercase text-xs tracking-wide mr-2">{jidlo.typ}</span>
                {jidlo.nazev}
              </span>
              {jidlo.kcal != null && (
                <span className="text-amber-300 font-semibold flex items-center gap-1 shrink-0">
                  <Flame className="w-3.5 h-3.5" />{jidlo.kcal} kcal
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={`grid grid-cols-1 gap-3 ${mrizka}`}>
        {dostupne.map((tier) => (
          <article key={tier} className={`rounded-2xl p-4 bg-slate-900/60 border ${KARTY[tier].okraj}`}>
            {KARTY[tier].obsah}
          </article>
        ))}
      </div>

      {chyba && <p className="text-sm text-red-400 mt-3" role="alert">{chyba}</p>}
    </motion.div>
  );
};
