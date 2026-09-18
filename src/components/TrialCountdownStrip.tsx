import React from 'react';
import { Lock } from 'lucide-react';

interface Props {
  /** `zamcenyPlan.zamceno` — bez zamčeného plánu není co prodávat, pruh se nekreslí. */
  zamceno: boolean;
  /** `profile.trialDniDoKonce`. null = mimo trial (např. platba jen čeká na dokončení). */
  trialDniDoKonce: number | null;
  onOtevritPredplatne: () => void;
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
  onOtevritPredplatne
}) => {
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
