import React from 'react';
import { Mail, Calendar, Edit3 } from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile, UserPreferences } from '../types';
import { Avatar } from './Avatar';
import { useAuth } from '../context/AuthContext';
import { MembershipStatusBadge } from './MembershipStatusBadge';

// KDO JE PŘIHLÁŠENÝ — první věc na stránce.
//
// Hlavička byla do 9. 9. 2026 součástí `ProfileSection`, tedy až pod
// dneškem a jídelníčkem. Jenže je to jediné místo, kde je vidět, čí plán
// se právě zobrazuje: jméno, stav členství, e-mail, věk, výška. Když se
// v aplikaci střídají profily nebo si je někdo otevře na sdíleném počítači,
// je to určující údaj a patří nahoru.
//
// Samostatná komponenta je jediný způsob, jak ji dostat NAD `DnesniPrehled`
// a zbytek profilu (váha, cíle, makra) nechat níž — uvnitř `ProfileSection`
// by musela zůstat spolu s ním.

interface Props {
  profile: UserProfile;
  preferences: UserPreferences;
  /** ISO datum narození. null = věk se nezobrazí. */
  birthDate?: string | null;
  /** ISO datum registrace. null = řádek „Člen od" se nezobrazí. */
  registrovanOd?: string | null;
  onEditPreferences: () => void;
}

export const ProfilHlavicka: React.FC<Props> = ({
  profile,
  preferences,
  birthDate = null,
  registrovanOd = null,
  onEditPreferences,
}) => {
  const { account, loggedInAt } = useAuth();

  // Věk z data narození. Dřív tu bylo natvrdo „34 let" bez ohledu na to,
  // kdo je přihlášený.
  const vekLet = React.useMemo(() => {
    const t = Date.parse(String(birthDate || ''));
    if (!Number.isFinite(t)) return null;
    const nar = new Date(t);
    const dnes = new Date();
    let vek = dnes.getFullYear() - nar.getFullYear();
    const m = dnes.getMonth() - nar.getMonth();
    if (m < 0 || (m === 0 && dnes.getDate() < nar.getDate())) vek--;
    return vek >= 0 && vek < 130 ? vek : null;
  }, [birthDate]);

  /** „2. 8. 2026" — datum registrace. Bez data se řádek nekreslí. */
  const clenOd = React.useMemo(() => {
    const t = Date.parse(String(registrovanOd || ''));
    if (!Number.isFinite(t)) return null;
    return new Date(t).toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
  }, [registrovanOd]);

  const loggedInText = loggedInAt
    ? new Date(loggedInAt).toLocaleString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-7 bg-povrch/90 backdrop-blur-2xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        {/* Avatar & identita */}
        <div className="flex items-center gap-4 sm:gap-5 min-w-0">
          <div className="relative shrink-0">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden p-1 bg-gradient-to-tr from-akcent-cyan via-cyan-600 to-akcent-lime shadow-[0_0_20px_rgba(0,242,254,0.3)]">
              <Avatar
                jmeno={account?.name || profile.name}
                src={account?.avatarUrl || profile.avatarUrl}
                className="w-full h-full rounded-xl bg-slate-900"
                textClassName="text-2xl sm:text-3xl"
              />
            </div>
            <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-akcent-lime border-2 border-povrch shadow-[0_0_10px_var(--color-akcent-lime)]" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {account?.name || profile.name}
              </h2>
              <MembershipStatusBadge
                status={profile.status}
                trialDniDoKonce={profile.trialDniDoKonce}
                variant="section"
              />
            </div>

            {account?.email && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 min-w-0">
                <Mail className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span className="truncate">{account.email}</span>
              </p>
            )}

            {/* TENHLE ŘÁDEK BYL PRÁZDNÝ ŠTÍT.
                Kreslil ikonu a vedle ní `profile.membershipPlan`, jenže ten
                se plní z `user_metadata.membership_plan`, kam nikdo nic
                nezapisuje — ověřeno na produkci 23. 8. 2026, hodnota je
                `null`. Tarif žije ve Stripe; místo něj je tu datum
                registrace, které je skutečné. */}
            {clenOd && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span>Člen od {clenOd}</span>
              </p>
            )}

            {/* Věk i výška jdou z dat. Chybějící hodnota se nezobrazí —
                dřív tu svítilo natvrdo „34 let" a „Fáze: Hypertrofie 6/12",
                která neměla zdroj nikde. */}
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-2 flex-wrap">
              {vekLet !== null && (
                <span>Věk: <strong className="text-slate-200">{vekLet} let</strong></span>
              )}
              {preferences.currentHeightCm > 0 && (
                <>
                  {vekLet !== null && <span>•</span>}
                  <span>Výška: <strong className="text-slate-200">{preferences.currentHeightCm} cm</strong></span>
                </>
              )}
              {loggedInText !== '—' && (
                <>
                  {(vekLet !== null || preferences.currentHeightCm > 0) && <span>•</span>}
                  <span>Přihlášen: <strong className="text-slate-200">{loggedInText}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* JEDNO ODHLÁŠENÍ, A TO V MENU.
            Tlačítko „Odhlásit se" tu bylo podruhé — vedle stejného
            v hamburger menu (Header.tsx). Menu je dostupné ze všech
            záložek, tenhle blok jen z profilu, takže zůstalo to v menu. */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={onEditPreferences}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 transition-all active:scale-95 shadow-sm"
          >
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Upravit cíle</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
