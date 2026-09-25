import React from 'react';
import { CalendarDays, CreditCard, ShoppingBag, Watch } from 'lucide-react';
import type { CoachTip, MealItem, UserPreferences, UserProfile, WeightRecord, WorkoutDay, ZamcenyPlan } from '../types';
import type { NesouladCile } from '../data/adaptery';
import type { ActiveTab } from './NavigationTabs';
import { apiFetch } from '../lib/api';
import { denProgramu } from '../lib/denProgramu.ts';
import { najdiNejblizsiTrenink } from '../lib/nejblizsiTrenink.ts';
import { odstupText } from '../lib/odstup';
import { pripravenoRadky, tydenSouhrn } from '../lib/tvojeCesta.ts';
import { uvitaniZavreno, zavriUvitani, jeUvitaciDen } from '../lib/uvitani.ts';
import { useTed } from '../context/TedContext';
import { DnesHero } from './DnesHero';
import { jeTreninkHotovy, rozpracovaneCviky, type Adherence } from '../lib/trenink.ts';
import { RadekTeda } from './RadekTeda';
import { CasovaOsaDne } from './CasovaOsaDne';
import { TvojeCesta } from './TvojeCesta';
import { UvitaciKarta } from './UvitaciKarta';
import { TrialCountdownStrip } from './TrialCountdownStrip';
import { popisClenstvi } from '../lib/stavPredplatneho';
import { NastrojeDlazdice, type Dlazdice, type NastrojId } from './NastrojeDlazdice';

/**
 * ZÁLOŽKA DNES — PROMPT_DNES_WOW.md. Skládá obrazovku shora dolů:
 *
 *   A. hero „Tvůj den" (pozdrav, věta o dni, jedna akce, tři kroužky)
 *      [den 1–2: uvítací karta „Tvůj plán je připravený"]
 *   B. zpráva od TEDa
 *   C. časová osa dne (jídla + trénink)
 *   D. Tvoje cesta (graf váhy, série, týden, co je připravené)
 *   F. prodej nanejvýš jednou (úzký pruh) — nic prodejního nad osou dne
 *   E. nástroje (dlaždice; obsah sekcí se rozbaluje pod nimi)
 *
 * Stav dne ze serveru (`/api/stats/adherence`) se načítá tady jednou a sdílí
 * ho hero i osa dne, ať trénink změřený hodinkami neplatí v hero za hotový
 * a na ose za nehotový.
 */
interface Props {
  profile: UserProfile;
  registrovanOd: string | null;
  todayWorkout: WorkoutDay;
  workouts: WorkoutDay[];
  meals: MealItem[];
  weekMeals: { meals: MealItem[] }[];
  preferences: UserPreferences;
  weightRecords: WeightRecord[];
  /** `completed_at` z `daily_activity_completions` (jídla i tréninky) — série dní. */
  dokonceniISO: string[];
  coachTips: CoachTip[];
  polozekNakupu: number;
  nesouladCile: NesouladCile | null;
  onRegeneratePlan: () => void;
  regenerujiPlan: boolean;
  zamcenyPlan: ZamcenyPlan | null;
  posledniSynchronizaceZarizeni: string | null;
  withingsPosledniStazeni: string | null;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleMeal: (id: string) => void;
  onSelectRecipe: (meal: MealItem) => void;
  onOpenWeightModal: () => void;
  onOpenShopping: () => void;
  /** Obsah panelů dlaždic — stávající sekce beze změny, jen schované za dlaždicí. */
  panelTyden: React.ReactNode;
  panelZarizeni: React.ReactNode;
  panelUcet: React.ReactNode;
}

const STAV_CLENSTVI: Record<string, string> = {
  'AKTIVNÍ': 'aktivní',
  TRIAL: 'zkušební období',
  'PAUZOVÁNO': 'pozastaveno',
  VIP: 'aktivní',
};

export const DnesObrazovka: React.FC<Props> = ({
  profile,
  registrovanOd,
  todayWorkout,
  workouts,
  meals,
  weekMeals,
  preferences,
  weightRecords,
  dokonceniISO,
  coachTips,
  polozekNakupu,
  nesouladCile,
  onRegeneratePlan,
  regenerujiPlan,
  zamcenyPlan,
  posledniSynchronizaceZarizeni,
  withingsPosledniStazeni,
  onSelectTab,
  onToggleMeal,
  onSelectRecipe,
  onOpenWeightModal,
  onOpenShopping,
  panelTyden,
  panelZarizeni,
  panelUcet,
}) => {
  const { dostupny: tedDostupny } = useTed();
  const [stav, setStav] = React.useState<Adherence | null>(null);
  const [otevreny, setOtevreny] = React.useState<NastrojId | null>(null);
  const [uvitaniSkryto, setUvitaniSkryto] = React.useState(() => uvitaniZavreno());
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const scrollNaPanel = React.useRef(false);

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

  // Po otevření panelu z prodejního pruhu se odscrolluje na něj.
  React.useEffect(() => {
    if (otevreny && scrollNaPanel.current) {
      scrollNaPanel.current = false;
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [otevreny]);

  const ted = new Date();
  const denN = denProgramu(registrovanOd, ted);
  const maTrenink = todayWorkout.exercises.length > 0;
  const treninkHotovy = jeTreninkHotovy(todayWorkout, stav);
  const nejblizsi = !maTrenink ? najdiNejblizsiTrenink(workouts) : null;
  const tyden = tydenSouhrn(workouts, weekMeals, maTrenink ? treninkHotovy : null);
  const rozpracovano = rozpracovaneCviky(todayWorkout, stav);
  const pripraveno = pripravenoRadky({
    jidelNaTyden: tyden.jidelCelkem,
    treninkuNaTyden: tyden.treninkuCelkem,
    polozekNakupu,
    tedDostupny,
  });

  const zarizeniCas = odstupText(posledniSynchronizaceZarizeni) || odstupText(withingsPosledniStazeni);
  const zarizeniUdaj = zarizeniCas ? `Synchronizováno ${zarizeniCas}` : 'Zatím nic nepřipojeno';
  const tydenZamceny = zamcenyPlan?.zamceno === true;

  const dlazdice: Dlazdice[] = [
    {
      id: 'nakup',
      ikona: <ShoppingBag className="w-4 h-4" aria-hidden="true" />,
      nazev: 'Nákupní seznam',
      udaj: polozekNakupu > 0 ? `${polozekNakupu} ${polozekNakupu === 1 ? 'položka' : polozekNakupu < 5 ? 'položky' : 'položek'}` : 'Zatím prázdný',
      rozbaluje: false,
    },
    {
      id: 'tyden',
      ikona: <CalendarDays className="w-4 h-4" aria-hidden="true" />,
      nazev: 'Tvůj další týden',
      udaj: tydenZamceny ? 'Odemkne se s členstvím' : 'Vytvoří se automaticky',
      rozbaluje: true,
      neaktivni: !tydenZamceny,
    },
    {
      id: 'zarizeni',
      ikona: <Watch className="w-4 h-4" aria-hidden="true" />,
      nazev: 'Propojená zařízení',
      udaj: zarizeniUdaj,
      rozbaluje: true,
    },
    {
      id: 'ucet',
      ikona: <CreditCard className="w-4 h-4" aria-hidden="true" />,
      nazev: 'Účet a předplatné',
      // „START · předplatné aktivní od …" po Checkoutu v trialu, ne
      // „zkušební období" (src/lib/stavPredplatneho.ts).
      udaj: profile.stavPredplatneho
        ? popisClenstvi(profile.membershipPlan, profile.stavPredplatneho, profile.clenemOd)
        : `${profile.membershipPlan} · ${STAV_CLENSTVI[profile.status] ?? String(profile.status).toLowerCase()}`,
      rozbaluje: true,
    },
  ];

  function klikNaDlazdici(id: NastrojId) {
    if (id === 'nakup') {
      onOpenShopping();
      return;
    }
    setOtevreny((aktualni) => (aktualni === id ? null : id));
  }

  function otevriPredplatne() {
    scrollNaPanel.current = true;
    setOtevreny('ucet');
  }

  function zavriUvitaciKartu() {
    zavriUvitani();
    setUvitaniSkryto(true);
  }

  const panel =
    otevreny === 'tyden' ? panelTyden : otevreny === 'zarizeni' ? panelZarizeni : otevreny === 'ucet' ? panelUcet : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <DnesHero
        profile={profile}
        registrovanOd={registrovanOd}
        todayWorkout={todayWorkout}
        workouts={workouts}
        meals={meals}
        targetCalories={preferences.dailyCalorieTarget}
        weightRecords={weightRecords}
        targetWeightKg={preferences.targetWeightKg}
        targetWeightAuto={preferences.targetWeightAuto === true}
        stav={stav}
        onSelectTab={onSelectTab}
        onToggleMeal={onToggleMeal}
        onOpenWeightModal={onOpenWeightModal}
      />

      {jeUvitaciDen(denN) && !uvitaniSkryto && (
        <UvitaciKarta
          radky={pripraveno}
          onPrvniJidlo={() => (meals[0] ? onSelectRecipe(meals[0]) : onSelectTab('jidelnicek'))}
          onZavrit={zavriUvitaciKartu}
        />
      )}

      <RadekTeda tips={coachTips} />

      <CasovaOsaDne
        meals={meals}
        treninek={maTrenink ? { nazev: todayWorkout.title, delkaMin: todayWorkout.durationMin, hotovo: treninkHotovy, rozpracovano } : null}
        dalsiTreninkText={nejblizsi ? `${nejblizsi.kdyText}: ${nejblizsi.nazev}` : null}
        preferences={preferences}
        onToggleMeal={onToggleMeal}
        onSelectRecipe={onSelectRecipe}
        onOpenTrenink={() => onSelectTab('trenink')}
        onOpenJidelnicek={() => onSelectTab('jidelnicek')}
        nesouladCile={nesouladCile}
        onRegeneratePlan={onRegeneratePlan}
        regenerujiPlan={regenerujiPlan}
      />

      <TvojeCesta
        weightRecords={weightRecords}
        targetWeightKg={preferences.targetWeightKg}
        dokonceniISO={dokonceniISO}
        treninky={workouts}
        dnesTreninekHotovy={maTrenink ? treninkHotovy : null}
        dnyJidel={weekMeals}
        polozekNakupu={polozekNakupu}
        onOpenWeightModal={onOpenWeightModal}
      />

      {/* PRODEJ NANEJVÝŠ JEDNOU, dole nad nástroji. Plná karta „Tvůj další
          týden" je jen v dlaždici níž — rozbalí ji sám uživatel. */}
      <TrialCountdownStrip
        zamceno={tydenZamceny}
        trialDniDoKonce={profile.trialDniDoKonce ?? null}
        onOtevritPredplatne={otevriPredplatne}
        stavPredplatneho={profile.stavPredplatneho}
        trialKonci={profile.trialKonci ?? null}
      />

      <NastrojeDlazdice dlazdice={dlazdice} otevreny={otevreny} onKlik={klikNaDlazdici} />

      {panel && <div ref={panelRef}>{panel}</div>}
    </div>
  );
};
