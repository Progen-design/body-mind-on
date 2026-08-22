import React, { useState } from 'react';
import { Brain, Sparkles, ChevronRight, MessageSquareCode, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CoachTip } from '../types';

interface AICoachBannerProps {
  tips: CoachTip[];
  onOpenChat: () => void;
}

export const AICoachBanner: React.FC<AICoachBannerProps> = ({
  tips,
  onOpenChat
}) => {
  const [activeTipIndex, setActiveTipIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // tips[activeTipIndex] || tips[0] bylo na prazdnem poli porad undefined
  // a nasledny currentTip.headline shodil stranku. Bez zpravy trenera
  // se banner nezobrazuje — prazdno je platny stav, ne chyba.
  const currentTip = tips[activeTipIndex] ?? tips[0];
  if (!currentTip) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="relative overflow-hidden rounded-3xl p-4 sm:p-5 bg-gradient-to-r from-[#0d1422]/90 via-[#0d1720]/85 to-[#0b1716]/90 backdrop-blur-xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-cyan-400/50 transition-all duration-300"
    >
      {/* Background glow effects */}
      <div className="absolute top-0 right-1/4 w-32 h-32 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-24 h-24 bg-lime-500/15 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3 mb-2">
          {/* AI Coach header with brain icon */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/70 border border-cyan-500/50 flex items-center justify-center shadow-[0_0_12px_rgba(0,242,254,0.35)]">
              <Brain className="w-4 h-4 text-[#00f2fe]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold tracking-wider uppercase text-white">
                AI Trenér Ted
              </span>
              {/* "Doporuceni dne" lhalo: uvitaci zprava z onboardingu je porad
                  platna, ale dnesni neni. Datum vzniku rozhoduje. */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                <Sparkles className="w-2.5 h-2.5 text-[#00f2fe]" />
                Zpráva od trenéra
              </span>
              {currentTip.timestamp && (
                <span className="text-[10px] text-slate-500">{currentTip.timestamp}</span>
              )}
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={onOpenChat}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-900/40 transition-all active:scale-95"
          >
            <span>Konzultovat</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        </div>

        {/* Tip content */}
        <div className="pl-1 sm:pl-10.5">
          <h4 className="text-sm sm:text-base font-semibold text-slate-100 mb-1 flex items-center gap-2">
            {currentTip.headline}
          </h4>
          <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed">
            {currentTip.content}
          </p>

          {/* Quick cycle dots if multiple tips */}
          {tips.length > 1 && (
            <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/80">
              <span className="text-[10px] text-slate-500 font-medium">Další postřehy:</span>
              {tips.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTipIndex(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === activeTipIndex
                      ? 'w-5 bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]'
                      : 'w-1.5 bg-slate-700 hover:bg-slate-500'
                  }`}
                  aria-label={`Zobrazit tip ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
