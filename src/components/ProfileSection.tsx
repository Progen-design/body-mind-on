import React from 'react';
import {
  Activity,
  Scale,
  Sliders,
  Trophy,
  Flame,
  ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile, UserPreferences, WeightRecord, AppleWatchBiometrics, TelesneSlozeni } from '../types';
import { hodnotaNeboPomlcka, kdyMereno, zmenaText, NesouladCile } from '../data/adaptery';
import { denniMakra } from '../lib/makra';
import { CalorieMismatchBanner } from './CalorieMismatchBanner';
// `useTed` tu bylo kvůli kartě „AI trenér TED" mezi zařízeními. TED není
// zařízení a stejná karta je v Bento gridu níž — v profilu byl dvakrát.

interface ProfileSectionProps {
  profile: UserProfile;
  preferences: UserPreferences;
  latestWeightRecord: WeightRecord | null;
  biometrics: AppleWatchBiometrics;
  /** Z chytre vahy. null = dlazdice slozeni se nezobrazi. */
  slozeni?: TelesneSlozeni | null;
  /** Cíl v preferencích ≠ cíl, na který je postavený plán. null = sedí. */
  nesouladCile?: NesouladCile | null;
  onRegeneratePlan?: () => void;
  regenerujiPlan?: boolean;
  onEditPreferences: () => void;
  onAddWeight: () => void;
  /** Přepne na záložku Tělo & Váha s grafem vývoje. */
  onOpenWeightTab: () => void;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  profile,
  preferences,
  latestWeightRecord,
  biometrics,
  slozeni = null,
  nesouladCile = null,
  onRegeneratePlan,
  regenerujiPlan = false,
  onEditPreferences,
  onAddWeight,
  onOpenWeightTab
}) => {
  const makra = denniMakra(preferences);

  // Osobni silove rekordy odstraneny: pet vymyslenych hodnot (bench 135 kg,
  // drep 170 kg, mrtvy tah 210 kg…) vcetne "Pred 2 tydny" a "5 zapsanych PR".
  // Overeno v produkci — tabulka pro rekordy v databazi neexistuje ani pod
  // jinym nazvem, ani jako sloupec. Napojit nebylo na co.

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* HLAVIČKA S JMÉNEM SE PŘESTĚHOVALA NAHORU (9. 9. 2026).
          Kdo je přihlášený je určující údaj — čí plán se zobrazuje. Pod
          dneškem a jídelníčkem se k němu člověk musel proscrollovat. Žije
          teď v `ProfilHlavicka` a `App` ji kreslí jako první věc na
          stránce; tady zůstávají čísla, ne identita. */}
      {/* 2. Key Physical Parameters Bento Grid.
          U KAŽDÉ HODNOTY JE VIDĚT, KDY VZNIKLA. Bez data se čtvrt roku
          stará váha tváří stejně jako ranní vážení — a člověk podle ní
          rozhoduje. Datum měření chodí z `withings_body_snapshots`. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Váha */}
        <div className="p-4 sm:p-5 rounded-2xl bg-karta/90 border border-cyan-500/25 shadow-lg">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Aktuální váha</span>
            <Scale className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {hodnotaNeboPomlcka(latestWeightRecord?.weight, 'kg')}
          </div>
          {slozeni && (
            <div className="text-[11px] text-slate-500 mt-1">
              Zváženo {kdyMereno(slozeni.measured_at)}
            </div>
          )}
        </div>

        {/* Tuk — jen kdyz ho chytra vaha zmerila */}
        {slozeni && (
          <div className="p-4 sm:p-5 rounded-2xl bg-karta/90 border border-cyan-500/25 shadow-lg">
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
            <div className="text-[11px] text-slate-500 mt-1">
              Změřeno {kdyMereno(slozeni.measured_at)}
            </div>
          </div>
        )}

        {/* Svalová hmota */}
        {slozeni && (
          <div className="p-4 sm:p-5 rounded-2xl bg-karta/90 border border-cyan-500/25 shadow-lg">
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
            <div className="text-[11px] text-slate-500 mt-1">
              Změřeno {kdyMereno(slozeni.measured_at)}
            </div>
          </div>
        )}

        {/* CÍLOVÁ VÁHA.
            Bez vyplněného cíle tu svítilo „0 kg" — a pod tím „Při <10 %
            tělesného tuku", což je natvrdo psaná podmínka, kterou nikdo
            nezadal ani nespočítal. Nula není cíl, je to prázdné pole.
            Když cíl není, karta nabídne, kde si ho nastavit. */}
        <div className="p-4 sm:p-5 rounded-2xl bg-karta/90 border border-cyan-500/25 shadow-lg">
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

      {/* BMI, DATUM MĚŘENÍ A ODKAZ NA GRAF.
          Tyhle tři věci byly do 23. 8. 2026 v kartě „Tělesné složení
          & Withings" na záložce Přehled — spolu s váhou, tukem a svalovou
          hmotou, které jsou ale i tady nad tímhle řádkem. Po sloučení
          záložek by ta karta kreslila tytéž tři hodnoty podruhé, takže
          z ní zbylo jen to, co jinde není. */}
      {slozeni && (
        <div className="p-4 rounded-2xl bg-karta/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            {slozeni.bmi !== null && slozeni.bmi !== undefined && (
              <div>
                <div className="text-xs text-slate-400">BMI index</div>
                <div className="text-xl font-extrabold text-white">
                  {hodnotaNeboPomlcka(slozeni.bmi)}
                </div>
              </div>
            )}
            <div className="text-xs text-slate-500">
              Změřeno {kdyMereno(slozeni.measured_at)}
            </div>
          </div>
          <button
            onClick={onOpenWeightTab}
            className="py-2 px-4 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-950/50 hover:bg-cyan-900/70 border border-cyan-500/40 hover:border-cyan-400 flex items-center justify-center gap-2 transition-all"
          >
            <span>Otevřít graf vývoje &amp; Withings měření</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 5. Cíle stravování, Maker & Životosprávy */}
      <div className="p-5 sm:p-6 rounded-3xl bg-povrch/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Nastavené denní cíle &amp; Makroživiny</h3>
              {/* Odkud se hodnoty berou. „Makroživiny" samo o sobě nikomu
                  neřekne, že jde o rozdělení denních kalorií mezi bílkoviny,
                  sacharidy a tuky, ani že podle toho vzniká jídelníček. */}
              <p className="text-xs text-slate-400">
                Denní příjem rozdělený mezi bílkoviny, sacharidy a tuky — podle toho se skládá tvůj jídelníček
              </p>
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

        {/* JEN TO, CO SI UŽIVATEL NASTAVIL.
            Do 23. 8. 2026 tu vedle kalorií svítily „Pitný režim 3,5 L“ a
            „Cíl spánku 8h 00m“ — obojí natvrdo z makety v4. Žádné takové
            pole v preferencích neexistuje, nikdo si je nezadal a nic je
            neměří. Stejně tak popisky „Lehký přebytek (+150 kcal)“
            a „~1,0 g / kg svalů“ — dopočet, který nikdo nespočítal.
            Místo nich jsou tu všechna čtyři makra ze stejného zdroje,
            ze kterého se staví jídelníček. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Kalorie */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Denní kalorie</span>
            <span className="text-xl font-bold text-white">{preferences.dailyCalorieTarget} kcal</span>
          </div>

          {/* Makra ze sdíleného `denniMakra` — stejný výpočet jako v dlaždici
              Jídelníček níž, aby se ta dvě čísla nemohla rozejít. */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Bílkoviny ({makra.bilkoviny.procenta} %)</span>
            <span className="text-xl font-bold text-makro-bilkoviny">{makra.bilkoviny.gramy} g</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Sacharidy ({makra.sacharidy.procenta} %)</span>
            <span className="text-xl font-bold text-amber-400">{makra.sacharidy.gramy} g</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Tuky ({makra.tuky.procenta} %)</span>
            <span className="text-xl font-bold text-fuchsia-400">{makra.tuky.gramy} g</span>
          </div>
        </div>

        {/* Plán je otisk cíle v okamžiku generování — po změně cíle (např.
            oprava výšky, 6.5) se sám nepřegeneruje. Watchdog to hlásí
            (`calorie_target_mismatch`), tady to VIDÍ i uživatel
            (docs/DALSI_KROK.md 7.2a). */}
        {nesouladCile && onRegeneratePlan && (
          <CalorieMismatchBanner
            nesoulad={nesouladCile}
            onRegenerate={onRegeneratePlan}
            regenerating={regenerujiPlan}
          />
        )}
      </div>

    </div>
  );
};
