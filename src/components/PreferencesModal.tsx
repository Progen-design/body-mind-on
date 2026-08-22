import React, { useMemo, useRef, useState } from 'react';
import { X, Sliders, Loader2, AlertTriangle, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { getFrequencyDayRange } from '@lib/preferenceConstants.js';
import { POSITIVE_HABITS, NEGATIVE_HABITS } from '@lib/habits.js';
import { TRAINING_ENVIRONMENT_OPTIONS, EQUIPMENT_OPTIONS } from '@lib/trainingEnvironment.js';
import { Pole, Popisek, Chyba, Vyber, Vicenasobny } from './registrace/prvky';
import { AKTIVITA, CIL, DIETA, DNY, FREKVENCE, STRES, TYP_PRACE } from './registrace/volby';
import { NastaveniProfilu } from '../data/adaptery';

/**
 * NASTAVENÍ PROFILU.
 *
 * Formulářové prvky i výčty voleb se přebírají z registrace
 * (src/components/registrace/) a z lib/ — jsou jediným zdrojem pravdy.
 * Kdyby se tu psaly znovu, rozešly by se s tím, co server přijme.
 *
 * OSM POLÍ TU SCHVÁLNĚ NENÍ. Modál dřív nabízel denní kalorie, tři poměry
 * maker, cílovou váhu, výšku, týdenní tréninky a tři přepínače (Withings
 * auto-sync, Apple Health auto-sync, proaktivní tipy TEDa). Ani jedno z nich
 * /api/profile-preferences nepřijímá:
 *   — kalorie a makra počítá server z metrik a při každé regeneraci plánu je
 *     přepíše, takže uživatelova hodnota by nepřežila,
 *   — tři přepínače nejsou v žádné tabulce.
 * Cílová váha a výška zůstaly, ale jdou přes /api/profile-settings.
 *
 * DVA ENDPOINTY. Cíl, aktivita, stres, povolání, frekvence, dny, dieta,
 * prostředí a návyky mění plán a posílají e-mail. Cílová váha a výška ne.
 * Text o regeneraci se proto ukazuje jen když se mění první skupina.
 */

export interface VysledekUlozeni {
  ok: boolean;
  /** Co se skutečně uložilo — u částečného selhání to musí uživatel vědět. */
  ulozeno: string[];
  neulozeno: string[];
  chyba?: string | null;
  planRegenerated?: boolean;
}

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  soucasne: NastaveniProfilu;
  onSave: (zmeny: Partial<NastaveniProfilu>) => Promise<VysledekUlozeni>;
}

/** Pole, po jejichž změně server přegeneruje plán a pošle e-mail. */
const POLE_S_REGENERACI: (keyof NastaveniProfilu)[] = [
  'goal', 'activity', 'stress_level', 'occupation', 'frequency', 'workout_days',
  'diet_type', 'dietary_restrictions', 'foods_to_avoid',
  'training_environment', 'available_equipment', 'training_environment_detail',
  'selected_habits'
];

const VOLBY_NAVYKU = [
  ...POSITIVE_HABITS.map((h: any) => ({ value: String(h.id), label: `${h.emoji ?? ''} ${h.label}`.trim() })),
  ...NEGATIVE_HABITS.map((h: any) => ({ value: String(h.id), label: `${h.emoji ?? ''} ${h.label}`.trim() }))
];

function stejne(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  }
  return a === b;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  soucasne,
  onSave
}) => {
  const [data, setData] = useState<NastaveniProfilu>(soucasne);
  const [chyby, setChyby] = useState<Record<string, string>>({});
  const [uklada, setUklada] = useState(false);
  const [potiz, setPotiz] = useState<string | null>(null);

  // Formular se predvyplni pri OTEVRENI, ne pri kazde zmene reference.
  // naNastaveniProfilu() vyrabi novy objekt po kazdem znovuNacistProfil(),
  // takze porovnavani reference (otevrenoS !== soucasne) by uzivateli prepsalo
  // rozdelanou editaci uprostred vyplnovani.
  const byloOtevrene = useRef(false);
  if (isOpen !== byloOtevrene.current) {
    byloOtevrene.current = isOpen;
    if (isOpen) {
      setData(soucasne);
      setChyby({});
      setPotiz(null);
    }
  }

  const rozsahDnu = useMemo(() => getFrequencyDayRange(data.frequency), [data.frequency]);

  const zmeny = useMemo(() => {
    const out: Partial<NastaveniProfilu> = {};
    (Object.keys(data) as (keyof NastaveniProfilu)[]).forEach((k) => {
      if (!stejne(data[k], soucasne[k])) (out as any)[k] = data[k];
    });
    return out;
  }, [data, soucasne]);

  const meniPlan = useMemo(
    () => POLE_S_REGENERACI.some((k) => k in zmeny),
    [zmeny]
  );
  const jsouZmeny = Object.keys(zmeny).length > 0;

  if (!isOpen) return null;

  const zmen = <K extends keyof NastaveniProfilu>(klic: K, hodnota: NastaveniProfilu[K]) => {
    setData((p) => ({ ...p, [klic]: hodnota }));
    if (chyby[klic as string]) setChyby((p) => ({ ...p, [klic as string]: '' }));
    if (potiz) setPotiz(null);
  };

  const prepniDen = (den: number) => {
    const je = data.workout_days.includes(den);
    if (je) zmen('workout_days', data.workout_days.filter((d) => d !== den));
    else if (data.workout_days.length < rozsahDnu.max) {
      zmen('workout_days', [...data.workout_days, den].sort((a, b) => a - b));
    }
  };

  /** Stejná pravidla, jaká hlídá server — ať uživatel nedostane 400 po odeslání. */
  const zkontroluj = (): boolean => {
    const e: Record<string, string> = {};

    if (data.frequency) {
      const { min, max } = getFrequencyDayRange(data.frequency);
      const pocet = data.workout_days.length;
      if (pocet < min || pocet > max) {
        e.workout_days =
          min === max
            ? `Pro tuhle frekvenci vyber přesně ${min} tréninkových dní (teď ${pocet}).`
            : `Pro tuhle frekvenci vyber ${min}–${max} tréninkových dní (teď ${pocet}).`;
      }
    }

    if (data.training_environment === 'other' && !data.training_environment_detail.trim()) {
      e.training_environment_detail = 'Napiš, kde a s čím budeš cvičit.';
    }

    for (const [klic, popis] of [['goal_weight_kg', 'Cílová váha'], ['height_cm', 'Výška']] as const) {
      const raw = String(data[klic] || '').trim();
      if (!raw) continue;
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) e[klic] = `${popis} musí být číslo.`;
    }

    setChyby(e);
    return Object.keys(e).length === 0;
  };

  const odesli = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (uklada || !jsouZmeny) return;
    if (!zkontroluj()) return;

    setUklada(true);
    setPotiz(null);
    const vysledek = await onSave(zmeny);
    setUklada(false);

    if (vysledek.ok) {
      onClose();
      return;
    }

    // Castecne selhani: rekni konkretne, co proslo a co ne.
    if (vysledek.ulozeno.length > 0) {
      setPotiz(
        `Uložilo se: ${vysledek.ulozeno.join(', ')}. Neuložilo se: ${vysledek.neulozeno.join(', ')}.` +
          (vysledek.chyba ? ` (${vysledek.chyba})` : '')
      );
    } else {
      setPotiz(vysledek.chyba || 'Změny se nepodařilo uložit. Zkus to prosím znovu.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={uklada ? undefined : onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-2xl max-h-[92vh] bg-[#0c1017] rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(0,242,254,0.15)] flex flex-col overflow-hidden"
      >
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-[#00f2fe]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Nastavení profilu</h3>
              <p className="text-xs text-slate-400">Podle těchto údajů se sestavuje plán</p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={uklada}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-all disabled:opacity-50"
            aria-label="Zavřít"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={odesli} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          <Vyber popisek="Cíl" id="goal" hodnota={data.goal} volby={CIL}
            onZmena={(v) => zmen('goal', v)} />

          <Vyber popisek="Pohybová aktivita" id="activity" hodnota={data.activity} volby={AKTIVITA}
            onZmena={(v) => zmen('activity', v)} />

          <Vyber popisek="Míra stresu" id="stress_level" hodnota={data.stress_level} volby={STRES}
            onZmena={(v) => zmen('stress_level', v)} />

          <Vyber popisek="Typ práce" id="occupation" hodnota={data.occupation} volby={TYP_PRACE}
            onZmena={(v) => zmen('occupation', v)} />

          <Vyber popisek="Jak často chceš trénovat" id="frequency" hodnota={data.frequency} volby={FREKVENCE}
            onZmena={(v) => zmen('frequency', v)} />

          <div>
            <Popisek>Tréninkové dny</Popisek>
            {data.frequency && (
              <p className="text-[11px] text-slate-500 mb-2 -mt-0.5">
                Pro zvolenou frekvenci {rozsahDnu.min === rozsahDnu.max
                  ? `přesně ${rozsahDnu.min} dní`
                  : `${rozsahDnu.min}–${rozsahDnu.max} dní`}. Vybráno {data.workout_days.length}.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {DNY.map((d) => {
                const vybrano = data.workout_days.includes(d.hodnota);
                return (
                  <button
                    key={d.hodnota}
                    type="button"
                    aria-pressed={vybrano}
                    onClick={() => prepniDen(d.hodnota)}
                    className={`w-12 h-11 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                      vybrano
                        ? 'bg-cyan-500/15 border-cyan-500/60 text-slate-100'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <Chyba text={chyby.workout_days} />
          </div>

          <Vyber popisek="Stravovací preference" id="diet_type" hodnota={data.diet_type} volby={DIETA}
            onZmena={(v) => zmen('diet_type', v)} />

          <Pole id="dietary_restrictions" popisek="Alergie a omezení" volitelne
            value={data.dietary_restrictions} placeholder="např. ořechy, mořské plody"
            onChange={(e) => zmen('dietary_restrictions', e.target.value)} />

          <Pole id="foods_to_avoid" popisek="Co ti nechutná" volitelne
            value={data.foods_to_avoid} placeholder="např. květák, tvaroh"
            onChange={(e) => zmen('foods_to_avoid', e.target.value)} />

          <Vyber popisek="Kde budeš cvičit" id="training_environment" hodnota={data.training_environment}
            volby={TRAINING_ENVIRONMENT_OPTIONS as any}
            onZmena={(v) => zmen('training_environment', v)} />

          {data.training_environment === 'home_equipment' && (
            <Vicenasobny popisek="Vybavení, které máš" hodnoty={data.available_equipment}
              volby={EQUIPMENT_OPTIONS as any}
              onZmena={(v) => zmen('available_equipment', v)} />
          )}

          {data.training_environment === 'other' && (
            <Pole id="training_environment_detail" popisek="Popiš, kde a s čím cvičíš"
              value={data.training_environment_detail} chyba={chyby.training_environment_detail}
              onChange={(e) => zmen('training_environment_detail', e.target.value)} />
          )}

          <Vicenasobny popisek="Návyky, které chceš sledovat" hodnoty={data.selected_habits}
            volby={VOLBY_NAVYKU} volitelne
            napoveda="Odznačením návyk přestaneš sledovat; zapsané dny zůstanou."
            onZmena={(v) => zmen('selected_habits', v)} />

          {/* Jde jinam nez zbytek — /api/profile-settings, bez regenerace planu. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800">
            <div className="sm:col-span-2 pt-4 -mb-1">
              <p className="text-[11px] text-slate-500">
                Tyhle dva údaje plán nepřegenerují — uloží se rovnou.
              </p>
            </div>
            <Pole id="goal_weight_kg" popisek="Cílová váha (kg)" volitelne type="number" step="0.1"
              value={data.goal_weight_kg} chyba={chyby.goal_weight_kg}
              onChange={(e) => zmen('goal_weight_kg', e.target.value)} />
            <Pole id="height_cm" popisek="Výška (cm)" volitelne type="number" step="1"
              value={data.height_cm} chyba={chyby.height_cm}
              onChange={(e) => zmen('height_cm', e.target.value)} />
          </div>

          {meniPlan && (
            <div className="p-3.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-[#00f2fe] shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Po uložení se plán přegeneruje podle nových údajů a přijde ti e-mailem.
                Chvíli to trvá — nezavírej okno.
              </p>
            </div>
          )}

          {potiz && (
            <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/40 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-200 leading-relaxed">{potiz}</p>
            </div>
          )}
        </form>

        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500">
            {jsouZmeny ? 'Neuložené změny' : 'Beze změn'}
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={uklada}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 disabled:opacity-50"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={odesli}
              disabled={uklada || !jsouZmeny}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-[#00f2fe] to-[#39ff14] hover:opacity-95 shadow-[0_0_15px_rgba(0,242,254,0.3)] disabled:opacity-50"
            >
              {uklada && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{uklada ? (meniPlan ? 'Ukládám a generuji plán…' : 'Ukládám…') : 'Uložit'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
