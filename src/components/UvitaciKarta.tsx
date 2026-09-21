import React from 'react';
import { motion } from 'motion/react';
import { Check, PartyPopper } from 'lucide-react';

/**
 * UVÍTACÍ KARTA PRVNÍCH DVOU DNŮ — PROMPT_DNES_WOW.md („První přihlášení").
 *
 * Řádky jsou reálné počty z plánu (`pripravenoRadky`), ne slib. Zavření
 * řeší rodič (`src/lib/uvitani.ts`, pamatuje se v localStorage).
 */
interface Props {
  radky: string[];
  onPrvniJidlo: () => void;
  onZavrit: () => void;
}

export const UvitaciKarta: React.FC<Props> = ({ radky, onPrvniJidlo, onZavrit }) => (
  <motion.section
    aria-label="Tvůj plán je připravený"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    className="rounded-3xl border border-lime-400/30 bg-gradient-to-br from-lime-950/30 to-slate-900/60 p-5 sm:p-6"
  >
    <h2 className="text-lg sm:text-xl font-extrabold text-white inline-flex items-center gap-2">
      <PartyPopper className="w-5 h-5 text-akcent-lime shrink-0" aria-hidden="true" />
      Tvůj plán je připravený
    </h2>
    {radky.length > 0 && (
      <ul className="mt-3 space-y-1.5">
        {radky.map((radek) => (
          <li key={radek} className="flex items-start gap-2 text-sm text-slate-200">
            <Check className="w-4 h-4 mt-0.5 text-akcent-lime shrink-0 stroke-[3]" aria-hidden="true" />
            <span className="break-words">{radek}</span>
          </li>
        ))}
      </ul>
    )}
    <div className="mt-4 flex flex-col sm:flex-row gap-2">
      <button
        type="button"
        onClick={onPrvniJidlo}
        className="min-h-11 px-5 rounded-xl text-sm font-bold text-slate-950 bg-akcent-lime hover:brightness-110 transition-all active:scale-[0.98]"
      >
        Ukaž mi první jídlo
      </button>
      <button
        type="button"
        onClick={onZavrit}
        className="min-h-11 px-5 rounded-xl text-sm font-bold text-slate-300 border border-slate-700 hover:border-slate-500 transition-all"
      >
        Rozumím
      </button>
    </div>
  </motion.section>
);
