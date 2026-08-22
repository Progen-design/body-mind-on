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

export const initialProfile: UserProfile = {
  name: 'Jan Novák / Příkopa',
  status: 'AKTIVNÍ',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
  membershipPlan: 'Premium Performance & Hypertrofy Protocol',
  nextConsultationDate: 'Čtvrtek 27. srpna v 16:30',
  subtitle: 'Klient Body & Mind ON'
};

export const initialWeightRecords: Record<string, WeightRecord[]> = {
  '1M': [
    { date: '29.10.', weight: 101.9, fatPercent: 12.5, muscleKg: 87.1, bmi: 30.7, note: 'Ranní vážení nalačno' },
    { date: '05.11.', weight: 102.4, fatPercent: 12.3, muscleKg: 87.5, bmi: 30.9, note: 'Navýšení sacharidových vln' },
    { date: '12.11.', weight: 103.1, fatPercent: 12.0, muscleKg: 88.0, bmi: 31.1, note: 'Progresivní přetížení dřepy' },
    { date: '19.11.', weight: 103.0, fatPercent: 11.9, muscleKg: 88.1, bmi: 31.1, note: 'Regenerační den' },
    { date: '26.11.', weight: 103.5, fatPercent: 11.8, muscleKg: 88.4, bmi: 31.3, note: 'Kontrola kompozice' },
    { date: '02.12.', weight: 103.9, fatPercent: 11.7, muscleKg: 88.6, bmi: 31.4, note: 'Hypertrofický cyklus týden 3' },
    { date: '20.08.', weight: 104.6, fatPercent: 11.6, muscleKg: 88.9, bmi: 31.6, note: 'Aktuální Withings Body Scan měření' }
  ],
  '3M': [
    { date: '20.05.', weight: 100.2, fatPercent: 13.2, muscleKg: 85.5, bmi: 30.3 },
    { date: '05.06.', weight: 101.0, fatPercent: 12.9, muscleKg: 86.2, bmi: 30.5 },
    { date: '20.06.', weight: 101.8, fatPercent: 12.6, muscleKg: 86.9, bmi: 30.8 },
    { date: '05.07.', weight: 102.7, fatPercent: 12.2, muscleKg: 87.6, bmi: 31.0 },
    { date: '20.07.', weight: 103.6, fatPercent: 11.9, muscleKg: 88.3, bmi: 31.3 },
    { date: '20.08.', weight: 104.6, fatPercent: 11.6, muscleKg: 88.9, bmi: 31.6 }
  ],
  '6M': [
    { date: '20.02.', weight: 98.2, fatPercent: 14.3, muscleKg: 83.0, bmi: 29.7 },
    { date: '20.03.', weight: 99.5, fatPercent: 13.8, muscleKg: 84.3, bmi: 30.1 },
    { date: '20.04.', weight: 100.8, fatPercent: 13.3, muscleKg: 85.8, bmi: 30.5 },
    { date: '20.05.', weight: 101.9, fatPercent: 12.7, muscleKg: 87.1, bmi: 30.8 },
    { date: '20.06.', weight: 103.2, fatPercent: 12.1, muscleKg: 88.2, bmi: 31.2 },
    { date: '20.08.', weight: 104.6, fatPercent: 11.6, muscleKg: 88.9, bmi: 31.6 }
  ],
  '1R': [
    { date: '08.2025', weight: 95.0, fatPercent: 15.8, muscleKg: 79.2, bmi: 28.7 },
    { date: '11.2025', weight: 97.4, fatPercent: 14.7, muscleKg: 81.9, bmi: 29.5 },
    { date: '02.2026', weight: 99.2, fatPercent: 13.9, muscleKg: 84.2, bmi: 30.0 },
    { date: '05.2026', weight: 101.8, fatPercent: 12.5, muscleKg: 87.0, bmi: 30.8 },
    { date: '08.2026', weight: 104.6, fatPercent: 11.6, muscleKg: 88.9, bmi: 31.6 }
  ]
};


export const appleWatchBiometricsData: AppleWatchBiometrics = {
  scaleConnected: true,
  appleWatchConnected: true,
  lastSyncTime: 'Dnes v 11:42 přes Apple HealthKit',
  recoveryScore: 70,
  recoveryStatus: 'Ubrat intenzitu',
  recoveryAdvice: 'Dnešní hodnota HRV (20,6 ms) a mírně zvýšený klidový tep indikují centrální únavu nervové soustavy po včerejším tréninku nohou. Doporučujeme nepřidávat drop-sety do selhání a prodloužit pauzy mezi sériemi na 90–120 sekund.',
  hrvMs: 20.6,
  hrvBaselineMs: 42.0,
  restingHrBpm: 68.0,
  sleepDuration: '7h 48m',
  deepSleepDuration: '2h 15m',
  sleepEfficiencyPercent: 89,
  stepsToday: 9546,
  stepsTarget: 10000,
  activeEnergyKcal: 1678,
  activeEnergyTargetKcal: 1500,
  exerciseMinutes: 96.0,
  exerciseMinutesTarget: 60.0,
  bloodOxygenPercent: 94.0,
  recentWorkouts: [
    {
      id: 'wo-1',
      type: 'Silový trénink (Ramena & Triceps)',
      icon: 'dumbbell',
      time: '08:15 – 09:10',
      durationMin: 55,
      caloriesBurned: 440,
      avgHr: 142,
      maxHr: 174
    },
    {
      id: 'wo-2',
      type: 'Plavání v bazénu (Regenerační)',
      icon: 'waves',
      time: '14:30 – 15:12',
      durationMin: 42,
      caloriesBurned: 380,
      avgHr: 128,
      maxHr: 151
    }
  ],
  hrvTrend: [
    { day: '14.8.', value: 44.2 },
    { day: '15.8.', value: 41.5 },
    { day: '16.8.', value: 38.0 },
    { day: '17.8.', value: 45.1 },
    { day: '18.8.', value: 36.4 },
    { day: '19.8.', value: 29.8 },
    { day: '20.8.', value: 20.6 }
  ],
  restingHrTrend: [
    { day: '14.8.', value: 58.0 },
    { day: '15.8.', value: 59.5 },
    { day: '16.8.', value: 61.0 },
    { day: '17.8.', value: 57.5 },
    { day: '18.8.', value: 63.0 },
    { day: '19.8.', value: 66.5 },
    { day: '20.8.', value: 68.0 }
  ],
  stepsTrend: [
    { day: '14.8.', value: 11200 },
    { day: '15.8.', value: 12400 },
    { day: '16.8.', value: 8900 },
    { day: '17.8.', value: 14100 },
    { day: '18.8.', value: 10200 },
    { day: '19.8.', value: 13500 },
    { day: '20.8.', value: 9546 }
  ],
  energyTrend: [
    { day: '14.8.', value: 1420 },
    { day: '15.8.', value: 1580 },
    { day: '16.8.', value: 1310 },
    { day: '17.8.', value: 1820 },
    { day: '18.8.', value: 1490 },
    { day: '19.8.', value: 1750 },
    { day: '20.8.', value: 1678 }
  ]
};







export const initialPreferences: UserPreferences = {
  dailyCalorieTarget: 2164,
  proteinRatioPercent: 19,
  carbsRatioPercent: 54,
  fatRatioPercent: 27,
  targetWeightKg: 102.0,
  currentHeightCm: 188,
  weeklyWorkoutsTarget: 5,
  withingsAutoSync: true,
  appleHealthAutoSync: true,
  tedAiProactiveTips: true
};
