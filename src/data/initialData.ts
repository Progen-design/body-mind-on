import type {
  UserProfile,
  WeightRecord,
  MealItem,
  WorkoutDay,
  HabitItem,
  BadHabitItem,
  AppleWatchBiometrics,
  ShoppingItem,
  UserPreferences
} from '../types';

/**
 * Prazdny profil, nez dorazi server. Zadna jmena, zadny plan — driv tu byl
 * "Jan Novak / Prikopa" a "Premium Performance & Hypertrofy Protocol",
 * ktere na okamzik videl kazdy uzivatel.
 */
export const PRAZDNY_PROFIL: UserProfile = {
  name: '',
  status: 'PAUZOVÁNO',
  avatarUrl: '',
  membershipPlan: '',
  nextConsultationDate: ''
};



/**
 * Vychozi biometrie, nez dorazi /api/health.
 *
 * Same nuly a prazdne retezce SCHVALNE: UI je vsude schovava (hodnota 0
 * znamena "nemerime"). Driv tu byla kompletni vymyslena sada — HRV 20,6 ms,
 * spanek 7h 48m, 9 546 kroku a rada "Dnesni hodnota HRV indikuje centralni
 * unavu nervove soustavy" — kterou videl kazdy uzivatel, nez se data nacetla.
 */
export const PRAZDNA_BIOMETRIE: AppleWatchBiometrics = {
  scaleConnected: false,
  appleWatchConnected: false,
  lastSyncTime: '',
  recoveryScore: 0,
  recoveryStatus: 'Optimální',
  recoveryAdvice: '',
  hrvMs: 0,
  hrvBaselineMs: 0,
  restingHrBpm: 0,
  sleepDuration: '',
  stepsToday: 0,
  stepsTarget: 0,
  activeEnergyKcal: 0,
  activeEnergyTargetKcal: 0,
  exerciseMinutes: 0,
  exerciseMinutesTarget: 0,
  recentWorkouts: [],
  hrvTrend: [],
  restingHrTrend: [],
  stepsTrend: [],
  energyTrend: []
};







export const initialPreferences: UserPreferences = {
  dailyCalorieTarget: 2164,
  proteinRatioPercent: 19,
  carbsRatioPercent: 54,
  fatRatioPercent: 27,
  proteinTargetG: null,
  carbsTargetG: null,
  fatTargetG: null,
  targetWeightKg: 102.0,
  currentHeightCm: 188,
  weeklyWorkoutsTarget: 5,
  withingsAutoSync: true,
  appleHealthAutoSync: true,
  tedAiProactiveTips: true
};
