import React, { useState } from 'react';
import {
  Dumbbell,
  Clock,
  Flame,
  CheckCircle2,
  Calendar,
  CalendarDays,
  Play,
  TrendingUp,
  Award,
  ChevronRight,
  Sparkles,
  PlayCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { ExerciseItem, WorkoutDay } from '../types';
import { dnesniTrenink, jeNaplanovany, vybranyTrenink } from '../lib/trenink';
import { serieOpakovaniSlovy } from '../../lib/profile/treninkPopis.js';
import { cvikZPlanu } from '../data/adaptery';
import { apiFetch } from '../lib/api';
import { Vysvetlivka } from './Vysvetlivka';
import { NadpisSekce } from './NadpisSekce';
import { PruhDnu } from './PruhDnu';
import { ZmenitDnesniTrenink } from './ZmenitDnesniTrenink';

/** level 'lehké'/'střední'/'těžké' -> barva badge. Cokoli jiného (neznámá hodnota) barvu nedostane. */
function barvyObtiznosti(obtiznost: string): string {
  if (obtiznost === 'lehké') return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30';
  if (obtiznost === 'těžké') return 'bg-rose-950/60 text-rose-300 border-rose-500/30';
  return 'bg-amber-950/60 text-amber-300 border-amber-500/30';
}

interface WorkoutSectionProps {
  workouts: WorkoutDay[];
  onToggleExercise: (dayName: string, exerciseId: string) => void;
  onOpenWorkoutLogger: () => void;
  onOpenWeeklyModal: () => void;
  /** Trénink dne se změnil na serveru — načti plán znovu. */
  onPlanZmenen: () => void;
}

export const WorkoutSection: React.FC<WorkoutSectionProps> = ({
  workouts,
  onToggleExercise,
  onOpenWorkoutLogger,
  onOpenWeeklyModal,
  onPlanZmenen
}) => {
  // null = uzivatel zatim nic nevybral, vybrany den se odvodi z dat.
  // Ulozeny nazev dne by po pregenerovani planu ukazoval na neexistujici den.
  const [selectedDayName, setSelectedDayName] = useState<string | null>(null);
  // Otevřená ukázka provedení. Jedna naráz — animace z ExerciseDB mají
  // stovky kB a načítat je všechny zbytečně zdrží i vypadá to nepřehledně.
  // Klíč je "dayName#index", ne ex.id — po záměně varianty (viz níž) se id
  // cviku změní (nový canonical_key) a stabilní klíč podle pozice udrží
  // rozbalený panel otevřený i po záměně.
  const [otevrenaUkazka, setOtevrenaUkazka] = useState<string | null>(null);

  // ZMĚNA DNEŠNÍHO TRÉNINKU (9. 9. 2026). Endpointy replace-today,
  // confirm-replacement a restore-today byly hotové od začátku, ale
  // v aplikaci na ně nevedlo tlačítko — „mám jen 15 minut" nešlo řešit
  // jinak než trénink vynechat.
  const [zmenaOtevrena, setZmenaOtevrena] = useState(false);

  // ZÁMĚNA ZA LEHČÍ/TĚŽŠÍ VARIANTU (POST /api/plan/exercise-variant).
  // Patch se drží lokálně podle "dayName#index", ne v globálním `workouts`
  // stavu — appka ho stejně dostane napořadě při dalším načtení profilu,
  // a tohle stačí na "přerenderuj den" ihned po kliknutí.
  const [zamenaPodleKlice, setZamenaPodleKlice] = useState<Record<string, ExerciseItem>>({});
  const [nacitaSeVarianta, setNacitaSeVarianta] = useState<string | null>(null);
  const [chybaVariantyPodleKlice, setChybaVariantyPodleKlice] = useState<Record<string, string>>({});

  const handleZamenitVariantu = async (klic: string, ex: ExerciseItem, smer: 'lehci' | 'tezsi') => {
    if (ex.planId == null || ex.planDay == null || !ex.canonicalKey) return;
    setNacitaSeVarianta(klic);
    setChybaVariantyPodleKlice(prev => {
      const dalsi = { ...prev };
      delete dalsi[klic];
      return dalsi;
    });
    try {
      const odpoved = await apiFetch<{ exercise: any }>('/api/plan/exercise-variant', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: ex.planId,
          day_index: ex.planDay,
          canonical_key: ex.canonicalKey,
          smer
        })
      });
      const novy = cvikZPlanu(odpoved.exercise, 0, '', ex.planId ?? null, ex.planDay);
      setZamenaPodleKlice(prev => ({ ...prev, [klic]: novy }));
    } catch (chyba: any) {
      setChybaVariantyPodleKlice(prev => ({
        ...prev,
        [klic]: chyba?.message || 'Nepodařilo se zaměnit cvik.'
      }));
    } finally {
      setNacitaSeVarianta(null);
    }
  };

  const selectedWorkout = vybranyTrenink(workouts, selectedDayName);
  const todayWorkout = dnesniTrenink(workouts);
  const maDnesTrenink = jeNaplanovany(todayWorkout);
  // Rozpis teď nese i dny volna (docs/DALSI_KROK.md 8.14) — bez tohohle by
  // klik na jiný den vypadal, jako by se přepsal DNEŠNÍ trénink, protože nic
  // nenaznačuje, že se dole zobrazuje jiný den než dnešek.
  const prohlizisJinyDenNezDnes = !selectedWorkout.isToday;

  const totalWeeklyCalories = workouts.reduce((acc, w) => acc + (w.isCompleted ? w.caloriesBurned : 0), 0);
  const totalCompletedWorkouts = workouts.filter(w => w.isCompleted).length;
  const naplanovanychDni = workouts.filter(w => w.maTrenink !== false).length;

  /**
   * Věta o tom, proč jsou v týdnu různé tréninky a co která jmenovka znamená.
   *
   * „Trénink A" a „Trénink B" nikomu nic neřeknou — je to jen označení
   * v plánu. Vysvětlení se proto skládá z toho, co ty jednotky doopravdy
   * obsahují: název, kolikrát v týdnu je, a jaké svalové skupiny zabírá.
   */
  const vysvetleniStridani = React.useMemo(() => {
    const podleNazvu = new Map<string, { pocet: number; zamereni: string }>();
    for (const w of workouts) {
      // Dny volna (docs/DALSI_KROK.md 8.14) mají title "Volno" — bez tohohle
      // by se počítaly jako další tréninková jednotka vedle Trénink A/B.
      if (w.maTrenink === false) continue;
      const nazev = String(w.title || '').trim();
      if (!nazev) continue;
      const zaznam = podleNazvu.get(nazev);
      if (zaznam) zaznam.pocet += 1;
      else podleNazvu.set(nazev, { pocet: 1, zamereni: String(w.focus || '') });
    }
    if (podleNazvu.size < 2) return null;

    const casti = [...podleNazvu].map(([nazev, { pocet, zamereni }]) => {
      const kolikrat = pocet === 1 ? '1× týdně' : `${pocet}× týdně`;
      return zamereni ? `${nazev} (${kolikrat}) — ${zamereni}` : `${nazev} — ${kolikrat}`;
    });

    return `V týdnu se střídají ${podleNazvu.size} různé jednotky, aby každá partie dostala víc typů zátěže a mezi stejnými cviky byl odstup na zotavení. ${casti.join('. ')}.`;
  }, [workouts]);

  return (
    <div className="space-y-6">
      <NadpisSekce
        titulek="Tréninkový plán"
        podtitulek="Dnešní jednotka, týdenní rozpis a záznam odcvičeného"
        ikona={<Dumbbell className="w-5 h-5 text-akcent-lime" />}
      />

      {/* Top Banner: Today's Active Workout Hero */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-hero-trenink-od via-hero-trenink-stred to-hero-trenink-cil border border-lime-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {/* ETAPA 3.6. Fallback na prvni treninkovy den je spravny, ale
                nadpis "Dnesni naplanovany trenink (PATEK)" se ukazoval
                i v sobotu, kdy naplanovany neni. Kdyz dnes trenink neni,
                nadpis to rekne. */}
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              {!maDnesTrenink
                ? 'Dnes trénink naplánovaný nemáš'
                : todayWorkout.isToday
                  ? `Dnešní naplánovaný trénink (${todayWorkout.dayName})`
                  : `Nejbližší trénink v plánu (${todayWorkout.dayName})`}
            </span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span>{todayWorkout.title}</span>
            {maDnesTrenink && todayWorkout.durationMin > 0 && (
              <span className="text-sm font-semibold text-slate-400">
                ({todayWorkout.durationMin} min
                {todayWorkout.caloriesBurned > 0 && ` • ${todayWorkout.caloriesBurned} kcal`})
              </span>
            )}
          </h3>

          {/* ZAMĚŘENÍ MÍSTO „FOKUS: VARIANTA B".
              Pod nadpisem „Trénink B" stálo „Fokus: Varianta B" — tentýž
              údaj podruhé. Teď se vypíšou svalové skupiny složené ze cviků
              toho dne (viz lib/profile/treninkPopis.js). */}
          {todayWorkout.focus && (
            <p className="text-xs sm:text-sm text-slate-300">
              Zaměření: <strong className="text-slate-100">{todayWorkout.focus}</strong>
            </p>
          )}

          {/* Co si připravit. Bez toho člověk zjistí až u stroje, že cvik
              potřebuje velkou činku, kterou doma nemá. */}
          {todayWorkout.naradi && todayWorkout.naradi.length > 0 && (
            <p className="text-xs text-slate-400">
              Nářadí: <span className="text-slate-300">{todayWorkout.naradi.join(', ')}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenWorkoutLogger}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-all active:scale-95"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Spustit záznam tréninku</span>
          </button>

          {/* Změna se nabízí jen u dnešního nesplněného tréninku — server
              odmítne jak den bez tréninku (400), tak už odcvičený (409),
              a nabízet tlačítko, které skončí chybou, nemá smysl. */}
          {maDnesTrenink && todayWorkout.isToday && !todayWorkout.isCompleted
            && todayWorkout.planId && todayWorkout.planDay != null && (
            <button
              onClick={() => setZmenaOtevrena(true)}
              className="px-4 py-3 rounded-2xl text-xs font-bold text-akcent-cyan bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 transition-all"
            >
              Nemám tolik času
            </button>
          )}

          <button
            onClick={onOpenWeeklyModal}
            className="px-4 py-3 rounded-2xl text-xs font-bold text-slate-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 transition-all"
          >
            Celý rozpis
          </button>
        </div>
      </motion.div>

      {/* Week Split Navigator (PO - NE).
          Podřízené kartě DNEŠNÍHO tréninku výš — je to přehled, ne hlavní
          ovládání (docs/DALSI_KROK.md 8.14): menší dlaždice, žádná svítící
          animace na vybraném dni. Zvýraznění dneška (pulzující tečka)
          zůstává, to je orientace, ne ovládací prvek. */}
      <div className="space-y-3">
        <NadpisSekce
          uroven="podsekce"
          titulek="Týdenní rozpis"
          podtitulek={`Splněno ${totalCompletedWorkouts} z ${naplanovanychDni} jednotek${
            totalWeeklyCalories > 0 ? ` (${totalWeeklyCalories} kcal)` : ''
          }`}
          ikona={<CalendarDays className="w-4 h-4 text-slate-400" />}
        />

        {/* Dlaždice kreslí sdílený PruhDnu (docs/DALSI_KROK.md 9.8) — stejný
            pruh má i jídelníček. Tady se jen mapují data: indikátor je ✓ po
            splnění, jinak délka jednotky; Volno je neklikací. */}
        <PruhDnu
          polozky={workouts.map(w => ({
            klic: w.dayName,
            zkratka: w.dayShort,
            nazev: w.title,
            jeDnes: w.isToday,
            jeNeklikaci: w.maTrenink === false,
            indikator: w.maTrenink === false
              ? null
              : w.isCompleted
                ? 'splneno'
                : `${w.durationMin}m`
          }))}
          vybranyKlic={selectedDayName}
          onVybrat={setSelectedDayName}
        />

        {/* Vybraný den ≠ dnešek — bez tohohle vypadalo přepnutí, jako by se
            změnil DNEŠNÍ trénink v kartě výš. */}
        {prohlizisJinyDenNezDnes && (
          <div className="flex items-center justify-between gap-3 text-xs bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2">
            <span className="text-slate-300">
              Prohlížíš <strong className="text-white">{selectedWorkout.dayName}</strong>, ne dnešek.
            </span>
            <button
              type="button"
              onClick={() => setSelectedDayName(null)}
              className="font-bold text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
            >
              zpět na dnešek
            </button>
          </div>
        )}

        {/* PROČ SE TRÉNINKY STŘÍDAJÍ.
            „Trénink A" a „Trénink B" jsou jen jmenovky a nikomu nic neřeknou.
            Věta se skládá ze skutečných jednotek v plánu, takže sedí i tehdy,
            když jich je jiný počet nebo se jmenují jinak. */}
        {vysvetleniStridani && (
          <p className="text-xs text-slate-400 leading-relaxed bg-slate-900/50 border border-slate-800 rounded-2xl p-3.5">
            {vysvetleniStridani}
          </p>
        )}
      </div>

      {/* Selected Day Exercise Matrix */}
      <div className="rounded-3xl p-5 sm:p-6 bg-karta/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-akcent-lime">
              {[selectedWorkout.dayName, selectedWorkout.focus].filter(Boolean).join(' • ')}
            </div>
            <h4 className="text-lg font-bold text-white tracking-tight mt-0.5">
              {selectedWorkout.title}
            </h4>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 font-semibold inline-flex items-center gap-1">
              {selectedWorkout.exercises.length} cviků
              {/* Otazník k zápisu „3 × 8–10" je jednou u seznamu, ne u každého cviku. */}
              <Vysvetlivka pojem="zapis_serii" />
            </span>
            {selectedWorkout.caloriesBurned > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-akcent-lime font-bold border border-emerald-500/30">
                {selectedWorkout.caloriesBurned} kcal
              </span>
            )}
          </div>
        </div>

        {/* Exercises Table / List */}
        <div className="space-y-3">
          {selectedWorkout.exercises.map((puvodniCvik, i) => {
            // Klíč podle pozice, ne podle id — po záměně varianty se id (=
            // canonical_key) změní, ale patch i rozbalený panel mají zůstat
            // u téhož řádku.
            const klic = `${selectedWorkout.dayName}#${i}`;
            const ex = zamenaPodleKlice[klic] || puvodniCvik;
            return (
            <div
              key={klic}
              className={`rounded-2xl border transition-all ${
                ex.completed
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
            <div
              onClick={() => onToggleExercise(selectedWorkout.dayName, ex.id)}
              className="p-4 cursor-pointer flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-6 h-6 rounded-xl border flex items-center justify-center transition-all ${
                    ex.completed
                      ? 'bg-akcent-lime border-akcent-lime text-slate-950 shadow-[0_0_8px_var(--color-akcent-lime)]'
                      : 'border-slate-700 bg-slate-900 text-transparent'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                </div>

                <div>
                  <h5 className={`text-sm font-bold flex items-center gap-2 ${ex.completed ? 'text-emerald-300 line-through' : 'text-slate-100'}`}>
                    <span>{i + 1}. {ex.name}</span>
                    {/* BADGE OBTÍŽNOSTI. Z `level` v registru cviků (doplňuje
                        /api/profile) — chybí u warmup/rest/cooldown a u cviků
                        bez obtížnosti, pak se nekreslí nic. */}
                    {ex.obtiznost && (
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${barvyObtiznosti(ex.obtiznost)}`}>
                        {ex.obtiznost}
                      </span>
                    )}
                  </h5>
                  {/* ZÁPIS ROZEPSANÝ SLOVY.
                      „3 × 8–10" je jasné tomu, kdo posilovnu zná. Kdo v ní
                      stojí poprvé, potřebuje větu. Svalovou skupinu doplňuje
                      /api/profile z registru cviků; když u cviku chybí,
                      nekreslí se — radši nic než vymyšlený sval. */}
                  <p className="text-xs text-slate-400">
                    {serieOpakovaniSlovy(ex.sets, ex.reps) || null}
                    {serieOpakovaniSlovy(ex.sets, ex.reps) && ex.targetMuscle && ' • '}
                    {ex.targetMuscle && <>zabírá {ex.targetMuscle}</>}
                    {ex.restSec > 0 && <> • pauza {ex.restSec} s</>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-extrabold text-slate-200">
                  {ex.sets} × {ex.reps}
                </span>
                {ex.weightKg && (
                  <span className="px-3 py-1 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-xs font-extrabold text-akcent-cyan">
                    {ex.weightKg} kg
                  </span>
                )}

                {/* JAK SE TO CVIČÍ. Ukázku plán nese u každého cviku jako
                    `gif_url`, ale nikde se nezobrazovala — člověk viděl jen
                    název a musel si provedení domýšlet. Otevírá se na klik,
                    aby seznam zůstal přehledný a animace se nenačítaly
                    všechny naráz. Od 9.9 je pod obrázkem i slovní postup
                    (`postup` z registru cviků) — tlačítko se proto ukazuje
                    i cviku, který má jen kroky bez média. */}
                {(ex.ukazkaUrl || (ex.postup?.length ?? 0) > 0) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOtevrenaUkazka(otevrenaUkazka === klic ? null : klic);
                    }}
                    className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 transition-all ${
                      otevrenaUkazka === klic
                        ? 'bg-cyan-950/70 border-cyan-500/50 text-akcent-cyan'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-cyan-500/40'
                    }`}
                    title="Ukázat provedení cviku"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Jak na to</span>
                  </button>
                )}
              </div>
            </div>

            {(ex.ukazkaUrl || (ex.postup?.length ?? 0) > 0) && otevrenaUkazka === klic && (
              <div className="px-4 pb-4">
                {ex.ukazkaUrl && (
                  <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                    <img
                      src={ex.ukazkaUrl}
                      alt={`Provedení cviku ${ex.name}`}
                      loading="lazy"
                      className="w-full max-h-72 object-contain bg-white"
                    />
                  </div>
                )}

                {/* POSTUP POD OBRÁZKEM — docs/DALSI_KROK.md 9.9. Jen české
                    kroky z registru; bez nich se nekreslí nic — žádné
                    „Postup není k dispozici", žádná angličtina. Sedí uvnitř
                    sbaleného bloku „Jak na to", takže karta cviku neroste. */}
                {ex.postup && ex.postup.length > 0 && (
                  <ol className="mt-3 space-y-1.5 text-xs text-slate-300 leading-relaxed list-decimal list-inside marker:text-slate-500">
                    {ex.postup.map((krok, k) => (
                      <li key={k}>{krok}</li>
                    ))}
                  </ol>
                )}

                <p className="text-[11px] text-slate-500 mt-2">
                  {serieOpakovaniSlovy(ex.sets, ex.reps)}
                  {ex.targetMuscle && ` • zabírá ${ex.targetMuscle}`}
                </p>

                {/* LEHČÍ/TĚŽŠÍ VARIANTA (POST /api/plan/exercise-variant).
                    Tlačítko existuje jen s párem klíč+název — bez něj by
                    mířilo na cvik, který se nedá popsat ani zobrazit. */}
                {(ex.easierKey || ex.harderKey) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {ex.easierKey && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleZamenitVariantu(klic, ex, 'lehci');
                        }}
                        disabled={nacitaSeVarianta === klic}
                        className="px-2.5 py-1 rounded-xl border text-[11px] font-bold bg-slate-950 border-slate-800 text-emerald-300 hover:border-emerald-500/40 disabled:opacity-50 transition-all"
                      >
                        {nacitaSeVarianta === klic ? 'Měním…' : `Lehčí varianta: ${ex.easierNazev}`}
                      </button>
                    )}
                    {ex.harderKey && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleZamenitVariantu(klic, ex, 'tezsi');
                        }}
                        disabled={nacitaSeVarianta === klic}
                        className="px-2.5 py-1 rounded-xl border text-[11px] font-bold bg-slate-950 border-slate-800 text-rose-300 hover:border-rose-500/40 disabled:opacity-50 transition-all"
                      >
                        {nacitaSeVarianta === klic ? 'Měním…' : `Těžší varianta: ${ex.harderNazev}`}
                      </button>
                    )}
                  </div>
                )}
                {chybaVariantyPodleKlice[klic] && (
                  <p className="text-[11px] text-rose-400 mt-2">{chybaVariantyPodleKlice[klic]}</p>
                )}
              </div>
            )}
            </div>
            );
          })}
        </div>
      </div>

      {zmenaOtevrena && todayWorkout.planId && todayWorkout.planDay != null && (
        <ZmenitDnesniTrenink
          planId={todayWorkout.planId}
          planDayIndex={todayWorkout.planDay}
          puvodniNazev={todayWorkout.title}
          onZavrit={() => setZmenaOtevrena(false)}
          onZmeneno={onPlanZmenen}
        />
      )}
    </div>
  );
};
