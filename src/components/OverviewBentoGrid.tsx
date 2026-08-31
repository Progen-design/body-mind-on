import React from 'react';
import {
  Scale,
  TrendingUp,
  Activity,
  Heart,
  Moon,
  Utensils,
  Dumbbell,
  Clock,
  Flame,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Brain,
  ShoppingBag,
  Plus,
  Play,
  Check,
  Zap
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  WeightRecord,
  AppleWatchBiometrics,
  MealItem,
  WorkoutDay,
  HabitItem,
  BadHabitItem,
  CoachTip,
  UserPreferences,
  TelesneSlozeni
} from '../types';
import { ActiveTab } from './NavigationTabs';
import { hodnotaNeboPomlcka, kdyMereno, zmenaText } from '../data/adaptery';
import { denniMakra } from '../lib/makra';
import { jeNaplanovany } from '../lib/trenink';
import { Vysvetlivka } from './Vysvetlivka';

interface OverviewBentoGridProps {
  latestWeightRecord: WeightRecord | null;
  biometrics: AppleWatchBiometrics;
  meals: MealItem[];
  todayWorkout: WorkoutDay;
  habits: HabitItem[];
  badHabits: BadHabitItem[];
  coachTips: CoachTip[];
  preferences: UserPreferences;
  /** Pocet polozek nakupniho seznamu. */
  pocetNakupu?: number;
  /** Z chytre vahy. null = blok slozeni se nezobrazi. */
  slozeni?: TelesneSlozeni | null;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenWorkoutLogger: () => void;
  /** Otevře chat s TEDem. Karta trenéra ho nabídne, když nemá co ukázat. */
  onAskTed: () => void;
  onOpenAddWeightModal: () => void;
  onToggleMeal: (id: string) => void;
  onToggleHabit: (id: string) => void;
  onCompleteAllHabits: () => void;
  onSelectRecipe: (meal: MealItem) => void;
}

export const OverviewBentoGrid: React.FC<OverviewBentoGridProps> = ({
  latestWeightRecord,
  biometrics,
  meals,
  todayWorkout,
  habits,
  badHabits,
  coachTips,
  preferences,
  pocetNakupu = 0,
  slozeni = null,
  onSelectTab,
  onOpenWorkoutLogger,
  onAskTed,
  onOpenAddWeightModal,
  onToggleMeal,
  onToggleHabit,
  onCompleteAllHabits,
  onSelectRecipe
}) => {
  const currentCalories = meals.reduce((acc, m) => acc + (m.completed ? m.calories : 0), 0);
  const targetCalories = preferences.dailyCalorieTarget;
  const makra = denniMakra(preferences);
  const completedExercises = todayWorkout?.exercises.filter(e => e.completed).length || 0;
  const totalExercises = todayWorkout?.exercises.length || 0;
  // V den volna nabízí "Spustit záznamník" trénink, který v plánu není —
  // tlačítko proto přejmenuje na zápis mimo plán (docs/DALSI_KROK.md 6.11).
  const maDnesTrenink = jeNaplanovany(todayWorkout);
  const completedHabitsCount = habits.filter(h => h.completed).length;
  const topCoachTip = coachTips[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 auto-rows-auto">
      {/* 
        ========================================================================
      {/* KARTA "TELESNE SLOZENI & WITHINGS" TU BYLA DO 23. 8. 2026.
          Ukazovala vahu, telesny tuk, svalovou hmotu, BMI a datum mereni.
          Po slouceni zalozek Prehled a Muj profil sedi presne tyhle hodnoty
          o kus vys v ProfileSection -- kreslily by se podruhe pod sebou.
          BMI, datum mereni a odkaz na graf, ktere v ProfileSection chybely,
          se tam presunuly. */}

      {/* 
        ========================================================================
        HERO METRIKA 2: Skóre Regenerace & Apple Watch (lg:col-span-1)
        Zvýrazněný vitální panel se živým biometrickým streamem
        ========================================================================
      */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="col-span-1 md:col-span-2 lg:col-span-1 relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0c1017]/95 backdrop-blur-xl border border-cyan-500/35 shadow-[0_10px_35px_rgba(0,0,0,0.55)] flex flex-col justify-between group hover:border-lime-400/60 transition-all duration-300"
      >
        <div className="absolute top-0 right-0 w-44 h-44 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />

        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-lime-950/70 border border-lime-500/40 flex items-center justify-center text-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.25)]">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Regenerace &amp; Watch
                </h3>
                {/* „Živý biometrický stream" nic neznamenalo — data chodí
                    dávkově při synchronizaci, ne živě. */}
                <span className="text-[10px] text-slate-400 font-semibold">Z Apple Health a chytré váhy</span>
              </div>
            </div>
            {/* Odznak byl natvrdo „Ubrat intenzitu" pro každého a bez ohledu
                na skóre. Stav ukazujeme jen tehdy, když ho server spočítal. */}
            {biometrics.recoveryScore > 0 && biometrics.recoveryStatus && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40">
                {biometrics.recoveryStatus}
              </span>
            )}
          </div>

          {/* Main Score 70/100 */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/70 border border-slate-800 mb-4">
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                Denní připravenost
              </div>
              {/* Bez skore se nekresli ani "/ 100" — "0 / 100" tvrdi nulovou
                  pripravenost, coz je neco jineho nez "nemame dost dat". */}
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  {biometrics.recoveryScore > 0 ? biometrics.recoveryScore : '—'}
                </span>
                {biometrics.recoveryScore > 0 && (
                  <span className="text-base font-bold text-slate-500">/ 100</span>
                )}
              </div>
              {biometrics.recoveryScore <= 0 && (
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Zatím málo dat na výpočet.
                </div>
              )}
              {/* Stav ze serveru. Driv tu bylo natvrdo "Parasympaticka unava"
                  a vedle odznak "70 % READY" — tri tvrzeni o temz skore,
                  z toho dve vymyslena. */}
              {biometrics.recoveryStatus && biometrics.recoveryScore > 0 && (
                <div className="text-xs text-amber-300 font-semibold mt-0.5">
                  {biometrics.recoveryStatus}
                </div>
              )}
            </div>
          </div>

          {/* Sub Biometrics: HRV, Klidový tep, Spánek */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-900/80 border border-slate-800 mb-4">
            <div>
              <div className="text-[10px] text-slate-400 font-medium inline-flex items-center gap-1">
                HRV
                <Vysvetlivka pojem="hrv" />
              </div>
              <div className="text-sm sm:text-base font-bold text-amber-400 mt-0.5">
                {hodnotaNeboPomlcka(biometrics.hrvMs > 0 ? biometrics.hrvMs : null, 'ms')}
              </div>
              {/* Baseline ze stejneho zdroje jako hodnota. Driv tu bylo
                  natvrdo "B: 28 ms", na zalozce Regenerace "42,0 ms". */}
              {biometrics.hrvBaselineMs > 0 && (
                <div className="text-[10px] text-slate-500">
                  Základna {hodnotaNeboPomlcka(biometrics.hrvBaselineMs, 'ms')}
                </div>
              )}
            </div>
            <div className="border-l border-slate-800 pl-2">
              <div className="text-[10px] text-slate-400 font-medium inline-flex items-center gap-1">
                Klid. tep
                <Vysvetlivka pojem="klidovy_tep" />
              </div>
              <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                {hodnotaNeboPomlcka(biometrics.restingHrBpm > 0 ? biometrics.restingHrBpm : null, 'bpm', 0)}
              </div>
            </div>
            <div className="border-l border-slate-800 pl-2">
              <div className="text-[10px] text-slate-400 font-medium">Spánek</div>
              <div className="text-sm sm:text-base font-bold text-[#00f2fe] mt-0.5">
                {biometrics.sleepDuration || '—'}
              </div>
              {/* ŽÁDNÁ EFEKTIVITA SPÁNKU. Dřív tu bylo natvrdo „92 %", pak
                  podmínka `> 0` — jenže adaptér tam vždycky psal nulu, takže
                  to byla mrtvá větev. Zdroj posílá `inBedEnd` 16:20, z čehož
                  se efektivita ani spočítat nedá. Pole je pryč z typu i UI. */}
            </div>
          </div>
        </div>

        {/* Action to switch to Regenerace deep tab */}
        <div className="pt-1">
          <button
            onClick={() => onSelectTab('regenerace')}
            className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/40 hover:border-emerald-400 flex items-center justify-center gap-1.5 transition-all"
          >
            <span>Zobrazit Apple Watch analýzu</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* 
        ========================================================================
        KARTA 3: Jídelníček & Makra dnes (col-span-1 md:col-span-1 lg:col-span-2)
        Široká karta s přehledem denních kalorií, makro-baru, receptů
        a nákupního seznamu (viz docs/DALSI_KROK.md 6.8)
        ========================================================================
      */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="col-span-1 md:col-span-1 lg:col-span-2 relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0c1017]/95 backdrop-blur-xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between group hover:border-cyan-400/60 transition-all duration-300"
      >
        <div className="absolute -bottom-8 -right-8 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
                <Utensils className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Jídelníček &amp; Makra dnes
                </h3>
                <span className="text-[10px] text-slate-400">Kalorická bilance a suroviny</span>
              </div>
            </div>
            <button
              onClick={() => onSelectTab('jidelnicek')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <span>Všechna jídla</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Calories & Progress */}
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <span className="text-2xl sm:text-3xl font-extrabold text-white">
                {currentCalories.toLocaleString('cs-CZ')}
              </span>
              <span className="text-xs text-slate-400 font-medium ml-1.5">
                / cíl {targetCalories.toLocaleString('cs-CZ')} kcal
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/30">
              {Math.round((currentCalories / targetCalories) * 100)} % splněno
            </span>
          </div>

          {/* Segmented Macro Bar */}
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center gap-1.5 h-2.5 w-full rounded-full overflow-hidden p-0.5 bg-slate-900 border border-slate-800">
              <div style={{ width: `${preferences.proteinRatioPercent}%` }} className="h-full rounded-full bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]" />
              <div style={{ width: `${preferences.carbsRatioPercent}%` }} className="h-full rounded-full bg-[#2dd4bf] shadow-[0_0_8px_#2dd4bf]" />
              <div style={{ width: `${preferences.fatRatioPercent}%` }} className="h-full rounded-full bg-[#39ff14] shadow-[0_0_8px_#39ff14]" />
            </div>
            {/* GRAMY SE POČÍTAJÍ, NEPÍŠOU SE.
                Do 23. 8. 2026 tu stálo `B {procenta} % (103 g)` — procento
                z profilu, gramy natvrdo z makety. Přehled tvrdil 103 g
                bílkovin, Profil na vedlejší záložce 184 g. Sto tři gramů
                odpovídalo poměru 19 %, což je výchozí hodnota makety, ne
                uživatelův profil. Obě místa teď berou číslo z `denniMakra`. */}
            <div className="flex items-center justify-between text-xs font-semibold px-0.5">
              <span className="text-[#00f2fe]">B {makra.bilkoviny.procenta} % ({makra.bilkoviny.gramy} g)</span>
              <span className="text-[#2dd4bf]">S {makra.sacharidy.procenta} % ({makra.sacharidy.gramy} g)</span>
              <span className="text-[#39ff14]">T {makra.tuky.procenta} % ({makra.tuky.gramy} g)</span>
            </div>
          </div>

          {/* Today's Meals Quick List with recipe buttons */}
          <div className="space-y-2 mb-4">
            {meals.slice(0, 3).map(meal => (
              <div
                key={meal.id}
                className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => onToggleMeal(meal.id)}
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                      meal.completed
                        ? 'bg-[#39ff14] border-[#39ff14] text-slate-950 font-bold'
                        : 'border-slate-700 bg-slate-800'
                    }`}
                  >
                    {meal.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                  <div>
                    <span className={`text-xs font-bold block ${meal.completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                      {meal.title}
                    </span>
                    <span className="text-[10px] text-slate-400">{meal.type} • {meal.calories} kcal</span>
                  </div>
                </div>
                <button
                  onClick={() => onSelectRecipe(meal)}
                  className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30"
                >
                  Recept
                </button>
              </div>
            ))}
          </div>

          {/* Nákupní seznam patří k jídelníčku, ne k TEDovi — přesunuto sem
              z Karty 6 (AI Trenér TED). Ta karta se hlavičkou hlásila jako
              „AI Trenér TED", ale zobrazovala pod ní i nesouvisející nákup;
              Karta 6 je navíc jediné místo, kde je TED vidět, a nákup ho tam
              ředil. Viz docs/DALSI_KROK.md 6.8. */}
          <div
            onClick={() => onSelectTab('jidelnicek')}
            className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 flex items-center justify-between cursor-pointer transition-all"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-200">Nákupní seznam</span>
            </div>
            {/* Skutecny pocet, ne natvrdo 12 — seznam jich ma pres sto. */}
            {pocetNakupu > 0 && (
              <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-full">
                {pocetNakupu} {pocetNakupu === 1 ? 'položka' : pocetNakupu < 5 ? 'položky' : 'položek'}
              </span>
            )}
          </div>
        </div>

        <div className="pt-1">
          <button
            onClick={() => onSelectTab('jidelnicek')}
            className="w-full py-2 px-3 rounded-xl text-xs font-bold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/40 flex items-center justify-center gap-1.5 transition-all"
          >
            <span>Zobrazit kompletní týdenní jídelníček &amp; Recepty</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </motion.div>

      {/* 
        ========================================================================
        KARTA 4: Dnešní trénink: Ramena & Triceps (col-span-1 md:col-span-1 lg:col-span-1)
        Akční panel s tréninkovým plánem a spuštěním stopek
        ========================================================================
      */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className="col-span-1 md:col-span-1 lg:col-span-1 relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0c1017]/95 backdrop-blur-xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between group hover:border-cyan-400/60 transition-all duration-300"
      >
        <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-lime-500/10 rounded-full blur-2xl pointer-events-none" />

        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-lime-950/60 border border-lime-500/40 flex items-center justify-center text-[#39ff14]">
                <Dumbbell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Dnešní trénink
                </h3>
                {/* Zamereni chodi z planu. Natvrdo tu bylo "Hypertroficky split"
                    i ve dnech, kdy se trenoval uplne jiny okruh. */}
                {todayWorkout.focus && (
                  <span className="text-[10px] text-emerald-400 font-semibold">{todayWorkout.focus}</span>
                )}
              </div>
            </div>
            {/* Den z planu, ne natvrdo "Ctvrtek" sedm dni v tydnu. */}
            {todayWorkout.dayName && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[#39ff14] bg-emerald-950/60 border border-emerald-500/30">
                {todayWorkout.dayName}
              </span>
            )}
          </div>

          {/* Title & Focus */}
          <div className="mb-3">
            <h4 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
              {todayWorkout.title}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
              {todayWorkout.focus}
            </p>
          </div>

          {/* Badges: Duration & Calories */}
          <div className="grid grid-cols-2 gap-2 mb-3.5">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <div>
                <div className="text-[9px] text-slate-400 uppercase">Čas</div>
                <div className="text-xs font-bold text-slate-100">{todayWorkout.durationMin} min</div>
              </div>
            </div>
            {todayWorkout.caloriesBurned > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <div>
                  <div className="text-[9px] text-slate-400 uppercase">Výdej</div>
                  <div className="text-xs font-bold text-slate-100">~{todayWorkout.caloriesBurned} kcal</div>
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5 mb-4">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Cviky</span>
              <span className="font-bold text-[#39ff14]">{completedExercises} z {totalExercises} hotovo</span>
            </div>
            <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                style={{ width: `${totalExercises > 0 ? (completedExercises / totalExercises) * 100 : 0}%` }}
                className="h-full bg-gradient-to-r from-cyan-400 to-[#39ff14] rounded-full shadow-[0_0_8px_#39ff14] transition-all duration-300"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2 pt-1">
          <button
            onClick={onOpenWorkoutLogger}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#39ff14] hover:opacity-95 shadow-[0_0_15px_rgba(57,255,20,0.3)] flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            {maDnesTrenink ? (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Spustit záznamník (Stopky)</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Zapsat trénink mimo plán</span>
              </>
            )}
          </button>

          <button
            onClick={() => onSelectTab('trenink')}
            className="w-full py-2 px-3 rounded-xl text-xs font-bold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center gap-1 transition-all"
          >
            <span>Zobrazit týdenní plán</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </motion.div>


      {/* 
        ========================================================================
        KARTA 6: AI Trenér TED (col-span-1 md:col-span-2 lg:col-span-1)
        Kompaktní informativní blok s AI doporučením. Soupis k nákupu odsud
        putoval na Kartu 3 — patří k jídelníčku, ne k TEDovi, a ředil
        jediné místo, kde je TED vidět (docs/DALSI_KROK.md 6.8).
        ========================================================================
      */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.25 }}
        className="col-span-1 md:col-span-2 lg:col-span-1 relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-[#0c1017]/95 backdrop-blur-xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col justify-between"
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-950/60 border border-purple-500/40 flex items-center justify-center text-purple-400">
                <Brain className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">AI Trenér TED</h3>
              </div>
            </div>
          </div>

          {/* Zpráva od trenéra, nebo pozvánka do chatu.
              Zprávy zatím vznikají jen při registraci a po týdnu se skrývají
              jako zastaralé, takže tenhle blok byl většinu času prázdný —
              karta se jménem TEDa, ve které nebyl TED. */}
          {topCoachTip ? (
            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 mb-3">
              <div className="text-xs font-bold text-slate-100 mb-1">{topCoachTip.headline}</div>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                {topCoachTip.content}
              </p>
            </div>
          ) : (
            <button
              onClick={onAskTed}
              className="w-full text-left p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 mb-3 transition-all"
            >
              <div className="text-xs font-bold text-slate-100 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#00f2fe]" />
                <span>Zeptej se TEDa</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Odpoví na tvůj plán, trénink i naměřená data. Vidí jen tvůj profil.
              </p>
            </button>
          )}
        </div>

      </motion.div>
    </div>
  );
};
