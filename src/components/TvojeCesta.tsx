import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Flame, Sparkles } from 'lucide-react';
import type { WeightRecord, WorkoutDay } from '../types';
import { useTed } from '../context/TedContext';
import { bodyNaPolyline, grafVahy, pripravenoRadky, serieDni, tydenSouhrn } from '../lib/tvojeCesta.ts';

/**
 * TVOJE CESTA — PROMPT_DNES_WOW.md bod D.
 *
 * Mini graf váhy za 30 dní s čárou cíle, série dní v řadě, souhrn týdne
 * a „Co pro tebe máme připravené". Všechno z dat, která appka už má; co se
 * z dat spočítat nedá (série pod dva dny, graf pod dvě vážení), se nekreslí
 * nebo dostane vlastní text s akcí — nikdy prázdná karta.
 */
interface Props {
  weightRecords: WeightRecord[];
  targetWeightKg: number;
  /** `completed_at` z `daily_activity_completions` (jídla i tréninky). */
  dokonceniISO: string[];
  treninky: WorkoutDay[];
  dnyJidel: { meals: { completed: boolean }[] }[];
  polozekNakupu: number;
  onOpenWeightModal: () => void;
}

const SIRKA = 300;
const VYSKA = 88;

const Pruh: React.FC<{ hotovo: number; celkem: number }> = ({ hotovo, celkem }) => {
  const bezPohybu = useReducedMotion();
  const podil = celkem > 0 ? Math.min(1, hotovo / celkem) : 0;
  return (
    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
      <motion.div
        className="h-full rounded-full bg-akcent-lime"
        initial={{ width: bezPohybu ? `${podil * 100}%` : '0%' }}
        animate={{ width: `${podil * 100}%` }}
        transition={{ duration: bezPohybu ? 0 : 0.4, ease: 'easeOut' }}
      />
    </div>
  );
};

const kg = (n: number) => n.toString().replace('.', ',');

export const TvojeCesta: React.FC<Props> = ({
  weightRecords,
  targetWeightKg,
  dokonceniISO,
  treninky,
  dnyJidel,
  polozekNakupu,
  onOpenWeightModal,
}) => {
  const bezPohybu = useReducedMotion();
  const { dostupny: tedDostupny } = useTed();

  const graf = grafVahy(weightRecords, targetWeightKg, new Date(), SIRKA, VYSKA);
  const serie = serieDni(dokonceniISO);
  const tyden = tydenSouhrn(treninky, dnyJidel);
  const pripraveno = pripravenoRadky({
    jidelNaTyden: tyden.jidelCelkem,
    treninkuNaTyden: tyden.treninkuCelkem,
    polozekNakupu,
    tedDostupny,
  });

  const prvni = graf?.body[0];
  const posledni = graf ? graf.body[graf.body.length - 1] : null;

  return (
    <section aria-label="Tvoje cesta" className="rounded-3xl border border-slate-800 bg-povrch p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Tvoje cesta</h2>
        {/* Série jen od dvou dní — jeden den v řadě není série. */}
        {serie >= 2 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/40 border border-amber-400/30 text-xs font-bold text-amber-200">
            <Flame className="w-3.5 h-3.5" aria-hidden="true" />
            {serie} {serie < 5 ? 'dny' : 'dní'} v řadě
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GRAF VÁHY */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 min-w-0">
          <p className="text-xs font-bold text-slate-400">Váha za posledních 30 dní</p>
          {graf && prvni && posledni ? (
            <>
              <svg
                viewBox={`0 0 ${SIRKA} ${VYSKA}`}
                className="mt-2 w-full h-auto"
                role="img"
                aria-label={`Graf váhy za 30 dní: z ${kg(prvni.kg)} kg na ${kg(posledni.kg)} kg${targetWeightKg > 0 ? `, cíl ${kg(targetWeightKg)} kg` : ''}.`}
              >
                {graf.cilY != null && (
                  <line
                    x1={0}
                    x2={SIRKA}
                    y1={graf.cilY}
                    y2={graf.cilY}
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    className="stroke-lime-400/60"
                  />
                )}
                <motion.polyline
                  points={bodyNaPolyline(graf.body)}
                  fill="none"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-akcent-cyan"
                  initial={{ pathLength: bezPohybu ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: bezPohybu ? 0 : 0.4, ease: 'easeOut' }}
                />
                <circle cx={posledni.x} cy={posledni.y} r={4} className="fill-akcent-cyan" />
              </svg>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>{kg(prvni.kg)} kg</span>
                {graf.cilY != null && <span className="text-lime-300/80">cíl {kg(targetWeightKg)} kg</span>}
                <span className="font-semibold text-slate-300">{kg(posledni.kg)} kg</span>
              </div>
            </>
          ) : (
            <div className="mt-2 rounded-xl border border-dashed border-slate-700 p-4 text-center">
              <p className="text-sm text-slate-300">
                Graf se objeví, jakmile budeš mít v posledních 30 dnech aspoň dvě vážení.
              </p>
              <button
                type="button"
                onClick={onOpenWeightModal}
                className="mt-3 min-h-10 px-4 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-500/40 hover:bg-cyan-900/60 transition-all"
              >
                Zapsat váhu
              </button>
            </div>
          )}
        </div>

        {/* TENTO TÝDEN */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 min-w-0">
          <p className="text-xs font-bold text-slate-400">Tento týden</p>
          {tyden.treninkuCelkem === 0 && tyden.jidelCelkem === 0 ? (
            <p className="mt-2 text-sm text-slate-300">Na tento týden zatím nemáš v plánu jídla ani tréninky.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-300">Odcvičeno</span>
                  <span className="font-bold text-white">
                    {tyden.treninkuHotovo} z {tyden.treninkuCelkem}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Pruh hotovo={tyden.treninkuHotovo} celkem={tyden.treninkuCelkem} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-300">Zapsáno jídel</span>
                  <span className="font-bold text-white">
                    {tyden.jidelZapsano} z {tyden.jidelCelkem}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Pruh hotovo={tyden.jidelZapsano} celkem={tyden.jidelCelkem} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CO PRO TEBE MÁME PŘIPRAVENÉ */}
      {pripraveno.length > 0 && (
        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/30 to-slate-900/40 p-4">
          <p className="text-xs font-bold text-cyan-300 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Co pro tebe máme připravené
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {pripraveno.map((radek) => (
              <li
                key={radek}
                className="px-3 py-1.5 rounded-full bg-slate-900/70 border border-slate-700 text-xs font-semibold text-slate-200"
              >
                {radek}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
