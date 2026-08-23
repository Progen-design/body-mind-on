import React from 'react';

/**
 * NADPIS SEKCE — jediný nadpis v celém profilu.
 *
 * PROČ. Nadpisy sekcí byly `text-sm uppercase text-slate-400`, tedy tišší než
 * text pod nimi. Mezi barevnými kartami se ztrácely a profil působil jako
 * jedna dlouhá plocha buněk bez členění. Zpětná vazba od kolegy doslova:
 * „chtěl bych nadpisy daných sekcí více viditelné a větší… působí lehce
 * nepřehledně… hodně barevnejch buněk".
 *
 * PRAVIDLA
 * - Nadpis je vždy plná barva textu, ne `slate-400`. Ztlumený nadpis je
 *   protimluv: buď je to nadpis, nebo popisek.
 * - Pod nadpisem je oddělovací linka. Ta dělá to členění, ne barva karty.
 * - Barvu nese jen ikona, a jen když sekce nějakou má. Nadpis sám nebarvíme —
 *   od toho jsou karty.
 * - `uroven` řídí velikost, ne význam: `sekce` je hlavička celé záložky,
 *   `podsekce` blok uvnitř ní.
 */
interface NadpisSekceProps {
  titulek: string;
  podtitulek?: string;
  ikona?: React.ReactNode;
  uroven?: 'sekce' | 'podsekce';
  /** Volitelný prvek vpravo — tlačítko, štítek, přepínač. */
  akce?: React.ReactNode;
}

export const NadpisSekce: React.FC<NadpisSekceProps> = ({
  titulek,
  podtitulek,
  ikona,
  uroven = 'sekce',
  akce
}) => {
  const jeSekce = uroven === 'sekce';

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b ${
        jeSekce ? 'border-slate-700/80 pb-3 mb-1' : 'border-slate-800/80 pb-2.5 mb-1'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {ikona && (
          <span
            className={`shrink-0 flex items-center justify-center rounded-xl border border-slate-700/70 bg-slate-900/70 ${
              jeSekce ? 'w-10 h-10' : 'w-8 h-8'
            }`}
          >
            {ikona}
          </span>
        )}
        <div className="min-w-0">
          {jeSekce ? (
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">
              {titulek}
            </h2>
          ) : (
            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
              {titulek}
            </h3>
          )}
          {podtitulek && (
            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{podtitulek}</p>
          )}
        </div>
      </div>

      {akce && <div className="shrink-0 flex items-center gap-2">{akce}</div>}
    </div>
  );
};
