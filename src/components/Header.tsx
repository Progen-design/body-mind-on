import React from 'react';
import { Menu, Bell, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HeaderProps {
  onOpenMenu: () => void;
  onOpenCoach: () => void;
  isMenuOpen: boolean;
  onCloseMenu: () => void;
  onSelectTab?: (tab: any) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenMenu,
  onOpenCoach,
  isMenuOpen,
  onCloseMenu,
  onSelectTab
}) => {
  return (
    <header className="relative z-30 flex items-center justify-between py-4 px-2 sm:px-4 mb-2">
      {/* Brand Logo matching screenshot */}
      <div className="flex items-center gap-2 select-none">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-1.5">
          <span>Body &amp; Mind</span>
          <span className="text-[#39ff14] font-extrabold drop-shadow-[0_0_12px_rgba(57,255,20,0.6)]">
            ON
          </span>
        </h1>
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
          PRO
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick AI Coach trigger */}
        <button
          onClick={onOpenCoach}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#111927]/90 text-[#00f2fe] border border-[#00f2fe]/40 hover:border-[#00f2fe] hover:bg-[#00f2fe]/10 transition-all shadow-[0_0_12px_rgba(0,242,254,0.2)] active:scale-95"
          title="AI Trenér Ted"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#00f2fe] animate-pulse" />
          <span className="hidden xs:inline">AI Trenér</span>
        </button>

        {/* Hamburger Menu button */}
        <button
          onClick={onOpenMenu}
          className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 transition-all active:scale-95"
          aria-label="Menu"
        >
          {isMenuOpen ? (
            <X className="w-5 h-5 text-slate-300" />
          ) : (
            <Menu className="w-5 h-5 text-slate-300" />
          )}
        </button>
      </div>

      {/* Slide-out Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMenu}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-[#0c1017] border-l border-cyan-500/20 z-50 p-6 flex flex-col justify-between shadow-[0_0_50px_rgba(0,0,0,0.8)]"
            >
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">Body &amp; Mind</span>
                    <span className="text-[#39ff14] font-black">ON</span>
                  </div>
                  <button
                    onClick={onCloseMenu}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-6 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3">
                    Navigace &amp; Přehled
                  </div>
                  {[
                    { id: 'dnes', label: 'Hlavní přehled (Bento Grid)' },
                    { id: 'profil', label: 'Můj Profil & Cíle' },
                    { id: 'vaha', label: 'Tělesné složení & Váha' },
                    { id: 'jidelnicek', label: 'Jídelníček & Recepty' },
                    { id: 'trenink', label: 'Tréninkový plán & Stopky' },
                    { id: 'regenerace', label: 'Apple Watch & Regenerace' },
                    { id: 'naviky', label: 'Denní návyky & Streaky' },
                    { id: 'nakup', label: 'Nákupní seznam' }
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onCloseMenu();
                        if (onSelectTab) onSelectTab(item.id);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-900/80 border border-transparent hover:border-slate-800 text-xs font-semibold transition-all text-left"
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      onCloseMenu();
                      onOpenCoach();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 text-xs font-semibold transition-all mt-2"
                  >
                    <span>AI Trenér TED (Konzultace)</span>
                    <Sparkles className="w-4 h-4 text-[#00f2fe]" />
                  </button>
                </div>

                <div className="mt-8 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3">
                    Integrace &amp; Zařízení
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-200">Withings Body Scan</div>
                      <div className="text-[11px] text-emerald-400">Připojeno • Baterie 92%</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse"></div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-200">Apple Health / Garmin</div>
                      <div className="text-[11px] text-cyan-400">Aktivní synchronizace</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-[#00f2fe]"></div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 text-center">
                Body &amp; Mind ON Platform v3.4 • Pro
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};
