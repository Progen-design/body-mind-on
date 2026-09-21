import React from 'react';
import { motion } from 'motion/react';
import { Check, ChevronRight, Dumbbell, Scale, Utensils } from 'lucide-react';
import type { ActiveTab } from './NavigationTabs';
import type { MealItem, UserProfile, WeightRecord, WorkoutDay } from '../types';
import { pozdrav } from '../lib/pozdrav.ts';
import { denProgramu } from '../lib/denProgramu.ts';
import { dalsiKrok, datumDneCesky } from '../lib/dalsiKrok.ts';
import { vypocitejVahovyPokrok } from '../lib/vahovyPokrok.ts';
import { najdiNejblizsiTrenink } from '../lib/nejblizsiTrenink.ts';
import { calendarDateIsoInPrague } from '../../lib/czechCalendar.js';
import { MembershipStatusBadge } from './MembershipStatusBadge';
import { ProgresniKruh } from './ProgresniKruh';

/**
 * HERO „TVŮJ DEN" — PROMPT_DNES_WOW.md bod A.
 *
 * Datum, den programu a trial chip; pozdrav s oslovením; věta o stavu dne;
 * JEDNA primární akce přímo pod větou (žádný rámeček navíc) a tři kroužky
 * postupu — jídlo, trénink, váha. Klik na kroužek otevře příslušnou záložku.
 *
 * Pole pro vlastní oslovení se z hero přestěhovalo do Účtu; pozdrav
 * ho bere z `profile.preferredAddress` (vlastní tvar, nebo vokativ
 * z `body_metrics.name` — viz src/lib/vokativ.ts).
 */

/** Stav dne ze serveru (`/api/stats/adherence`) — načítá rodič. */
export interface Adherence {
  planovanych_jidel: number;
  splnenych_jidel: number;
  treninkovy_den: boolean;
  trenink_splnen: boolean;
  pohyb_min: number;
  watch_workout_count: number;
  manual_workout_count: number;
}

interface Props {
  profile: UserProfile;
  /** ISO datum registrace (`user.created_at`) — Den N programu. */
  registrovanOd: string | null;
  todayWorkout: WorkoutDay;
  /** Celý týden — jen na dohledání nejbližšího tréninku ve dni volna. */
  workouts: WorkoutDay[];
  meals: MealItem[];
  targetCalories: number;
  /** Celá historie váhy (naVazeni) — start = první záznam, aktuální = poslední. */
  weightRecords: WeightRecord[];
  targetWeightKg: number;
  stav: Adherence | null;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleMeal: (id: string) => void;
  onOpenWeightModal: () => void;
}

/**
 * Podíl odcvičených cviků dnešního tréninku (0–1).
 *
 * POZOR: `stav.trenink_splnen` ani `manual_workout_count` se tu NEPOUŽÍVAJÍ,
 * když má den seznam cviků. Každé odškrtnutí cviku je v `daily_activity_completions`
 * řádek s activity_type 'workout', takže `get_daily_adherence` hlásí trénink
 * jako splněný už po PRVNÍM cviku — kroužek pak svítil „Hotovo" při 2 ze 4 cviků
 * (nahlášeno 21. 9. 2026). Rozhoduje počet odškrtnutých cviků; hodinky
 * (`watch_workout_count`) trénink uznají celý.
 */
export function podilTreninku(todayWorkout: WorkoutDay, stav: Adherence | null): number {
  if (todayWorkout.isCompleted || (stav?.watch_workout_count ?? 0) > 0) return 1;
  const cviky = todayWorkout.exercises;
  if (cviky.length > 0) {
    return cviky.filter((c) => c.completed).length / cviky.length;
  }
  // Den bez seznamu cviků: jediný zdroj je ruční zápis / adherence.
  return stav?.trenink_splnen === true || (stav?.manual_workout_count ?? 0) > 0 ? 1 : 0;
}

/** Trénink je hotový, až když jsou odškrtnuté VŠECHNY cviky (nebo ho naměřily hodinky). */
export function jeTreninkHotovy(todayWorkout: WorkoutDay, stav: Adherence | null): boolean {
  return podilTreninku(todayWorkout, stav) >= 1;
}

function pocetJidelSlovy(n: number): string {
  if (n === 1) return 'jídlo';
  if (n >= 2 && n <= 4) return 'jídla';
  return 'jídel';
}

const cz = (n: number) => n.toLocaleString('cs-CZ');
const kg = (n: number) => n.toString().replace('.', ',');

/** Jedno políčko se stejným tvarem u všech tří kroužků — klikací, s popisem pro čtečku. */
const Ukazatel: React.FC<{
  popisek: string;
  ariaLabel: string;
  onClick: () => void;
  kruh: React.ReactNode;
  radek1: string;
  radek2?: string;
}> = ({ popisek, ariaLabel, onClick, kruh, radek1, radek2 }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-2.5 sm:p-3 min-w-0 transition-all hover:border-cyan-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
  >
    {kruh}
    <span className="text-[11px] font-semibold text-slate-300">{popisek}</span>
    <span className="text-[10px] text-slate-400 text-center leading-tight break-words w-full">{radek1}</span>
    {radek2 && <span className="text-[10px] text-slate-600 text-center leading-tight w-full">{radek2}</span>}
  </button>
);

export const DnesHero: React.FC<Props> = ({
  profile,
  registrovanOd,
  todayWorkout,
  workouts,
  meals,
  targetCalories,
  weightRecords,
  targetWeightKg,
  stav,
  onSelectTab,
  onToggleMeal,
  onOpenWeightModal,
}) => {
  const ted = new Date();

  const maTrenink = todayWorkout.exercises.length > 0;
  const podilTrenink = podilTreninku(todayWorkout, stav);
  const treninkHotovy = podilTrenink >= 1;
  const cvikuCelkem = todayWorkout.exercises.length;
  const cvikuHotovo = todayWorkout.exercises.filter((c) => c.completed).length;
  const nejblizsiTrenink = !maTrenink ? najdiNejblizsiTrenink(workouts) : null;

  const snedenoKcal = meals.reduce((acc, m) => acc + (m.completed ? m.calories : 0), 0);
  const zaznamenanychJidel = stav?.splnenych_jidel ?? meals.filter((m) => m.completed).length;
  const planovanychJidel = stav?.planovanych_jidel || meals.length;
  const zbyvaZapsat = Math.max(0, planovanychJidel - zaznamenanychJidel);

  const denN = denProgramu(registrovanOd, ted);
  const denKontext = datumDneCesky(ted);

  const dnesIso = calendarDateIsoInPrague(ted);
  const vazilSeDnes = weightRecords.length > 0 && weightRecords[weightRecords.length - 1].date === dnesIso;
  const vahaPokrok = vypocitejVahovyPokrok(weightRecords, targetWeightKg);

  const krok = dalsiKrok(
    {
      maTrenink,
      treninkHotovy,
      treninkNazev: todayWorkout.title,
      meals: meals.map((m) => ({ id: m.id, type: m.type, title: m.title, time: m.time, completed: m.completed })),
      vazilSeDnes,
    },
    ted
  );

  const vetaStavu = maTrenink
    ? `Dnes tě čeká ${todayWorkout.title}. Zapsáno ${zaznamenanychJidel} z ${planovanychJidel} jídel.`
    : `Dnes máš volno. ${zbyvaZapsat > 0 ? `Zbývá zapsat ${zbyvaZapsat} ${pocetJidelSlovy(zbyvaZapsat)}.` : `Zapsáno ${zaznamenanychJidel} z ${planovanychJidel} jídel.`}`;

  function spustDalsiKrok() {
    if (krok.typ === 'trenink') onSelectTab('trenink');
    else if (krok.typ === 'jidlo' && krok.mealId) onToggleMeal(krok.mealId);
    else if (krok.typ === 'vaha') onOpenWeightModal();
  }

  const podilKcal = targetCalories > 0 ? snedenoKcal / targetCalories : 0;
  const procentVahy = vahaPokrok.podilPokroku != null ? Math.round(vahaPokrok.podilPokroku * 100) : null;

  return (
    <motion.section
      aria-label="Tvůj den"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-7 bg-povrch/90 backdrop-blur-2xl border border-cyan-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        {/* POZDRAV, STAV DNE A JEDNA AKCE */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
            <span>{denKontext}</span>
            {denN != null && (
              <>
                <span aria-hidden="true">·</span>
                <span>Den {denN} tvého programu</span>
              </>
            )}
            <MembershipStatusBadge status={profile.status} trialDniDoKonce={profile.trialDniDoKonce} variant="card" />
          </div>

          <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {pozdrav(ted, profile.preferredAddress)}
          </h1>

          <p className="mt-1.5 text-sm text-slate-300">{vetaStavu}</p>

          {/* DALŠÍ KROK — primární akce přímo pod větou o stavu dne, bez rámečku. */}
          <div className="mt-4">
            {krok.typ === 'hotovo' ? (
              <p className="text-sm font-semibold text-akcent-lime">{krok.label}</p>
            ) : krok.typ === 'ceka' ? (
              /* Není úkol na teď — jen informace, bez tlačítka. */
              <p className="text-sm font-semibold text-slate-300">{krok.label}</p>
            ) : (
              <button
                type="button"
                onClick={spustDalsiKrok}
                className="w-full sm:w-auto min-h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-bold text-slate-950 bg-akcent-cyan hover:bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.35)] transition-all active:scale-[0.98]"
              >
                <span className="truncate">{krok.label}</span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* TŘI KROUŽKY — v jednom řádku i na 390 px, vpravo na desktopu. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:shrink-0 lg:w-[22rem]">
          <Ukazatel
            popisek="Jídlo"
            ariaLabel={`Jídlo: snědeno ${cz(snedenoKcal)} z ${cz(targetCalories)} kcal. Otevřít jídelníček.`}
            onClick={() => onSelectTab('jidelnicek')}
            kruh={
              <ProgresniKruh podil={podilKcal} barva="stroke-akcent-cyan">
                <Utensils className="w-5 h-5 text-slate-300" aria-hidden="true" />
              </ProgresniKruh>
            }
            radek1={`${cz(snedenoKcal)} / ${cz(targetCalories)} kcal`}
          />

          <Ukazatel
            popisek="Trénink"
            ariaLabel={
              treninkHotovy
                ? 'Trénink: hotovo. Otevřít tréninkový plán.'
                : maTrenink
                  ? `Trénink: ${todayWorkout.title}, ${todayWorkout.durationMin} minut, odcvičeno ${cvikuHotovo} z ${cvikuCelkem} cviků. Otevřít tréninkový plán.`
                  : 'Trénink: dnes volno. Otevřít tréninkový plán.'
            }
            onClick={() => onSelectTab('trenink')}
            kruh={
              <ProgresniKruh podil={podilTrenink} barva="stroke-akcent-lime">
                {treninkHotovy ? (
                  <Check className="w-6 h-6 text-akcent-lime stroke-[3]" aria-hidden="true" />
                ) : (
                  <Dumbbell className="w-5 h-5 text-slate-300" aria-hidden="true" />
                )}
              </ProgresniKruh>
            }
            radek1={
              treninkHotovy
                ? 'Hotovo'
                : maTrenink
                  ? `${todayWorkout.title} · ${todayWorkout.durationMin} min`
                  : 'Dnes volno'
            }
            radek2={
              !treninkHotovy && maTrenink && cvikuHotovo > 0
                ? `${cvikuHotovo} z ${cvikuCelkem} cviků`
                : !treninkHotovy && !maTrenink && nejblizsiTrenink
                  ? `${nejblizsiTrenink.kdyText}: ${nejblizsiTrenink.nazev}`
                  : undefined
            }
          />

          <Ukazatel
            popisek="Váha"
            ariaLabel={
              vahaPokrok.aktualniKg != null
                ? `Váha: ${kg(vahaPokrok.aktualniKg)} kg${procentVahy != null ? `, ${procentVahy} % cesty k cíli` : ''}${vahaPokrok.zbyvaKg != null && vahaPokrok.zbyvaKg > 0 ? `, zbývá ${kg(vahaPokrok.zbyvaKg)} kg` : ''}. Otevřít Tělo a váhu.`
                : 'Váha: zatím žádné vážení. Otevřít Tělo a váhu.'
            }
            onClick={() => onSelectTab('vaha')}
            kruh={
              <ProgresniKruh podil={vahaPokrok.podilPokroku ?? 0} barva="stroke-akcent-cyan">
                {procentVahy != null ? (
                  <span className="text-xs font-extrabold text-white">{procentVahy} %</span>
                ) : (
                  <Scale className="w-5 h-5 text-slate-300" aria-hidden="true" />
                )}
              </ProgresniKruh>
            }
            radek1={
              vahaPokrok.aktualniKg != null
                ? `${kg(vahaPokrok.aktualniKg)} kg${vahaPokrok.cilKg != null ? ` · cíl ${kg(vahaPokrok.cilKg)} kg` : ''}`
                : 'Zatím žádné vážení'
            }
            radek2={
              vahaPokrok.zbyvaKg != null && vahaPokrok.zbyvaKg > 0
                ? `zbývá ${kg(vahaPokrok.zbyvaKg)} kg`
                : vahaPokrok.aktualniKg == null
                  ? 'Zapiš první váhu'
                  : undefined
            }
          />
        </div>
      </div>
    </motion.section>
  );
};
