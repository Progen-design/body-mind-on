import React from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Dumbbell, Scale } from 'lucide-react';
import type { ActiveTab } from './NavigationTabs';
import type { MealItem, UserProfile, WeightRecord, WorkoutDay } from '../types';
import { apiFetch } from '../lib/api';
import { calendarDateIsoInPrague } from '../../lib/czechCalendar.js';
import { pozdrav } from '../lib/pozdrav.ts';
import { denProgramu } from '../lib/denProgramu.ts';
import { dalsiKrok, datumDneCesky } from '../lib/dalsiKrok.ts';
import { vypocitejVahovyPokrok } from '../lib/vahovyPokrok.ts';
import { najdiNejblizsiTrenink } from '../lib/nejblizsiTrenink.ts';
import { MembershipStatusBadge } from './MembershipStatusBadge';

/**
 * HERO „TVŮJ DEN" — PROMPT_DNES_HERO.md (21. 9. 2026).
 *
 * Nahrazuje `ProfilHlavicka` na záložce Dnes. Ta ukazovala e-mail, „Člen od",
 * věk a výšku — údaje, které nikdo denně nepotřebuje. Hero má za dvě
 * vteřiny říct „jak jsem na tom dnes a co mám udělat teď": pozdrav, den
 * programu, tři ukazatele (jídlo/trénink/váha) a JEDNU primární akci
 * (`src/lib/dalsiKrok.ts`). Identita (e-mail, věk, výška, „Upravit cíle")
 * se přestěhovala do menu v hlavičce a do nové karty „Profil" v Účtu —
 * nic se nemaže, jen stěhuje.
 *
 * ŘÁDEK TEDA (bod 2 zadání) je záměrně MIMO tuhle komponentu — samostatný
 * `RadekTeda.tsx`, vykreslený v App.tsx hned pod hero. Zadání ho vypisuje
 * jako vlastní bod struktury, ne jako součást hero karty.
 */

interface Adherence {
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
  onSelectTab: (tab: ActiveTab) => void;
  onToggleMeal: (id: string) => void;
  onOpenWeightModal: () => void;
  /** PATCH /api/profile-settings — vrací, jestli se uložení povedlo. */
  onSavePreferredAddress: (hodnota: string) => Promise<boolean>;
}

function pocetJidelSlovy(n: number): string {
  if (n === 1) return 'jídlo';
  if (n >= 2 && n <= 4) return 'jídla';
  return 'jídel';
}

/** Kroužek snědených kalorií — inline SVG, žádná grafová knihovna. */
function KruhKcal({ snedeno, cil }: { snedeno: number; cil: number }) {
  const podil = cil > 0 ? Math.max(0, Math.min(1, snedeno / cil)) : 0;
  const r = 24;
  const obvod = 2 * Math.PI * r;
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      role="img"
      aria-label={`Snědeno ${snedeno.toLocaleString('cs-CZ')} z ${cil.toLocaleString('cs-CZ')} kcal`}
    >
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="5" className="stroke-slate-800" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        className="stroke-akcent-cyan"
        strokeDasharray={obvod}
        strokeDashoffset={obvod * (1 - podil)}
        transform="rotate(-90 28 28)"
      />
    </svg>
  );
}

export const DnesHero: React.FC<Props> = ({
  profile,
  registrovanOd,
  todayWorkout,
  workouts,
  meals,
  targetCalories,
  weightRecords,
  targetWeightKg,
  onSelectTab,
  onToggleMeal,
  onOpenWeightModal,
  onSavePreferredAddress,
}) => {
  const [stav, setStav] = React.useState<Adherence | null>(null);
  const [oslovovaciJmeno, setOslovovaciJmeno] = React.useState('');
  const [ukladamOsloveni, setUkladamOsloveni] = React.useState(false);
  const [chybaOsloveni, setChybaOsloveni] = React.useState<string | null>(null);

  React.useEffect(() => {
    let zive = true;
    apiFetch<{ adherence?: Adherence | null }>('/api/stats/adherence')
      .then((data) => {
        if (zive) setStav(data?.adherence ?? null);
      })
      .catch(() => {
        if (zive) setStav(null);
      });
    return () => {
      zive = false;
    };
  }, []);

  const ted = new Date();

  const maTrenink = todayWorkout.exercises.length > 0;
  const treninkHotovy =
    todayWorkout.isCompleted
    || stav?.trenink_splnen === true
    || (stav?.watch_workout_count ?? 0) > 0
    || (stav?.manual_workout_count ?? 0) > 0;
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

  async function ulozOsloveni(e: React.FormEvent) {
    e.preventDefault();
    const hodnota = oslovovaciJmeno.trim();
    if (!hodnota) return;
    setUkladamOsloveni(true);
    setChybaOsloveni(null);
    const ok = await onSavePreferredAddress(hodnota);
    setUkladamOsloveni(false);
    if (!ok) setChybaOsloveni('Nepodařilo se uložit. Zkus to prosím znovu.');
  }

  function spustDalsiKrok() {
    if (krok.typ === 'trenink') onSelectTab('trenink');
    else if (krok.typ === 'jidlo' && krok.mealId) onToggleMeal(krok.mealId);
    else if (krok.typ === 'vaha') onOpenWeightModal();
  }

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

      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* POZDRAV & STAV DNE */}
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

            {/* „JAK TI MÁME ŘÍKAT?" — nenápadná výzva, jednou, dokud pole
                není vyplněné. Po uložení zmizí, protože `profile.preferredAddress`
                přestane být prázdné (App.tsx znovu načte profil). */}
            {!profile.preferredAddress && (
              <form onSubmit={ulozOsloveni} className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="oslovovaci-jmeno" className="text-xs text-slate-500">
                  Jak ti máme říkat?
                </label>
                <input
                  id="oslovovaci-jmeno"
                  type="text"
                  value={oslovovaciJmeno}
                  onChange={(e) => setOslovovaciJmeno(e.target.value)}
                  placeholder="např. Honzo"
                  maxLength={40}
                  className="min-h-9 px-3 py-1 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/60 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!oslovovaciJmeno.trim() || ukladamOsloveni}
                  className="min-h-9 px-3 py-1 rounded-lg text-xs font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/60 disabled:opacity-50 transition-all"
                >
                  {ukladamOsloveni ? 'Ukládám…' : 'Uložit'}
                </button>
                {chybaOsloveni && <span className="text-xs text-rose-400 basis-full">{chybaOsloveni}</span>}
              </form>
            )}
          </div>

          {/* TŘI UKAZATELE — v řádku pod pozdravem na mobilu, vpravo na desktopu. */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:shrink-0 lg:w-auto">
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 min-w-0">
              <KruhKcal snedeno={snedenoKcal} cil={targetCalories} />
              <span className="text-[11px] font-semibold text-slate-300">Jídlo</span>
              <span className="text-[10px] text-slate-500 text-center leading-tight">
                {snedenoKcal.toLocaleString('cs-CZ')} / {targetCalories.toLocaleString('cs-CZ')} kcal
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 min-w-0">
              <div className="w-14 h-14 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
                <Dumbbell className="w-6 h-6 text-akcent-lime" />
              </div>
              <span className="text-[11px] font-semibold text-slate-300">Trénink</span>
              <span className="text-[10px] text-slate-500 text-center leading-tight">
                {treninkHotovy
                  ? 'Hotovo'
                  : maTrenink
                    ? `${todayWorkout.title} · ${todayWorkout.durationMin} min`
                    : nejblizsiTrenink
                      ? `Volno · ${nejblizsiTrenink.kdyText} ${nejblizsiTrenink.nazev} · ${nejblizsiTrenink.durationMin} min`
                      : 'Volno'}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 min-w-0">
              <div className="w-14 h-14 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
                <Scale className="w-6 h-6 text-akcent-cyan" />
              </div>
              <span className="text-[11px] font-semibold text-slate-300">Váha</span>
              {vahaPokrok.aktualniKg != null ? (
                <>
                  <span className="text-[10px] text-slate-500 text-center leading-tight">
                    {vahaPokrok.aktualniKg.toString().replace('.', ',')} kg
                    {vahaPokrok.cilKg != null ? ` · cíl ${vahaPokrok.cilKg.toString().replace('.', ',')} kg` : ''}
                  </span>
                  {vahaPokrok.podilPokroku != null && (
                    <div
                      className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden"
                      role="img"
                      aria-label={`Pokrok k cílové váze: ${Math.round(vahaPokrok.podilPokroku * 100)} %`}
                    >
                      <div
                        className="h-full rounded-full bg-akcent-cyan"
                        style={{ width: `${vahaPokrok.podilPokroku * 100}%` }}
                      />
                    </div>
                  )}
                  {vahaPokrok.zbyvaKg != null && vahaPokrok.zbyvaKg > 0 && (
                    <span className="text-[10px] text-slate-600">{vahaPokrok.zbyvaKg.toString().replace('.', ',')} kg do cíle</span>
                  )}
                </>
              ) : (
                <span className="text-[10px] text-slate-600 text-center leading-tight">Zatím žádné vážení</span>
              )}
            </div>
          </div>
        </div>

        {/* DALŠÍ KROK — jedna primární akce, nebo věta „hotovo". */}
        <div className="mt-5 p-4 rounded-2xl border border-cyan-500/25 bg-slate-900/50">
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
              <span>{krok.label}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
};
