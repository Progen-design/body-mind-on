import React from 'react';
import { X, Timer, MapPin, Target, RefreshCw, Check, Undo2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { RECOMMENDED_PRESETS, getMaxMuscleGroupsForDuration } from '@lib/workoutMuscleGroupRules.js';
import { LOCATION_OPTIONS, EQUIPMENT_OPTIONS, DEFAULT_EQUIPMENT_BY_LOCATION } from '@lib/workoutTrainingSetup.js';

// ZMĚNA DNEŠNÍHO TRÉNINKU — „mám jen 15 minut", „dnes to nedám v posilovně".
//
// Server tohle umí od začátku: replace-today vygeneruje náhled,
// confirm-replacement ho zapíše do plánu, restore-today vrátí původní.
// Pravidla výběru partií (lib/workoutMuscleGroupRules.js) mají v hlavičce
// napsáno „modal změny tréninku" — ten modal se ale nikdy nepostavil, takže
// se k té funkci nedalo dostat. Tohle je on.
//
// PRAVIDLA SDÍLÍME SE SERVEREM, NEKOPÍRUJEME JE. Presety i limit partií na
// délku se importují z `lib/`, kde je čte i endpoint. Kdyby si UI drželo
// vlastní kopii, rozešly by se při první úpravě a uživatel by dostal
// odmítnutí až po odeslání.
//
// SERVER JE POSLEDNÍ SLOVO. Limit regenerací na den (429), hotový trénink
// (409) i neplatná kombinace partií (400) se hlídají tam; tady se jen
// zobrazí, co server odpoví.

type Delka = 15 | 30 | 45 | 60;
type Intenzita = 'light' | 'medium' | 'hard';

interface CvikNahledu {
  name?: string;
  display_name_cs?: string;
  name_cs?: string;
  sets?: number;
  reps?: string | null;
  duration_sec?: number | null;
}

interface Nahled {
  replacement_id: string;
  title: string;
  duration_minutes: number;
  focus: string[];
  exercises: CvikNahledu[];
}

interface Props {
  planId: string;
  planDayIndex: number;
  /** Název dnešní jednotky, ať je vidět, co se nahrazuje. */
  puvodniNazev: string;
  /** Zavře modal bez zásahu do plánu. */
  onZavrit: () => void;
  /** Trénink se změnil (nebo vrátil) — rodič má znovu načíst plán. */
  onZmeneno: () => void;
}

const DELKY: Delka[] = [15, 30, 45, 60];

const INTENZITY: Array<{ id: Intenzita; label: string }> = [
  { id: 'light', label: 'Zlehka' },
  { id: 'medium', label: 'Normálně' },
  { id: 'hard', label: 'Naplno' },
];

/** Cvik má buď opakování, nebo čas — nikdy oboje. */
function serieText(cvik: CvikNahledu): string {
  const serie = Number(cvik.sets) || 0;
  if (cvik.reps) return `${serie} × ${cvik.reps}`;
  if (cvik.duration_sec) return `${serie} × ${cvik.duration_sec} s`;
  return `${serie} série`;
}

function nazevCviku(cvik: CvikNahledu): string {
  return cvik.display_name_cs || cvik.name_cs || cvik.name || 'Cvik';
}

export const ZmenitDnesniTrenink: React.FC<Props> = ({
  planId,
  planDayIndex,
  puvodniNazev,
  onZavrit,
  onZmeneno,
}) => {
  const [delka, setDelka] = React.useState<Delka>(30);
  const [misto, setMisto] = React.useState<string>('gym');
  const [vybaveni, setVybaveni] = React.useState<string>('full_gym');
  const [preset, setPreset] = React.useState<string>('full_body');
  const [intenzita, setIntenzita] = React.useState<Intenzita>('medium');

  const [nahled, setNahled] = React.useState<Nahled | null>(null);
  const [pracuji, setPracuji] = React.useState<null | 'navrh' | 'potvrzeni' | 'vraceni'>(null);
  const [chyba, setChyba] = React.useState<string | null>(null);

  // ESC zavírá, dokud se nic neodesílá — jinak by uživatel zavřel okno
  // uprostřed zápisu a nevěděl, jestli se změna uložila.
  React.useEffect(() => {
    function naKlavesu(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pracuji) onZavrit();
    }
    window.addEventListener('keydown', naKlavesu);
    return () => window.removeEventListener('keydown', naKlavesu);
  }, [pracuji, onZavrit]);

  // Vybavení se řídí místem, dokud do něj uživatel sám nesáhne — v posilovně
  // nedává smysl výchozí „bez vybavení" a doma zase „plně vybavené fitness".
  function zmenMisto(nove: string) {
    setMisto(nove);
    setVybaveni(DEFAULT_EQUIPMENT_BY_LOCATION[nove as keyof typeof DEFAULT_EQUIPMENT_BY_LOCATION] || 'basic');
  }

  // Kratší trénink unese míň partií. Preset, který se do času nevejde,
  // se nenabízí — server by ho stejně odmítl.
  const maxPartii = getMaxMuscleGroupsForDuration(delka);
  const dostupnePresety = RECOMMENDED_PRESETS.filter(
    (p: { muscles: string[] }) => p.muscles[0] === 'full_body' || p.muscles.length <= maxPartii
  );

  React.useEffect(() => {
    if (!dostupnePresety.some((p: { id: string }) => p.id === preset)) {
      setPreset(dostupnePresety[0]?.id ?? 'full_body');
    }
  }, [delka, preset, dostupnePresety]);

  const vybranyPreset = RECOMMENDED_PRESETS.find((p: { id: string }) => p.id === preset);

  async function navrhni() {
    setPracuji('navrh');
    setChyba(null);
    try {
      const odpoved = await apiFetch<{ preview?: Nahled } & Nahled>('/api/workout/replace-today', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: planId,
          plan_day_index: planDayIndex,
          selected_muscle_groups: vybranyPreset?.muscles ?? ['full_body'],
          duration_minutes: delka,
          intensity: intenzita,
          training_location: misto,
          equipment_level: vybaveni,
        }),
      });
      const data = (odpoved.preview ?? odpoved) as Nahled;
      if (!data?.replacement_id) throw new Error('Server nevrátil návrh tréninku.');
      setNahled(data);
    } catch (e) {
      const stav = (e as { status?: number })?.status;
      if (stav === 429) setChyba('Dnes už jsi vyčerpal počet nových návrhů. Zkus to zítra.');
      else if (stav === 409) setChyba('Dnešní trénink je už odcvičený, měnit ho nejde.');
      else setChyba((e as Error)?.message || 'Návrh se nepodařilo vytvořit.');
    } finally {
      setPracuji(null);
    }
  }

  async function potvrd() {
    if (!nahled) return;
    setPracuji('potvrzeni');
    setChyba(null);
    try {
      await apiFetch('/api/workout/confirm-replacement', {
        method: 'POST',
        body: JSON.stringify({
          replacement_id: nahled.replacement_id,
          plan_id: planId,
          plan_day_index: planDayIndex,
        }),
      });
      onZmeneno();
      onZavrit();
    } catch (e) {
      setChyba((e as Error)?.message || 'Změnu se nepodařilo uložit.');
    } finally {
      setPracuji(null);
    }
  }

  async function vratPuvodni() {
    setPracuji('vraceni');
    setChyba(null);
    try {
      await apiFetch('/api/workout/restore-today', {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId, plan_day_index: planDayIndex }),
      });
      onZmeneno();
      onZavrit();
    } catch (e) {
      setChyba((e as Error)?.message || 'Původní trénink se nepodařilo vrátit.');
    } finally {
      setPracuji(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Změnit dnešní trénink"
      onClick={() => { if (!pracuji) onZavrit(); }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-povrch border border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-5 bg-povrch border-b border-slate-800">
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">Změnit dnešní trénink</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Místo „{puvodniNazev}" dostaneš jinou jednotku na míru dnešku.
            </p>
          </div>
          <button
            type="button"
            onClick={onZavrit}
            disabled={!!pracuji}
            aria-label="Zavřít"
            className="shrink-0 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!nahled && (
            <>
              <fieldset>
                <legend className="text-xs font-bold text-slate-300 inline-flex items-center gap-1.5 mb-2">
                  <Timer className="w-3.5 h-3.5 text-akcent-cyan" /> Kolik mám času
                </legend>
                <div className="grid grid-cols-4 gap-2">
                  {DELKY.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDelka(m)}
                      aria-pressed={delka === m}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        delka === m
                          ? 'bg-cyan-950/70 border-cyan-500/60 text-akcent-cyan'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-cyan-500/40'
                      }`}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-bold text-slate-300 inline-flex items-center gap-1.5 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-akcent-cyan" /> Kde cvičím
                </legend>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {LOCATION_OPTIONS.map((o: { id: string; label: string }) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => zmenMisto(o.id)}
                      aria-pressed={misto === o.id}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        misto === o.id
                          ? 'bg-cyan-950/70 border-cyan-500/60 text-akcent-cyan'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-cyan-500/40'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {EQUIPMENT_OPTIONS.map((o: { id: string; label: string }) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setVybaveni(o.id)}
                      aria-pressed={vybaveni === o.id}
                      className={`py-2 px-1 rounded-xl text-[11px] font-semibold border transition-all ${
                        vybaveni === o.id
                          ? 'bg-slate-800 border-slate-600 text-white'
                          : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-bold text-slate-300 inline-flex items-center gap-1.5 mb-2">
                  <Target className="w-3.5 h-3.5 text-akcent-cyan" /> Na co se zaměřit
                </legend>
                <div className="flex flex-wrap gap-2">
                  {dostupnePresety.map((p: { id: string; label: string }) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPreset(p.id)}
                      aria-pressed={preset === p.id}
                      className={`py-1.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                        preset === p.id
                          ? 'bg-lime-950/70 border-lime-500/60 text-akcent-lime'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-lime-500/40'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {delka <= 30 && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    Do {delka} minut se vejde nejvýš {maxPartii}{' '}
                    {maxPartii === 1 ? 'partie' : 'partie'} — delší výběr se nabídne u delšího tréninku.
                  </p>
                )}
              </fieldset>

              <fieldset>
                <legend className="text-xs font-bold text-slate-300 mb-2">Jak do toho</legend>
                <div className="grid grid-cols-3 gap-2">
                  {INTENZITY.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setIntenzita(o.id)}
                      aria-pressed={intenzita === o.id}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        intenzita === o.id
                          ? 'bg-slate-800 border-slate-600 text-white'
                          : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {nahled && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <div className="text-base font-extrabold text-white">{nahled.title}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {nahled.duration_minutes} min
                  {nahled.focus?.length ? ` • ${nahled.focus.join(', ')}` : ''}
                </div>
              </div>

              <ol className="space-y-1.5">
                {nahled.exercises.map((cvik, i) => (
                  <li
                    key={`${nazevCviku(cvik)}-${i}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800"
                  >
                    <span className="text-xs font-semibold text-slate-200">
                      {i + 1}. {nazevCviku(cvik)}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-slate-400">
                      {serieText(cvik)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {chyba && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-200 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{chyba}</span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 p-5 pt-3 bg-povrch border-t border-slate-800 space-y-2">
          {!nahled ? (
            <button
              type="button"
              onClick={navrhni}
              disabled={pracuji === 'navrh'}
              className="w-full py-3 rounded-2xl text-sm font-bold text-black bg-akcent-lime hover:brightness-110 disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2"
            >
              {pracuji === 'navrh' && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{pracuji === 'navrh' ? 'Sestavuji trénink…' : 'Navrhnout trénink'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={potvrd}
                disabled={!!pracuji}
                className="w-full py-3 rounded-2xl text-sm font-bold text-black bg-akcent-lime hover:brightness-110 disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2"
              >
                {pracuji === 'potvrzeni' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{pracuji === 'potvrzeni' ? 'Ukládám…' : 'Použít tenhle trénink'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setNahled(null); setChyba(null); }}
                disabled={!!pracuji}
                className="w-full py-2.5 rounded-2xl text-xs font-bold text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-600 disabled:opacity-50 transition-all"
              >
                Zkusit jiný návrh
              </button>
            </>
          )}

          {/* Vrácení původního tréninku je bezpečná cesta zpět. Server sám
              pozná, jestli je co vracet — proto se tlačítko nabízí vždy. */}
          <button
            type="button"
            onClick={vratPuvodni}
            disabled={!!pracuji}
            className="w-full py-2 rounded-2xl text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50 transition-all inline-flex items-center justify-center gap-1.5"
          >
            {pracuji === 'vraceni' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Undo2 className="w-3.5 h-3.5" />
            )}
            <span>Vrátit původní trénink</span>
          </button>
        </div>
      </div>
    </div>
  );
};
