import React, { useState } from 'react';
import { X, Sliders, Save, Check, Scale, Watch, Sparkles, Flame, Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { UserPreferences } from '../types';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onSavePreferences: (updated: UserPreferences) => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  preferences,
  onSavePreferences
}) => {
  const [calories, setCalories] = useState(preferences.dailyCalorieTarget);
  const [protein, setProtein] = useState(preferences.proteinRatioPercent);
  const [carbs, setCarbs] = useState(preferences.carbsRatioPercent);
  const [fat, setFat] = useState(preferences.fatRatioPercent);
  const [targetWeight, setTargetWeight] = useState(preferences.targetWeightKg);
  const [withingsAuto, setWithingsAuto] = useState(preferences.withingsAutoSync);
  const [healthAuto, setHealthAuto] = useState(preferences.appleHealthAutoSync);
  const [tedTips, setTedTips] = useState(preferences.tedAiProactiveTips);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSavePreferences({
      dailyCalorieTarget: Number(calories),
      proteinRatioPercent: Number(protein),
      carbsRatioPercent: Number(carbs),
      fatRatioPercent: Number(fat),
      targetWeightKg: Number(targetWeight),
      currentHeightCm: preferences.currentHeightCm,
      weeklyWorkoutsTarget: preferences.weeklyWorkoutsTarget,
      withingsAutoSync: withingsAuto,
      appleHealthAutoSync: healthAuto,
      tedAiProactiveTips: tedTips
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-xl max-h-[90vh] bg-[#0c1017] rounded-3xl border border-cyan-500/40 shadow-[0_0_50px_rgba(0,242,254,0.2)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-[#0e1624] to-[#0c1017]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Uživatelské preference &amp; Cíle
              </h3>
              <p className="text-xs text-slate-400">
                Nastavení nutričních cílů a biometrických integrací
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSave} className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Calorie Target */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Denní kalorický cíl</span>
              </label>
              <span className="text-base font-extrabold text-amber-400">{calories} kcal</span>
            </div>
            <input
              type="range"
              min="1600"
              max="3500"
              step="50"
              value={calories}
              onChange={e => setCalories(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#00f2fe]"
            />
          </div>

          {/* Macro Split Ratios */}
          <div className="space-y-3 p-4 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Poměr makroživin (% energie)
              </span>
              <span className="text-xs text-slate-400">Celkem: {protein + carbs + fat}%</span>
            </div>

            {/* Protein */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold text-[#00f2fe]">
                <span>Bílkoviny (Protein)</span>
                <span>{protein}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="40"
                value={protein}
                onChange={e => setProtein(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#00f2fe]"
              />
            </div>

            {/* Carbs */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold text-[#2dd4bf]">
                <span>Sacharidy (Carbs)</span>
                <span>{carbs}%</span>
              </div>
              <input
                type="range"
                min="30"
                max="70"
                value={carbs}
                onChange={e => setCarbs(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#2dd4bf]"
              />
            </div>

            {/* Fat */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold text-[#39ff14]">
                <span>Tuky (Fats)</span>
                <span>{fat}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="40"
                value={fat}
                onChange={e => setFat(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#39ff14]"
              />
            </div>
          </div>

          {/* Goal Weight */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-cyan-400" />
                <span>Cílová tělesná váha</span>
              </label>
              <span className="text-base font-extrabold text-white">{targetWeight} kg</span>
            </div>
            <input
              type="range"
              min="85"
              max="120"
              step="0.5"
              value={targetWeight}
              onChange={e => setTargetWeight(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#39ff14]"
            />
          </div>

          {/* Integration Toggles */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Synchronizace &amp; Asistence
            </span>

            {/* Withings */}
            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Scale className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold text-slate-200">Withings Body Scan Auto-Sync</span>
              </div>
              <input
                type="checkbox"
                checked={withingsAuto}
                onChange={e => setWithingsAuto(e.target.checked)}
                className="w-4 h-4 accent-[#00f2fe] rounded"
              />
            </label>

            {/* Apple Watch */}
            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Watch className="w-4 h-4 text-[#39ff14]" />
                <span className="text-xs font-semibold text-slate-200">Apple HealthKit Real-Time Sync</span>
              </div>
              <input
                type="checkbox"
                checked={healthAuto}
                onChange={e => setHealthAuto(e.target.checked)}
                className="w-4 h-4 accent-[#39ff14] rounded"
              />
            </label>

            {/* Proactive AI */}
            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-slate-200">Proaktivní AI kouč TED (Notifikace)</span>
              </div>
              <input
                type="checkbox"
                checked={tedTips}
                onChange={e => setTedTips(e.target.checked)}
                className="w-4 h-4 accent-amber-400 rounded"
              />
            </label>
          </div>

          {/* Modal Footer inside form */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Zrušit
            </button>

            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-[0_0_15px_rgba(57,255,20,0.3)] active:scale-95"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
              <span>{savedSuccess ? 'Uloženo!' : 'Uložit změny'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
