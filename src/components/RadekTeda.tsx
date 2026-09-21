import React from 'react';
import { MessageCircle } from 'lucide-react';
import type { CoachTip } from '../types';
import { useTed } from '../context/TedContext';

/**
 * ZPRÁVA OD TEDA — PROMPT_DNES_WOW.md bod B (styl Future).
 *
 * Karta s avatarem TEDa a jednou zprávou z existujících `coachTips`
 * (`naZpravyTrenera`, první aktuální). ŽÁDNÉ NOVÉ VOLÁNÍ OpenAI — na úvodní
 * obrazovce by to stálo peníze při každém načtení.
 *
 * Tlačítko „Napsat TEDovi" otevře `CoachChatModal` přes `TedContext`; když
 * chat mimo `TedProvider` není (`dostupny === false`), tlačítko se nekreslí.
 * Bez zprávy má karta vlastní text s výzvou zeptat se — jen když chat je,
 * jinak se nekreslí vůbec.
 */
interface Props {
  tips: CoachTip[];
}

const AvatarTeda: React.FC = () => (
  <div
    aria-hidden="true"
    className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-lime-400 flex items-center justify-center text-[11px] font-black tracking-tight text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.35)]"
  >
    TED
  </div>
);

export const RadekTeda: React.FC<Props> = ({ tips }) => {
  const { zeptejSe, dostupny } = useTed();
  const tip = tips[0] ?? null;
  if (!tip && !dostupny) return null;

  return (
    <section aria-label="Zpráva od TEDa" className="rounded-3xl border border-cyan-500/20 bg-slate-900/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <AvatarTeda />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-400">TED · tvůj AI trenér</p>
          {tip ? (
            <>
              {tip.headline && <p className="mt-1 text-sm font-bold text-white break-words">{tip.headline}</p>}
              <p className="mt-1 text-sm text-slate-300 leading-relaxed break-words line-clamp-4">{tip.content}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-300 leading-relaxed">
              Zeptej se na cokoli kolem jídla, tréninku nebo dnešního plánu.
            </p>
          )}
          {dostupny && (
            <button
              type="button"
              onClick={() => zeptejSe()}
              className="mt-3 min-h-10 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/60 transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Napsat TEDovi
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
