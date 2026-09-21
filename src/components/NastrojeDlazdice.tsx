import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * NÁSTROJE — kompaktní dlaždice, PROMPT_DNES_WOW.md bod E. Mřížka 2×2 na
 * mobilu, 4 v řadě na desktopu. Dlaždice má ikonu, název a jeden údaj;
 * panely (obsah sekcí) rozbaluje rodič pod mřížkou.
 */
export type NastrojId = 'nakup' | 'tyden' | 'zarizeni' | 'ucet';

export interface Dlazdice {
  id: NastrojId;
  ikona: React.ReactNode;
  nazev: string;
  udaj: string;
  /** Dlaždice rozbaluje panel pod mřížkou (`aria-expanded`). Bez toho otevírá modal. */
  rozbaluje: boolean;
  /** Nemá co otevřít (např. další týden, který ještě není). */
  neaktivni?: boolean;
}

interface Props {
  dlazdice: Dlazdice[];
  otevreny: NastrojId | null;
  onKlik: (id: NastrojId) => void;
}

export const NastrojeDlazdice: React.FC<Props> = ({ dlazdice, otevreny, onKlik }) => (
  <section aria-label="Nástroje">
    <h2 className="sr-only">Nástroje</h2>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {dlazdice.map((d) => {
        const otevrena = d.rozbaluje && otevreny === d.id;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onKlik(d.id)}
            disabled={d.neaktivni}
            aria-expanded={d.rozbaluje ? otevrena : undefined}
            className={`min-w-0 text-left rounded-2xl border p-3.5 sm:p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-60 disabled:cursor-default ${
              otevrena ? 'border-cyan-500/50 bg-slate-900' : 'border-slate-800 bg-povrch hover:border-cyan-500/30'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                {d.ikona}
              </span>
              {d.rozbaluje && !d.neaktivni && (
                <ChevronDown
                  className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${otevrena ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="mt-2.5 block text-sm font-bold text-slate-100 break-words">{d.nazev}</span>
            <span className="mt-0.5 block text-xs text-slate-400 break-words line-clamp-2">{d.udaj}</span>
          </button>
        );
      })}
    </div>
  </section>
);
