import React from 'react';
import { Sparkles } from 'lucide-react';
import type { CoachTip } from '../types';
import { useTed } from '../context/TedContext';

/**
 * ŘÁDEK TEDA — PROMPT_DNES_HERO.md bod 2, samostatná sekce mezi hero
 * „Tvůj den" a „Jídla dnes" (ne součást hero karty).
 *
 * Jedna zpráva z existujících `coachTips` (`naZpravyTrenera`, první
 * aktuální) + tlačítko „Zeptat se" (otevře `CoachChatModal` přes
 * `TedContext`). ŽÁDNÉ NOVÉ VOLÁNÍ OpenAI — na úvodní obrazovce by to
 * stálo peníze při každém načtení. Bez zprávy se řádek vůbec nekreslí.
 */
interface Props {
  tips: CoachTip[];
}

export const RadekTeda: React.FC<Props> = ({ tips }) => {
  const { zeptejSe } = useTed();
  const tip = tips[0] ?? null;
  if (!tip) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan-500/20 bg-slate-900/50 px-4 py-3">
      <div className="min-w-0 flex items-center gap-2.5">
        <Sparkles className="w-4 h-4 text-akcent-cyan shrink-0" />
        <p className="truncate text-xs sm:text-sm text-slate-300">{tip.content}</p>
      </div>
      <button
        type="button"
        onClick={() => zeptejSe()}
        className="shrink-0 min-h-9 px-3 rounded-lg text-xs font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/60 transition-all"
      >
        Zeptat se
      </button>
    </div>
  );
};
