import React from 'react';
import { Lock, CheckCircle2 } from 'lucide-react';
import { textNastavenehoPredplatneho, type StavPredplatneho } from '../lib/stavPredplatneho';

interface Props {
  /** `zamcenyPlan.zamceno` — bez zamčeného plánu není co prodávat, pruh se nekreslí. */
  zamceno: boolean;
  /** `profile.trialDniDoKonce`. null = mimo trial (např. platba jen čeká na dokončení). */
  trialDniDoKonce: number | null;
  onOtevritPredplatne: () => void;
  /**
   * `trial_s_kartou` = předplatné už nastavené (po Checkoutu v trialu).
   * Pak se neprodává: klidná věta s datem první platby, žádné „Odemknout" —
   * druhé kliknutí by jinak vedlo k druhému předplatnému.
   */
  stavPredplatneho?: StavPredplatneho;
  /** Konec trialu = den první platby. */
  trialKonci?: string | null;
  /** Nastavený tarif (`profile.membershipPlan`) — po upgradu v trialu ON CLUB. */
  plan?: string;
}

function textOdpoctu(dny: number | null): string {
  if (dny == null) return 'Tvůj další týden čeká na odemknutí';
  if (dny <= 0) return 'Zkušební období končí dnes';
  if (dny === 1) return 'Zkušební období končí za 1 den';
  if (dny < 5) return `Zkušební období končí za ${dny} dny`;
  return `Zkušební období končí za ${dny} dní`;
}

/**
 * ÚZKÝ PRODEJNÍ PRUH POD HLAVIČKOU (PROMPT_UX_DNES.md bod A.2 + C).
 *
 * Jediný prodej v horní části Dnes — jeden řádek, žádná karta, žádné ceny.
 * Plné srovnání START/ON Club žije jen na dvou místech: tady (jen countdown
 * + tlačítko) a v „Účet a předplatné" (celé, viz UcetASpravaSection).
 * Výška je pevně `h-12` (48 px), ať pruh nikdy nezačne vypadat jako karta.
 */
export const TrialCountdownStrip: React.FC<Props> = ({
  zamceno,
  trialDniDoKonce,
  onOtevritPredplatne,
  stavPredplatneho,
  trialKonci = null,
  plan = 'START',
}) => {
  if (stavPredplatneho === 'trial_s_kartou') {
    return (
      <div className="flex items-start gap-2.5 min-h-12 px-4 py-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/30">
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-akcent-lime" />
        <span className="text-xs sm:text-sm text-emerald-100 leading-snug">{textNastavenehoPredplatneho(trialKonci, plan)}</span>
      </div>
    );
  }
  if (!zamceno) return null;

  return (
    <div className="flex items-center justify-between gap-3 h-12 px-4 rounded-2xl border border-amber-400/30 bg-amber-950/30">
      <span className="min-w-0 truncate text-xs sm:text-sm font-semibold text-amber-200 inline-flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{textOdpoctu(trialDniDoKonce)}</span>
      </span>
      <button
        type="button"
        onClick={onOtevritPredplatne}
        className="shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-colors"
      >
        Odemknout
      </button>
    </div>
  );
};
