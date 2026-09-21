import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

/**
 * KROUŽEK POSTUPU (styl Apple Fitness) — vlastní SVG, žádná grafová knihovna.
 *
 * Plní se animací při načtení (≤ 400 ms). Kdo má v systému zapnuté „omezit
 * pohyb" (`prefers-reduced-motion`), dostane rovnou hotovou hodnotu bez
 * animace. Číslo pro čtečku obrazovky nese rodič v `aria-label` celého
 * tlačítka; samotné SVG je `aria-hidden`.
 */
interface Props {
  /** 0..1, mimo rozsah se ořízne. */
  podil: number;
  velikost?: number;
  tloustka?: number;
  /** Tailwind třída barvy tahu, např. `stroke-akcent-cyan`. */
  barva: string;
  children?: React.ReactNode;
}

export function omezPodil(podil: number): number {
  return Number.isFinite(podil) ? Math.max(0, Math.min(1, podil)) : 0;
}

export const ProgresniKruh: React.FC<Props> = ({ podil, velikost = 64, tloustka = 6, barva, children }) => {
  const bezPohybu = useReducedMotion();
  const p = omezPodil(podil);
  const r = (velikost - tloustka) / 2;
  const obvod = 2 * Math.PI * r;
  const stred = velikost / 2;

  return (
    <div className="relative shrink-0" style={{ width: velikost, height: velikost }}>
      <svg width={velikost} height={velikost} viewBox={`0 0 ${velikost} ${velikost}`} aria-hidden="true">
        <circle cx={stred} cy={stred} r={r} fill="none" strokeWidth={tloustka} className="stroke-slate-800" />
        <motion.circle
          cx={stred}
          cy={stred}
          r={r}
          fill="none"
          strokeWidth={tloustka}
          strokeLinecap="round"
          className={barva}
          strokeDasharray={obvod}
          initial={{ strokeDashoffset: bezPohybu ? obvod * (1 - p) : obvod }}
          animate={{ strokeDashoffset: obvod * (1 - p) }}
          transition={{ duration: bezPohybu ? 0 : 0.4, ease: 'easeOut' }}
          transform={`rotate(-90 ${stred} ${stred})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
};
