import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { najdiPojem } from '../../lib/glosar.js';

interface VysvetlivkaProps {
  /** id pojmu z lib/glosar.js. Neznámé id otazník nezobrazí. */
  pojem: string;
}

/**
 * Otazník u pojmu. Po kliknutí ukáže krátké vysvětlení z lib/glosar.js.
 *
 * Žádné AI, žádné volání na server — statický text, okamžitá odpověď.
 * Nahrazuje to, co měl obstarat předstíraný chat s TEDem.
 */
export const Vysvetlivka: React.FC<VysvetlivkaProps> = ({ pojem }) => {
  const [otevreno, setOtevreno] = useState(false);
  const obal = useRef<HTMLSpanElement>(null);

  const zaznam = najdiPojem(pojem);

  useEffect(() => {
    if (!otevreno) return;

    const naKlik = (e: MouseEvent) => {
      if (!obal.current?.contains(e.target as Node)) setOtevreno(false);
    };
    const naKlavesu = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOtevreno(false);
    };

    document.addEventListener('mousedown', naKlik);
    document.addEventListener('keydown', naKlavesu);
    return () => {
      document.removeEventListener('mousedown', naKlik);
      document.removeEventListener('keydown', naKlavesu);
    };
  }, [otevreno]);

  // Neznámý pojem radši neoznačíme vůbec, než abychom otevřeli prázdno.
  if (!zaznam) return null;

  return (
    <span ref={obal} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOtevreno((p) => !p);
        }}
        aria-expanded={otevreno}
        aria-label={`Co znamená ${zaznam.pojem}?`}
        className="p-0.5 rounded-full text-slate-500 hover:text-cyan-300 transition-colors align-middle"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {otevreno && (
          <motion.span
            role="dialog"
            aria-label={zaznam.pojem}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full mt-1.5 z-50 w-64 sm:w-72 p-3.5 rounded-2xl bg-[#0c1017] border border-cyan-500/30 shadow-[0_8px_30px_rgba(0,0,0,0.7)] text-left cursor-default"
          >
            <span className="flex items-start justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-white leading-snug">{zaznam.pojem}</span>
              <button
                type="button"
                onClick={() => setOtevreno(false)}
                aria-label="Zavřít vysvětlivku"
                className="p-0.5 -mt-0.5 rounded text-slate-500 hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
            <span className="block text-[11px] text-slate-300 leading-relaxed normal-case tracking-normal font-normal">
              {zaznam.vysvetleni}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};
