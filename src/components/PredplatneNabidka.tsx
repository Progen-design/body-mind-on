import React, { useState } from 'react';
import { motion } from 'motion/react';
import type { ZamcenyPlan } from '../types';
import { spustitCheckout, type ProgramTier } from '../lib/stripeCheckout';
import {
  PRICING, START_REASONS, START_PRICE_LABEL, CANCEL_ANYTIME_LINE, TRIAL_DAYS, VIP_PRICE_LABEL,
} from '@lib/pricing';

interface Props {
  plan: ZamcenyPlan | null;
  /**
   * Předplatné START je už nastavené (trial s kartou / aktivní) → karta START
   * se nekreslí (druhé „Odemknout" by založilo druhé předplatné). ON Club
   * a VIP zůstávají jako upgrade.
   */
  bezStartu?: boolean;
}

const ON_CLUB = PRICING.find((p) => p.id === 'on-club');

/**
 * PLNÉ SROVNÁNÍ START / ON CLUB / VIP (PROMPT_UX_DNES.md bod A.8 + C).
 *
 * Žije jen tady (uvnitř „Účet a předplatné") a jako úzký countdown pruh pod
 * hlavičkou (TrialCountdownStrip) — nikde jinde. Karta „Tvůj další týden"
 * (TrialPaywallCard) ukazuje ukázku jídel, ne ceny.
 *
 * Odrážky u STARTu jsou DŮVODY ke koupi (START_REASONS), ne výčet funkcí —
 * ten výčet (`START_FEATURES`) je pro onboarding/marketing, tohle je
 * prodejní text karty. Poslední odrážka (zrušení kdykoli) sundává riziko
 * z rozhodnutí a patří vždycky dole; ON Club dostává stejnou větu navíc
 * ke svým dosavadním odrážkám.
 */
export const PredplatneNabidka: React.FC<Props> = ({ plan, bezStartu = false }) => {
  const [loadingTier, setLoadingTier] = useState<ProgramTier | ''>('');
  const [chyba, setChyba] = useState('');

  if (!plan || !plan.zamceno) return null;

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

  // Prodává se, jen co isTierCheckoutEnabled na serveru pustí — nedostupný
  // tier se nezobrazí vůbec, ani zašedlý.
  const KARTY: Record<ProgramTier, { okraj: string; obsah: React.ReactNode }> = {
    START: {
      okraj: 'border-cyan-500/30',
      obsah: (
        <>
          <h4 className="font-bold text-white text-sm mb-1">START</h4>
          <p className="text-xs text-slate-400 mb-2">{TRIAL_DAYS} dní zdarma, pak {START_PRICE_LABEL}</p>
          <ul className="text-xs text-slate-400 mb-3 space-y-0.5">
            {START_REASONS.map((duvod) => <li key={duvod}>· {duvod}</li>)}
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
            {(ON_CLUB?.features ?? []).map((f) => <li key={f}>· {f}</li>)}
            <li>· {CANCEL_ANYTIME_LINE}</li>
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
            <li>· {CANCEL_ANYTIME_LINE}</li>
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

  const dostupne = plan.dostupneTiery.filter((t) => KARTY[t] && !(bezStartu && t === 'START'));
  if (dostupne.length === 0) return null;
  const mrizka = dostupne.length === 1 ? 'grid-cols-1' : dostupne.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`grid grid-cols-1 gap-3 ${mrizka}`}
    >
      {dostupne.map((tier) => (
        <article key={tier} className={`rounded-2xl p-4 bg-slate-900/60 border ${KARTY[tier].okraj}`}>
          {KARTY[tier].obsah}
        </article>
      ))}

      {chyba && <p className="text-sm text-red-400 sm:col-span-full" role="alert">{chyba}</p>}
    </motion.div>
  );
};
