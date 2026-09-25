import React from 'react';
import { PauseCircle } from 'lucide-react';
import { START_PRICE_CZK } from '../../lib/pricingConstants.js';

interface Props {
  onOdemknout: () => void;
  /** Checkout se právě zakládá — tlačítko se zablokuje. */
  odemykam?: boolean;
  /** Hláška serveru, když Checkout nevyšel. */
  chyba?: string | null;
}

const NADPIS_PLAN_POZASTAVENY = 'Zkušební období skončilo — plán je pozastavený';
const TLACITKO_ODEMKNOUT_START = `Odemknout START za ${START_PRICE_CZK} Kč`;

/**
 * ZAMČENÝ PLÁN PO TRIALU — jeden jasný stav místo prázdných sekcí.
 *
 * Trial bez karty skončil (stavPredplatneho.ts → jePlanPozastaveny). Dřív
 * Dnes, Jídelníček i Trénink kreslily dál svoje karty nad propadlým plánem:
 * prázdná časová osa, nulové kroužky, TED bez odpovědi. Teď jedna věta, co
 * se stalo, že se nic nesmazalo, a JEDNO tlačítko do Checkoutu.
 *
 * Čistá prezentace bez volání API — render test v PlanPozastaveny.test.ts.
 * Checkout obstarává obal PlanPozastaveny.tsx.
 */
export const PlanPozastavenyKarta: React.FC<Props> = ({ onOdemknout, odemykam = false, chyba = null }) => (
  <section
    aria-labelledby="plan-pozastaveny-nadpis"
    className="rounded-3xl p-5 sm:p-6 bg-karta/90 border border-amber-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
  >
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-2xl bg-amber-950/60 border border-amber-400/40 flex items-center justify-center shrink-0">
        <PauseCircle className="w-5 h-5 text-amber-300" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h2 id="plan-pozastaveny-nadpis" className="text-lg font-extrabold text-white leading-snug">
          {NADPIS_PLAN_POZASTAVENY}
        </h2>
        <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
          Nic se nesmazalo. Plán, recepty i TED na tebe počkají — pokračuješ tam, kde jsi skončil.
        </p>
      </div>
    </div>
    <button
      type="button"
      onClick={onOdemknout}
      disabled={odemykam}
      className="mt-5 w-full sm:w-auto min-h-11 px-5 rounded-xl text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 transition-colors"
    >
      {odemykam ? 'Otevírám platbu…' : TLACITKO_ODEMKNOUT_START}
    </button>
    <p className="text-xs text-slate-500 mt-2.5">Měsíčně, zrušíš kdykoli jedním klepnutím v profilu.</p>
    {chyba && <p role="alert" className="text-xs text-rose-400 mt-2">{chyba}</p>}
  </section>
);
