import React from 'react';
import { Check } from 'lucide-react';

export const POLE_TRIDY =
  'w-full px-4 py-3 rounded-2xl bg-slate-900/70 border text-sm text-slate-100 ' +
  'placeholder:text-slate-600 outline-none transition-colors';

export const Popisek: React.FC<{ htmlFor?: string; children: React.ReactNode; volitelne?: boolean }> = ({
  htmlFor,
  children,
  volitelne
}) => (
  <label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
    {children}
    {volitelne && <span className="ml-1.5 normal-case tracking-normal text-slate-600">(volitelné)</span>}
  </label>
);

export const Chyba: React.FC<{ text?: string | null }> = ({ text }) =>
  text ? (
    <p role="alert" className="mt-1.5 text-[11px] text-rose-400">
      {text}
    </p>
  ) : null;

interface PoleProps extends React.InputHTMLAttributes<HTMLInputElement> {
  popisek: string;
  chyba?: string | null;
  volitelne?: boolean;
}

export const Pole: React.FC<PoleProps> = ({ popisek, chyba, volitelne, id, ...rest }) => (
  <div>
    <Popisek htmlFor={id} volitelne={volitelne}>{popisek}</Popisek>
    <input
      id={id}
      {...rest}
      className={`${POLE_TRIDY} ${chyba ? 'border-rose-500/60' : 'border-slate-800 focus:border-cyan-500/60'}`}
    />
    <Chyba text={chyba} />
  </div>
);

export interface Volba {
  value: string;
  label: string;
}

interface VyberProps {
  popisek: string;
  id: string;
  hodnota: string;
  volby: readonly Volba[];
  chyba?: string | null;
  volitelne?: boolean;
  zakazano?: boolean;
  onZmena: (v: string) => void;
}

/** Vyber jedne moznosti dlazdicemi - na mobilu se ovlada lip nez select. */
export const Vyber: React.FC<VyberProps> = ({
  popisek, id, hodnota, volby, chyba, volitelne, zakazano, onZmena
}) => (
  <div>
    <Popisek volitelne={volitelne}>{popisek}</Popisek>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={popisek}>
      {volby.map((v) => {
        const vybrano = hodnota === v.value;
        return (
          <button
            key={v.value || 'prazdna'}
            type="button"
            role="radio"
            aria-checked={vybrano}
            disabled={zakazano}
            onClick={() => onZmena(v.value)}
            className={`px-4 py-3 rounded-2xl border text-sm text-left transition-all active:scale-[0.99] disabled:opacity-50 ${
              vybrano
                ? 'bg-cyan-500/15 border-cyan-500/60 text-slate-100 font-semibold'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {vybrano && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
              {v.label}
            </span>
          </button>
        );
      })}
    </div>
    <Chyba text={chyba} />
  </div>
);

interface VicenasobnyProps {
  popisek: string;
  hodnoty: string[];
  volby: readonly Volba[];
  napoveda?: string;
  volitelne?: boolean;
  onZmena: (v: string[]) => void;
}

/** Vyber vice moznosti (vybaveni, navyky). */
export const Vicenasobny: React.FC<VicenasobnyProps> = ({
  popisek, hodnoty, volby, napoveda, volitelne, onZmena
}) => (
  <div>
    <Popisek volitelne={volitelne}>{popisek}</Popisek>
    {napoveda && <p className="text-[11px] text-slate-500 mb-2 -mt-0.5">{napoveda}</p>}
    <div className="flex flex-wrap gap-2">
      {volby.map((v) => {
        const vybrano = hodnoty.includes(v.value);
        return (
          <button
            key={v.value}
            type="button"
            aria-pressed={vybrano}
            onClick={() =>
              onZmena(vybrano ? hodnoty.filter((h) => h !== v.value) : [...hodnoty, v.value])
            }
            className={`px-3.5 py-2 rounded-xl border text-xs transition-all active:scale-[0.99] ${
              vybrano
                ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200 font-semibold'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  </div>
);

/** Ukazatel postupu registrace. */
export const Krokovac: React.FC<{ krok: number; celkem: number; nazev: string }> = ({ krok, celkem, nazev }) => (
  <div className="mb-6">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Krok {krok} z {celkem}
      </span>
      <span className="text-[11px] text-slate-400">{nazev}</span>
    </div>
    <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-[#39ff14] transition-all duration-300"
        style={{ width: `${(krok / celkem) * 100}%` }}
      />
    </div>
  </div>
);
