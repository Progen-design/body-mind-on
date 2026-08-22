import React from 'react';
import { UserProfile, WeightRecord, AppleWatchBiometrics } from '../types';
import { ShieldCheck, User, Scale, Activity, ChevronRight, Edit3 } from 'lucide-react';
import { motion } from 'motion/react';
import { hodnotaNeboPomlcka } from '../data/adaptery';

interface UserProfileCardProps {
  profile: UserProfile;
  latestWeightRecord?: WeightRecord;
  biometrics?: AppleWatchBiometrics;
  onEditProfile?: () => void;
  onViewFullProfile?: () => void;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({
  profile,
  latestWeightRecord,
  biometrics,
  onEditProfile,
  onViewFullProfile
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl p-4 sm:p-5 bg-[#0e131d]/90 backdrop-blur-xl border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] group hover:border-cyan-500/40 transition-all duration-300"
    >
      {/* Ambient subtle light gradient */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-lime-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* User avatar and name */}
        <div className="flex items-center gap-3.5 sm:gap-4 cursor-pointer" onClick={onViewFullProfile}>
          <div className="relative">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden p-0.5 bg-gradient-to-tr from-[#00f2fe] to-[#39ff14] shadow-[0_0_15px_rgba(0,242,254,0.3)]">
              <img
                src={profile.avatarUrl}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover rounded-xl bg-slate-900"
              />
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#39ff14] border-2 border-[#0e131d] shadow-[0_0_8px_#39ff14]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                {profile.name}
              </h2>
              <ShieldCheck className="w-4 h-4 text-cyan-400 hidden xs:inline" />
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
              <span>{profile.membershipPlan}</span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-400 font-semibold">Hypertrofie</span>
            </p>
          </div>
        </div>

        {/* Status Pill Badge & Quick Profile Link */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          {latestWeightRecord && (
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <div className="flex items-center gap-1 text-slate-300">
                <Scale className="w-3.5 h-3.5 text-cyan-400" />
                <strong className="text-white">{hodnotaNeboPomlcka(latestWeightRecord?.weight, 'kg')}</strong>
              </div>
              {/* Skóre regenerace ukazujeme jen když ho opravdu máme.
                  Bez dat z hodinek je nula, a "0/100" vypadá jako naměřená
                  hodnota, ne jako chybějící údaj. */}
              {biometrics && biometrics.recoveryScore > 0 && (
                <div className="flex items-center gap-1 text-slate-300 border-l border-slate-800 pl-3">
                  <Activity className="w-3.5 h-3.5 text-[#39ff14]" />
                  <strong className="text-[#39ff14]">{biometrics.recoveryScore}/100</strong>
                </div>
              )}
            </div>
          )}

          <div className="px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase text-[#39ff14] bg-emerald-950/40 border border-[#39ff14]/50 shadow-[0_0_15px_rgba(57,255,20,0.25)] flex items-center gap-1.5 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-ping" />
            <span>{profile.status}</span>
          </div>

          {onViewFullProfile && (
            <button
              onClick={onViewFullProfile}
              className="p-1.5 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-slate-900 border border-slate-800/80 transition-all text-xs flex items-center gap-1"
              title="Zobrazit celý profil"
            >
              <User className="w-4 h-4 text-cyan-400" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
