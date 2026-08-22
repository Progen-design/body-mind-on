import React, { useState } from 'react';
import { Check, LogOut, Menu, Repeat, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';

interface HeaderProps {
  onOpenMenu: () => void;
  isMenuOpen: boolean;
  onCloseMenu: () => void;
  onSelectTab?: (tab: any) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenMenu,
  isMenuOpen,
  onCloseMenu,
  onSelectTab
}) => {
  const { account, logout } = useAuth();
  const { showToast } = useToast();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  const handleConfirmLogout = () => {
    setIsLogoutDialogOpen(false);
    onCloseMenu();
    logout();
    showToast({
      title: 'Odhlášeno',
      description: 'Tvoje data zůstávají uložená na účtu.',
      variant: 'info'
    });
  };



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

        {/* Přihlášený uživatel — klikem otevře menu s přepnutím profilu */}
        {account && (
          <button
            onClick={onOpenMenu}
            className="flex items-center gap-2 pl-1 pr-1 sm:pr-3 py-1 rounded-full bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-cyan-500/40 transition-all active:scale-95"
            title={`Přihlášen: ${account.name}`}
          >
            <img
              src={account.avatarUrl}
              alt={account.name}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full object-cover bg-slate-800"
            />
            <span className="hidden sm:inline text-xs font-semibold text-slate-300 max-w-[7rem] truncate">
              {account.name.split(' ')[0]}
            </span>
          </button>
        )}

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
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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

                {/* Přihlášený uživatel & přepnutí profilu */}
                {account && (
                  <div className="mt-5 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-1">
                      Přihlášený účet
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-900/70 border border-cyan-500/25 flex items-center gap-3">
                      <img
                        src={account.avatarUrl}
                        alt={account.name}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl object-cover bg-slate-800 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-100 truncate">{account.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">{account.email}</div>
                        <div className="text-[10px] text-cyan-400 font-semibold mt-0.5">{account.role}</div>
                      </div>
                    </div>

                  </div>
                )}

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

              <div className="pt-4 mt-4 border-t border-slate-800 space-y-3 shrink-0">
                {/* Výrazné odhlášení */}
                <button
                  onClick={() => setIsLogoutDialogOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold text-red-300 bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 hover:border-red-400 shadow-[0_0_18px_rgba(239,68,68,0.2)] transition-all active:scale-95"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Odhlásit se</span>
                </button>

                <div className="text-xs text-slate-500 text-center">
                  Body &amp; Mind ON Platform v3.4 • Pro
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={isLogoutDialogOpen}
        title="Opravdu se chceš odhlásit?"
        description="Aplikace se zamkne a budeš se muset znovu přihlásit. Naměřená data, jídelníček i návyky zůstanou uložené na tvém účtu."
        confirmLabel="Odhlásit se"
        cancelLabel="Zůstat přihlášen"
        tone="danger"
        icon={LogOut}
        onConfirm={handleConfirmLogout}
        onCancel={() => setIsLogoutDialogOpen(false)}
      />
    </header>
  );
};
