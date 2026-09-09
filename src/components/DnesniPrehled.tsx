import React from 'react';
import { Utensils, Dumbbell, Activity, ChevronRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ActiveTab } from './NavigationTabs';
import type { WorkoutDay } from '../types';

// CO MĚ DNES ČEKÁ A CO UŽ MÁM ZA SEBOU.
//
// TŘI STAVY, NE DVA. Přehled dřív počítal „splněno" z odškrtnutých
// plánovaných jídel a neodškrtnuté vydával za nesnědené. Neodškrtnuté ale
// znamená „nevíme" — člověk mohl jíst a jen to nezapsal. Karta proto odděluje
// co je v plánu, co je zaznamenané a kde záznam chybí.
//
// POHYB JE JEDINÉ TVRDÉ ČÍSLO. Minuty z hodinek nikdo neodškrtává, měří se.
// Proto se ukazují jen když opravdu dorazily, a nikdy se nedopočítávají
// z plánu.
//
// Zdroj je `GET /api/stats/adherence` nad DB funkcí `get_daily_adherence()`.
// Endpoint existoval, ale UI ho nevolalo a počítalo si vlastní číslo
// z odškrtnutých položek.

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
  todayWorkout: WorkoutDay;
  /** Kolik jídel je dnes v plánu — než dorazí adherence ze serveru. */
  pocetJidelVPlanu: number;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenPreferences: () => void;
}

function Radek({
  ikona,
  popisek,
  hodnota,
  poznamka,
}: {
  ikona: React.ReactNode;
  popisek: string;
  hodnota: string;
  poznamka?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-800/70 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="shrink-0 text-slate-500">{ikona}</span>
        <span className="text-sm text-slate-300">{popisek}</span>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-white">{hodnota}</div>
        {poznamka && <div className="text-[11px] text-slate-500">{poznamka}</div>}
      </div>
    </div>
  );
}

export const DnesniPrehled: React.FC<Props> = ({
  todayWorkout,
  pocetJidelVPlanu,
  onSelectTab,
  onOpenPreferences,
}) => {
  const [stav, setStav] = React.useState<Adherence | null>(null);

  React.useEffect(() => {
    let zive = true;
    apiFetch<{ adherence?: Adherence | null }>('/api/stats/adherence')
      .then((data) => {
        if (zive) setStav(data?.adherence ?? null);
      })
      .catch(() => {
        // Bez adherence se karta pořád vyplatí — ukáže aspoň plán dne.
        if (zive) setStav(null);
      });
    return () => {
      zive = false;
    };
  }, []);

  const maTrenink = todayWorkout.exercises.length > 0;
  const planovanychJidel = stav?.planovanych_jidel || pocetJidelVPlanu;
  const zaznamenanychJidel = stav?.splnenych_jidel ?? 0;
  const chybiZaznam = Math.max(0, planovanychJidel - zaznamenanychJidel);

  // Trénink je odcvičený, když ho člověk odškrtl NEBO ho naměřily hodinky.
  // Bez toho by aplikace tvrdila „neodcvičeno" i po tréninku, který jen
  // nikdo neodklikl.
  const treninkHotovy =
    todayWorkout.isCompleted
    || stav?.trenink_splnen === true
    || (stav?.watch_workout_count ?? 0) > 0
    || (stav?.manual_workout_count ?? 0) > 0;

  const pohybMin = stav?.pohyb_min ?? 0;

  return (
    <section
      aria-label="Dnešní přehled"
      className="rounded-3xl border border-slate-800 bg-povrch p-5 sm:p-6"
    >
      <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
        Co tě dnes čeká
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        {maTrenink
          ? `${todayWorkout.title}${todayWorkout.durationMin > 0 ? ` · ${todayWorkout.durationMin} min` : ''}`
          : todayWorkout.dayName
            ? 'Dnes máš v tréninkovém plánu volno.'
            : 'Na dnešek tu zatím nemáš trénink.'}
      </p>

      <div className="mt-4">
        <Radek
          ikona={<Utensils className="w-4 h-4" />}
          popisek="Jídla"
          hodnota={
            planovanychJidel > 0
              ? `${zaznamenanychJidel} z ${planovanychJidel} zaznamenáno`
              : 'Zatím bez jídelníčku'
          }
          poznamka={
            chybiZaznam > 0
              ? `U ${chybiZaznam} zatím nevíme, jestli jsi jedl`
              : undefined
          }
        />

        <Radek
          ikona={<Dumbbell className="w-4 h-4" />}
          popisek="Trénink"
          hodnota={
            !maTrenink
              ? 'Dnes volno'
              : treninkHotovy
                ? 'Odcvičeno'
                : 'Čeká na tebe'
          }
          poznamka={
            maTrenink && !treninkHotovy && !todayWorkout.isToday
              ? `Naplánováno na ${todayWorkout.dayName}`
              : undefined
          }
        />

        {/* Pohyb se ukazuje jen když ho hodinky naměřily. Nula by tvrdila,
            že se člověk nehýbal — my víme jen to, že data nedorazila. */}
        {pohybMin > 0 && (
          <Radek
            ikona={<Activity className="w-4 h-4" />}
            popisek="Pohyb"
            hodnota={`${pohybMin} min`}
            poznamka="Naměřeno hodinkami"
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => onSelectTab('trenink')}
          className="min-h-11 rounded-xl border border-cyan-500/40 bg-cyan-950/60 px-4 text-sm font-semibold text-cyan-300 hover:bg-cyan-900/60 transition-all inline-flex items-center gap-1.5"
        >
          <span>{maTrenink ? 'Otevřít dnešní trénink' : 'Prohlédnout tréninkový plán'}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('jidelnicek')}
          className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300 hover:border-slate-500 transition-all"
        >
          Otevřít jídelníček
        </button>
        <button
          type="button"
          onClick={onOpenPreferences}
          className="min-h-11 rounded-xl border border-slate-800 px-4 text-sm text-slate-400 hover:text-slate-200 transition-all"
        >
          Upravit cíle
        </button>
      </div>
    </section>
  );
};
