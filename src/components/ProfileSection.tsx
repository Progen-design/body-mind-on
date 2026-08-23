import React, { useState } from 'react';
import {
  User,
  LogOut,
  Repeat,
  Check,
  Mail,
  ShieldCheck,
  Activity,
  Scale,
  Watch,
  Brain,
  Sliders,
  Sparkles,
  Trophy,
  Flame,
  Calendar,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  Edit3,
  Heart,
  Droplets,
  Moon,
  Dumbbell
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile, UserPreferences, WeightRecord, AppleWatchBiometrics, TelesneSlozeni } from '../types';
import { hodnotaNeboPomlcka, kdyMereno, zmenaText } from '../data/adaptery';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { NadpisSekce } from './NadpisSekce';
import { useTed } from '../context/TedContext';

interface ProfileSectionProps {
  profile: UserProfile;
  preferences: UserPreferences;
  latestWeightRecord: WeightRecord | null;
  biometrics: AppleWatchBiometrics;
  /** Z chytre vahy. null = dlazdice slozeni se nezobrazi. */
  slozeni?: TelesneSlozeni | null;
  /** ISO datum narozeni z profilu. null = vek se nezobrazi. */
  birthDate?: string | null;
  onEditPreferences: () => void;
  onSyncAll: () => void;
  onAddWeight: () => void;
  isSyncing?: boolean;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  profile,
  preferences,
  latestWeightRecord,
  biometrics,
  slozeni = null,
  birthDate = null,
  onEditPreferences,
  onSyncAll,
  onAddWeight,
  isSyncing = false
}) => {
  const { account, logout, loggedInAt } = useAuth();
  const { showToast } = useToast();
  const ted = useTed();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  // Vek z data narozeni. Driv tu bylo natvrdo "34 let" bez ohledu na to,
  // kdo je prihlaseny.
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

  const loggedInText = loggedInAt
    ? new Date(loggedInAt).toLocaleString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '—';

  const handleConfirmLogout = () => {
    setIsLogoutDialogOpen(false);
    logout();
    showToast({
      title: 'Odhlášeno',
      description: 'Tvoje data zůstávají uložená na účtu.',
      variant: 'info'
    });
  };


  // Osobni silove rekordy odstraneny: pet vymyslenych hodnot (bench 135 kg,
  // drep 170 kg, mrtvy tah 210 kg…) vcetne "Pred 2 tydny" a "5 zapsanych PR".
  // Overeno v produkci — tabulka pro rekordy v databazi neexistuje ani pod
  // jinym nazvem, ani jako sloupec. Napojit nebylo na co.

  return (
    <div className="space-y-4 sm:space-y-6">
      <NadpisSekce
        titulek="Můj profil & cíle"
        podtitulek="Účet, tělesné údaje, cíle a připojená zařízení"
        ikona={<User className="w-5 h-5 text-[#00f2fe]" />}
      />

      {/* 1. Main Profile Hero Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl p-5 sm:p-7 bg-[#0c1017]/90 backdrop-blur-2xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      >
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          {/* Avatar & identita */}
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden p-1 bg-gradient-to-tr from-[#00f2fe] via-cyan-600 to-[#39ff14] shadow-[0_0_20px_rgba(0,242,254,0.3)]">
                <img
                  src={account?.avatarUrl || profile.avatarUrl}
                  alt={account?.name || profile.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-xl bg-slate-900"
                />
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#39ff14] border-2 border-[#0c1017] shadow-[0_0_10px_#39ff14]" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {account?.name || profile.name}
                </h2>
                <div className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-[#39ff14] bg-emerald-950/60 border border-[#39ff14]/50 shadow-[0_0_12px_rgba(57,255,20,0.25)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-ping" />
                  <span>{profile.status}</span>
                </div>
              </div>

              {account?.email && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 min-w-0">
                  <Mail className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{account.email}</span>
                </p>
              )}

              <p className="text-xs sm:text-sm text-cyan-400 font-semibold mt-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                {profile.membershipPlan}
              </p>

              {/* Vek i vyska jdou z dat. Chybejici hodnota se nezobrazi —
                  driv tu svitilo natvrdo "34 let" a "Faze: Hypertrofie 6/12",
                  ktera nemela zdroj nikde. */}
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

          {/* Akce. Jedno Odhlasit se, ne dve. */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={onEditPreferences}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 transition-all active:scale-95 shadow-sm"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Upravit cíle</span>
            </button>

            <button
              onClick={() => setIsLogoutDialogOpen(true)}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-red-950/60 hover:bg-red-900/70 text-red-300 hover:text-red-200 border border-red-500/45 hover:border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Odhlásit se</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* 2. Key Physical Parameters Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Váha */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0e131d]/90 border border-cyan-500/25 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Aktuální váha</span>
            <Scale className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {hodnotaNeboPomlcka(latestWeightRecord?.weight, 'kg')}
          </div>
        </div>

        {/* Tuk — jen kdyz ho chytra vaha zmerila */}
        {slozeni && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0e131d]/90 border border-cyan-500/25 shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Tělesný tuk</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {hodnotaNeboPomlcka(slozeni.fat_percent, '%')}
            </div>
            {zmenaText(slozeni.zmena.fat_percent, '%') && (
              <div className="text-xs text-slate-400 font-medium mt-1">
                {zmenaText(slozeni.zmena.fat_percent, '%')} od minula
              </div>
            )}
          </div>
        )}

        {/* Svalová hmota */}
        {slozeni && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0e131d]/90 border border-cyan-500/25 shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Svalová hmota</span>
              <Flame className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {hodnotaNeboPomlcka(slozeni.muscle_mass_kg, 'kg')}
            </div>
            {zmenaText(slozeni.zmena.muscle_mass_kg, 'kg') && (
              <div className="text-xs text-slate-400 font-medium mt-1">
                {zmenaText(slozeni.zmena.muscle_mass_kg, 'kg')} od minula
              </div>
            )}
          </div>
        )}

        {/* CÍLOVÁ VÁHA.
            Bez vyplněného cíle tu svítilo „0 kg" — a pod tím „Při <10 %
            tělesného tuku", což je natvrdo psaná podmínka, kterou nikdo
            nezadal ani nespočítal. Nula není cíl, je to prázdné pole.
            Když cíl není, karta nabídne, kde si ho nastavit. */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0e131d]/90 border border-cyan-500/25 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Cílová hmotnost</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          {preferences.targetWeightKg > 0 ? (
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {preferences.targetWeightKg.toString().replace('.', ',')} kg
            </div>
          ) : (
            <>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-500">—</div>
              <button
                onClick={onEditPreferences}
                className="text-xs text-cyan-300 font-semibold mt-1 hover:text-cyan-200 transition-colors"
              >
                Nastavit cíl
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. Connected IoT Devices & Sync Status */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0c1017]/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400">
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Propojená chytrá zařízení &amp; Data</h3>
              <p className="text-xs text-slate-400">Automatický obousměrný přenos biometrie a tělesných metrik</p>
            </div>
          </div>
          <button
            onClick={onSyncAll}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-950/70 hover:bg-cyan-900/70 text-[#00f2fe] border border-cyan-500/40 shadow-sm transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Synchronizuji...' : 'Synchronizovat teď'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Withings Scale */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-[#00f2fe]">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">Withings Body Scan</div>
                <div className="text-[11px] text-slate-400">Poslední vážení dnes 07:15</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/30">
              Připojeno
            </span>
          </div>

          {/* Apple Watch */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-lime-950/50 border border-lime-500/30 flex items-center justify-center text-[#39ff14]">
                <Watch className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">Apple Health</div>
                <div className="text-[11px] text-slate-400">HRV, Spánek &amp; Tep živě</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/30">
              Připojeno
            </span>
          </div>

          {/* AI TRENÉR TED.
              Dřív tu stálo „Verze 2.4 Hypertrophy Pro" — název ani číslo verze
              nikde neexistuje, bylo to vymyšlené. Místo toho karta říká, co
              TED umí, a otevře chat. */}
          <button
            onClick={ted.zeptejSe ? () => ted.zeptejSe() : undefined}
            disabled={!ted.dostupny}
            className="w-full p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-cyan-500/40 flex items-center justify-between transition-all disabled:cursor-default text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-950/50 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">AI trenér TED</div>
                <div className="text-[11px] text-slate-400">Odpovídá podle tvého profilu a měření</div>
              </div>
            </div>
            {ted.dostupny && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30">
                Zeptat se
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 5. Cíle stravování, Maker & Životosprávy */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0c1017]/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Nastavené denní cíle &amp; Makroživiny</h3>
              <p className="text-xs text-slate-400">Personalizovaný plán pro svalovou hypertrofii a regeneraci</p>
            </div>
          </div>
          <button
            onClick={onEditPreferences}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
          >
            <span>Změnit hodnoty</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Kalorie */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Denní kalorie</span>
            <span className="text-xl font-bold text-white">{preferences.dailyCalorieTarget} kcal</span>
            <span className="text-[10px] text-cyan-400 block mt-0.5">Lehký přebytek (+150 kcal)</span>
          </div>

          {/* Bílkoviny */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Bílkoviny ({preferences.proteinRatioPercent} %)</span>
            <span className="text-xl font-bold text-[#00f2fe]">
              {Math.round((preferences.dailyCalorieTarget * (preferences.proteinRatioPercent / 100)) / 4)} g
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">~1,0 g / kg svalů</span>
          </div>

          {/* Pitný režim */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Pitný režim</span>
            <span className="text-xl font-bold text-blue-400 flex items-center gap-1">
              <Droplets className="w-4 h-4" />
              3,5 L
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Voda &amp; elektrolyty</span>
          </div>

          {/* Spánek */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Cíl spánku</span>
            <span className="text-xl font-bold text-indigo-400 flex items-center gap-1">
              <Moon className="w-4 h-4" />
              8h 00m
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Hluboká regenerace</span>
          </div>
        </div>
      </div>

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
    </div>
  );
};
