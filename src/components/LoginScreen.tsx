import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginScreenProps {
  /** Kam po prihlaseni. Bere se z ?redirect=, jinak profil. */
  redirectTo?: string;
  /** Prijde z /start po dokonceni registrace. */
  predvyplnenyEmail?: string;
  poRegistraci?: boolean;
  onPrejitNaRegistraci: () => void;
  onPrihlasen: (kam: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  redirectTo = '/profil',
  predvyplnenyEmail = '',
  poRegistraci = false,
  onPrejitNaRegistraci,
  onPrihlasen
}) => {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState(predvyplnenyEmail);
  const [heslo, setHeslo] = useState('');
  const [videtHeslo, setVidetHeslo] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hlaska, setHlaska] = useState<string | null>(
    poRegistraci ? 'Účet je vytvořený. Přihlas se stejným e-mailem.' : null
  );
  const [odesilam, setOdesilam] = useState(false);

  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (odesilam) return;
    setChyba(null);
    setHlaska(null);

    if (!email.trim() || !heslo) {
      setChyba('Vyplň e-mail i heslo.');
      return;
    }

    setOdesilam(true);
    const { error } = await signIn(email, heslo);
    if (error) {
      setChyba(error);
      setOdesilam(false);
      return;
    }
    onPrihlasen(redirectTo);
  };

  const obnovitHeslo = async () => {
    setChyba(null);
    setHlaska(null);
    if (!email.trim()) {
      setChyba('Nejdřív vyplň e-mail, na který ti pošleme odkaz.');
      return;
    }
    const { error } = await resetPassword(email);
    if (error) setChyba(error);
    else setHlaska('Poslali jsme ti odkaz na obnovu hesla. Zkontroluj i spam.');
  };

  const poleTridy =
    'w-full px-4 py-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-sm text-slate-100 ' +
    'placeholder:text-slate-600 outline-none transition-colors focus:border-cyan-500/60';

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
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5 select-none">
          <span>Body &amp; Mind</span>
          <span className="text-[#39ff14] font-extrabold drop-shadow-[0_0_12px_rgba(57,255,20,0.6)]">ON</span>
        </h1>
        <p className="mt-2 text-sm text-slate-400">Přihlas se a otevři svůj plán.</p>

        <form onSubmit={odeslat} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={poleTridy}
              placeholder="tvuj@email.cz"
            />
          </div>

          <div>
            <label htmlFor="heslo" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Heslo
            </label>
            <div className="relative">
              <input
                id="heslo"
                name="password"
                type={videtHeslo ? 'text' : 'password'}
                autoComplete="current-password"
                value={heslo}
                onChange={(e) => setHeslo(e.target.value)}
                className={poleTridy + ' pr-12'}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setVidetHeslo((v) => !v)}
                aria-label={videtHeslo ? 'Skrýt heslo' : 'Zobrazit heslo'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 transition-colors"
              >
                {videtHeslo ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={obnovitHeslo}
              className="mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            >
              Zapomenuté heslo?
            </button>
          </div>

          {chyba && (
            <div role="alert" className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {chyba}
            </div>
          )}
          {hlaska && !chyba && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
              {hlaska}
            </div>
          )}

          <button
            type="submit"
            disabled={odesilam}
            className="w-full py-3 rounded-2xl bg-[#39ff14] text-[#08090d] font-bold text-sm shadow-[0_0_24px_rgba(57,255,20,0.35)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {odesilam && <Loader2 className="w-4 h-4 animate-spin" />}
            {odesilam ? 'Přihlašuji…' : 'Přihlásit se'}
          </button>
        </form>

        <div className="mt-5 p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
          <p className="text-xs text-slate-400">
            Ještě nemáš účet?{' '}
            <button onClick={onPrejitNaRegistraci} className="text-[#39ff14] font-semibold hover:underline">
              Vytvořit účet (START)
            </button>
          </p>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Přihlášení běží přes Supabase Auth. Heslo se nikam neukládá.</span>
        </div>
      </motion.div>
    </div>
  );
};
