import React, { useState } from 'react';
import { Lock, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import type { ZamcenyPlan, MealItem } from '../types';
import { RadekJidlaGrid } from './RadekJidlaGrid';

interface TrialPaywallCardProps {
  plan: ZamcenyPlan | null;
  onSelectRecipe: (meal: MealItem) => void;
}

function formatDatum(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * TVŮJ DALŠÍ TÝDEN — sbalená ukázka, bez cen (PROMPT_UX_DNES.md bod A.6).
 *
 * Do 18. 9. 2026 karta nesla i ceny a checkout tlačítka — sedělo to
 * uprostřed „Dnes", mezi dnešním souhrnem a dnešním jídelníčkem, takže
 * budoucnost přerušovala přítomnost. Ceny a checkout se přestěhovaly do
 * `PredplatneNabidka` (Účet a předplatné + úzký countdown pruh); tahle
 * karta zůstává sbalená — jen datum, počet jídel a věta, že se odemkne
 * s členstvím — a rozbalí se na klik na ukázku jídel.
 *
 * Jídla jdou rozkliknout do detailu receptu stejně jako dnešní (bod B) —
 * `plan.jidlaPrvnihoDne` nese kompletní `MealItem` (adaptery.ts), ne jen
 * typ/název/kcal.
 */
export const TrialPaywallCard: React.FC<TrialPaywallCardProps> = ({ plan, onSelectRecipe }) => {
  const [rozbaleno, setRozbaleno] = useState(false);

  if (!plan || !plan.zamceno) return null;

  const od = formatDatum(plan.validFrom);
  const doKdy = formatDatum(plan.validUntil);
  const jidla = plan.jidlaPrvnihoDne ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-karta/90 backdrop-blur-xl border border-amber-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <button
        type="button"
        onClick={() => setRozbaleno((v) => !v)}
        aria-expanded={rozbaleno}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-amber-950/60 border border-amber-400/40 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-white">Tvůj další týden je připravený</h3>
            <p className="text-sm text-slate-400">
              {od && doKdy ? `${od} – ${doKdy}` : 'Nový jídelníček'}
              {jidla.length > 0 ? ` · ${jidla.length} ${jidla.length === 1 ? 'jídlo' : jidla.length < 5 ? 'jídla' : 'jídel'}` : ''}
              {' · '}Odemkne se s členstvím
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${rozbaleno ? 'rotate-180' : ''}`}
        />
      </button>

      {rozbaleno && jidla.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {jidla.map((jidlo) => (
            <li key={jidlo.id}>
              <button
                type="button"
                onClick={() => onSelectRecipe(jidlo)}
                className="w-full flex items-center rounded-xl px-3 py-2.5 bg-slate-900/60 border border-slate-800 hover:border-amber-400/40 transition-all text-left"
              >
                <RadekJidlaGrid typ={jidlo.type} nazev={jidlo.title} kcal={jidlo.calories} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
};
