import React from 'react';

/**
 * SDÍLENÝ PRUH DNŮ (Po–Ne) — docs/DALSI_KROK.md 9.8.
 *
 * Vytaženo z `WorkoutSection` (tam byl zapsaný přímo), aby jídelníček dostal
 * STEJNÉ záložky dní jako trénink z jednoho kódu — dvě kopie by se rozešly
 * při první změně vzhledu, přesně jak se to stalo s formátem data v 9.4.
 * Markup je znak po znaku ten z tréninku: mřížka
 * `grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`, pulzující tečka na dnešku,
 * vybraný den `bg-cyan-950/30 border-cyan-500/50`, neklikací dlaždice
 * (Volno / den bez jídel) `bg-dlazdice-volno/70`.
 *
 * Komponenta je čistě prezentační: co je v dlaždici (60m vs. kcal dne),
 * rozhoduje volající přes `indikator` — 'splneno' kreslí limetkové ✓,
 * jiný řetězec se vypíše šedě, null nekreslí nic.
 */
export interface PolozkaPruhuDnu {
  /** Stabilní klíč dlaždice a hodnota pro `onVybrat` (dayName / datum). */
  klic: string;
  /** Po, Út, … (dayShort / zkratkaDne). */
  zkratka: string;
  /** Druhý řádek dlaždice: název tréninku / počet jídel. */
  nazev: string;
  jeDnes: boolean;
  /** Volno u tréninku, den bez jídel u jídelníčku — dlaždice není klikací. */
  jeNeklikaci: boolean;
  /** 'splneno' = limetkové ✓; jiný text (60m / kcal) šedě; null = nic. */
  indikator: 'splneno' | string | null;
}

interface PruhDnuProps {
  polozky: PolozkaPruhuDnu[];
  /** null = vybraný je den s `jeDnes` (stejný vzor jako selectedDayName). */
  vybranyKlic: string | null;
  onVybrat: (klic: string) => void;
}

export const PruhDnu: React.FC<PruhDnuProps> = ({ polozky, vybranyKlic, onVybrat }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
    {polozky.map(p => {
      const isSelected = p.klic === vybranyKlic || (!vybranyKlic && p.jeDnes);
      return (
        <button
          key={p.klic}
          type="button"
          disabled={p.jeNeklikaci}
          onClick={p.jeNeklikaci ? undefined : () => onVybrat(p.klic)}
          className={`p-2.5 rounded-xl border text-left transition-all relative select-none ${
            p.jeNeklikaci
              ? 'bg-dlazdice-volno/70 border-slate-800/60 cursor-default'
              : isSelected
                ? 'bg-cyan-950/30 border-cyan-500/50'
                : 'bg-karta/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          {p.jeDnes && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-akcent-cyan animate-ping" />
          )}

          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-bold ${p.jeNeklikaci ? 'text-slate-500' : 'text-slate-300'}`}>
              {p.zkratka}
            </span>
            {p.indikator !== null && (
              p.indikator === 'splneno' ? (
                <span className="text-[10px] font-bold text-akcent-lime">✓</span>
              ) : (
                <span className="text-[10px] text-slate-500 font-medium">{p.indikator}</span>
              )
            )}
          </div>

          <div className={`text-xs font-semibold truncate mt-1 ${p.jeNeklikaci ? 'text-slate-500' : 'text-white'}`}>
            {p.nazev}
          </div>
        </button>
      );
    })}
  </div>
);
