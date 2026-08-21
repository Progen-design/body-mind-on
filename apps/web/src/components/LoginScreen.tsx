import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Lock, ShieldCheck } from 'lucide-react';
import { AccountProfile } from '../types';

interface LoginScreenProps {
  accounts: AccountProfile[];
  onLogin: (accountId: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ accounts, onLogin }) => {
  return (
    <div className="min-h-screen bg-[#08090d] text-slate-100 relative overflow-x-hidden font-['Plus_Jakarta_Sans',sans-serif] flex items-center justify-center p-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-b from-cyan-500/10 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-0 w-[550px] h-[450px] bg-lime-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md rounded-3xl bg-[#0c1017]/95 backdrop-blur-2xl border border-cyan-500/25 shadow-[0_8px_40px_rgba(0,0,0,0.6)] p-6 sm:p-8"
      >
        <div className="flex items-center gap-2 select-none">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5">
            <span>Body &amp; Mind</span>
            <span className="text-[#39ff14] font-extrabold drop-shadow-[0_0_12px_rgba(57,255,20,0.6)]">
              ON
            </span>
          </h1>
        </div>

        <div className="mt-5 flex items-center gap-2.5 p-3 rounded-2xl bg-slate-900/70 border border-slate-800">
          <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
          <p className="text-xs text-slate-400">
            Jsi odhlášený. Tvoje data zůstala uložená na tomto zařízení — vyber profil a pokračuj.
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-1">
            Profily na tomto zařízení
          </div>
          {accounts.map(account => (
            <button
              key={account.id}
              onClick={() => onLogin(account.id)}
              className="w-full p-3 rounded-2xl bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/40 transition-all active:scale-[0.99] flex items-center gap-3 text-left"
            >
              <img
                src={account.avatarUrl}
                alt={account.name}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-xl object-cover bg-slate-800 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-100 truncate">{account.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{account.email}</div>
                <div className="text-[10px] text-cyan-400 font-semibold mt-0.5">{account.role}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
            </button>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Biometrická data zůstávají šifrovaná na tomto zařízení.</span>
        </div>
      </motion.div>
    </div>
  );
};
