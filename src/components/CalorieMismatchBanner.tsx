import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { NesouladCile } from '../data/adaptery';

interface CalorieMismatchBannerProps {
  nesoulad: NesouladCile;
  onRegenerate: () => void;
  regenerating: boolean;
}

/**
 * Cíl a jídelníček ukazují jiné číslo — sdílené mezi profilem a jídelníčkem,
 * ať se text nerozejde na dvou místech stejně jako čísla, která hlásí
 * (docs/DALSI_KROK.md 7.2a). Watchdog (`calorie_target_mismatch`) tohle
 * detekuje už dnes; tohle je stejná kontrola, ale viditelná uživateli.
 *
 * VĚTA O DŮSLEDKU JE V BANNERU, NE V TOOLTIPU ANI AŽ V TOASTU PO KLIKU.
 * Server (`/api/profile-preferences` s `regenerateMealsOnly: true`) přegeneruje
 * jen jídla na nový cíl — trénink kopíruje beze změny ze stejného plánu
 * (`plan_id` se nemění, viz komentář tam), takže tréninková odškrtnutí
 * zůstanou platná. Odškrtnutá jídla za tenhle týden se ale ztratí, protože
 * jídla se opravdu mění — to musí být vidět PŘED klikem, ne až po něm.
 */
export const CalorieMismatchBanner: React.FC<CalorieMismatchBannerProps> = ({
  nesoulad,
  onRegenerate,
  regenerating
}) => (
  <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div className="flex items-start gap-2.5">
      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
      <p className="text-xs sm:text-sm text-amber-100/90">
        Jídelníček je postavený na {nesoulad.planKcal.toLocaleString('cs-CZ')} kcal, tvůj aktuální cíl je{' '}
        {nesoulad.cilKcal.toLocaleString('cs-CZ')} kcal. Přegenerování upraví jen jídla podle nového cíle —
        trénink zůstane beze změny, ale odškrtnutá jídla za tenhle týden se ztratí.
      </p>
    </div>
    <button
      onClick={onRegenerate}
      disabled={regenerating}
      className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 flex items-center justify-center gap-2 transition-all active:scale-95"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
      <span>{regenerating ? 'Přegeneruji…' : 'Přegenerovat jídelníček'}</span>
    </button>
  </div>
);
