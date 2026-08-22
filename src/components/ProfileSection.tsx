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
import { UserProfile, UserPreferences, WeightRecord, AppleWatchBiometrics } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from './ConfirmDialog';

interface ProfileSectionProps {
  profile: UserProfile;
  preferences: UserPreferences;
  latestWeightRecord: WeightRecord;
  biometrics: AppleWatchBiometrics;
  onEditPreferences: () => void;
  onOpenCoachChat: () => void;
  onSyncAll: () => void;
  onAddWeight: () => void;
  isSyncing?: boolean;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  profile,
  preferences,
  latestWeightRecord,
  biometrics,
  onEditPreferences,
  onOpenCoachChat,
  onSyncAll,
  onAddWeight,
  isSyncing = false
}) => {
  const { account, logout, loggedInAt } = useAuth();
  const { showToast } = useToast();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

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
      description: 'Tvoje data zůstala uložená na tomto zařízení.',
      variant: 'info'
    });
  };


  const personalRecords = [
    { exercise: 'Benchpress', weight: '135 kg', reps: '4 opakování', date: 'Před 2 týdny', icon: Dumbbell, color: 'text-cyan-400' },
    { exercise: 'Dřep s činkou', weight: '170 kg', reps: '5 opakování', date: 'Před měsícem', icon: Dumbbell, color: 'text-[#39ff14]' },
    { exercise: 'Mrtvý tah', weight: '210 kg', reps: '3 opakování', date: 'Před 3 týdny', icon: Dumbbell, color: 'text-orange-400' },
    { exercise: 'Tlak na ramena s JČ', weight: '42 kg', reps: '6 opakování', date: 'Tento týden', icon: Dumbbell, color: 'text-purple-400' },
    { exercise: 'Shyby s přidanou vahou', weight: '+30 kg', reps: '5 opakování', date: 'Před 2 týdny', icon: Dumbbell, color: 'text-emerald-400' }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
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
          {/* Avatar & Ident */}
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="relative">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden p-1 bg-gradient-to-tr from-[#00f2fe] via-cyan-600 to-[#39ff14] shadow-[0_0_20px_rgba(0,242,254,0.3)]">
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-xl bg-slate-900"
                />
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#39ff14] border-2 border-[#0c1017] shadow-[0_0_10px_#39ff14]" />
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {profile.name}
                </h2>
                <div className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-[#39ff14] bg-emerald-950/60 border border-[#39ff14]/50 shadow-[0_0_12px_rgba(57,255,20,0.25)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-ping" />
                  <span>{profile.status}</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-cyan-400 font-semibold mt-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                {profile.membershipPlan}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                <span>Věk: <strong className="text-slate-200">34 let</strong></span>
                <span>•</span>
                <span>Výška: <strong className="text-slate-200">{preferences.currentHeightCm} cm</strong></span>
                <span>•</span>
                <span>Fáze: <strong className="text-emerald-300">Hypertrofie 6/12</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Profile Actions */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={onEditPreferences}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 transition-all active:scale-95 shadow-sm"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Upravit cíle</span>
            </button>

            <button
              onClick={onOpenCoachChat}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-cyan-950/70 hover:bg-cyan-900/70 text-[#00f2fe] border border-cyan-500/50 hover:border-cyan-400 shadow-[0_0_15px_rgba(0,242,254,0.25)] transition-all active:scale-95"
            >
              <Brain className="w-3.5 h-3.5 text-[#00f2fe]" />
              <span>AI Konzultace</span>
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

      {/* 1b. Přihlášený účet & přepnutí profilu */}
      {account && (
        <div className="p-5 sm:p-6 rounded-3xl bg-[#0c1017]/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Přihlášený účet</h3>
                <p className="text-xs text-slate-400">
                  Přihlášen {loggedInText} • data se ukládají do tohoto zařízení
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsLogoutDialogOpen(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-red-300 bg-red-950/50 hover:bg-red-900/60 border border-red-500/40 hover:border-red-400 transition-all active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Odhlásit se</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/25 flex items-center gap-3.5">
            <img
              src={account.avatarUrl}
              alt={account.name}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover bg-slate-800 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-100 truncate">{account.name}</div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                <Mail className="w-3 h-3 shrink-0 text-slate-500" />
                <span className="truncate">{account.email}</span>
              </div>
              <div className="text-[10px] text-cyan-400 font-semibold mt-0.5">{account.role}</div>
            </div>
            <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/30 shrink-0">
              Aktivní relace
            </span>
          </div>

        </div>
      )}

      {/* 2. Key Physical Parameters Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Váha */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0e131d]/90 border border-cyan-500/25 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Aktuální váha</span>
            <Scale className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {latestWeightRecord.weight.toString().replace('.', ',')} kg
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#39ff14] font-semibold mt-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+2,7 kg (Svalový přírůstek)</span>
          </div>
        </div>

        {/* Tuk */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0e131d]/90 border border-cyan-500/25 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Tělesný tuk</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {latestWeightRecord.fatPercent.toString().replace('.', ',')} %
          </div>
          <div className="text-xs text-[#39ff14] font-semibold mt-1">
            -0,3 % od posledního měření
          </div>
        </div>

        {/* Svalová hmota */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0e131d]/90 border border-cyan-500/25 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Svalová hmota</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {latestWeightRecord.muscleKg.toString().replace('.', ',')} kg
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">
            85 % z celkové hmotnosti
          </div>
        </div>

        {/* Cílová váha */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0e131d]/90 border border-cyan-500/25 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Cílová hmotnost</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {preferences.targetWeightKg.toString().replace('.', ',')} kg
          </div>
          <div className="text-xs text-cyan-300 font-semibold mt-1">
            Při &lt;10 % tělesného tuku
          </div>
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
                <div className="text-xs font-bold text-slate-200">Apple Watch Series 9</div>
                <div className="text-[11px] text-slate-400">HRV, Spánek &amp; Tep živě</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/30">
              Připojeno
            </span>
          </div>

          {/* AI Coach Engine */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-950/50 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200">AI Trenér TED Engine</div>
                <div className="text-[11px] text-slate-400">Verze 2.4 Hypertrophy Pro</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30">
              Aktivní
            </span>
          </div>
        </div>
      </div>

      {/* 4. Osobní rekordy (PRs) */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#0c1017]/90 border border-cyan-500/25 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Osobní silové rekordy (PR)</h3>
              <p className="text-xs text-slate-400">Sledování maximálních výkonů v základních cvicích</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-400">5 zapsaných PR</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {personalRecords.map((pr, idx) => {
            const Icon = pr.icon;
            return (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-cyan-500/30 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                    <Icon className={`w-4 h-4 ${pr.color}`} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100">{pr.exercise}</div>
                    <div className="text-[11px] text-slate-400">{pr.reps} • {pr.date}</div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold text-white block">{pr.weight}</span>
                  <span className="text-[10px] text-[#39ff14] font-semibold">Max PR</span>
                </div>
              </div>
            );
          })}
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
        description="Aplikace se zamkne a budeš se muset znovu přihlásit. Naměřená data, jídelníček i návyky zůstanou uložené na tomto zařízení."
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
