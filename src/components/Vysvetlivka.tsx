import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { najdiPojem } from '../../lib/glosar.js';
import { useTed } from '../context/TedContext';

interface VysvetlivkaProps {
  /** id pojmu z lib/glosar.js. Neznámé id otazník nezobrazí. */
  pojem: string;
  /** Naměřená hodnota u toho pojmu, pokud ji karta zná. Jde do dotazu TEDovi. */
  hodnota?: string;
}

/**
 * Otazník u pojmu. Po kliknutí ukáže krátké vysvětlení z lib/glosar.js.
 *
 * DVĚ ÚROVNĚ, ZÁMĚRNĚ. Text z glosáře je statický, okamžitý a stejný pro
 * všechny — odpovídá na „co ten údaj je". Pod ním je odkaz na TEDa, který
 * odpovídá na „co to znamená u MĚ", a k tomu potřebuje profil a chvíli času.
 * Kdyby se hned otevíral chat, platil by uživatel čekáním a tokeny i za
 * otázku, na kterou umí odpovědět jedna věta.
 */
export const Vysvetlivka: React.FC<VysvetlivkaProps> = ({ pojem, hodnota }) => {
  const [otevreno, setOtevreno] = useState(false);
  const obal = useRef<HTMLSpanElement>(null);
  const ted = useTed();

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

            {/* Druhá úroveň: co to znamená u mě. Glosář to říct nemůže —
                nezná uživatelova data. */}
            {ted.dostupny && (
              <button
                type="button"
                onClick={() => {
                  setOtevreno(false);
                  ted.zeptejSe({ typ: 'pojem', klic: pojem, popis: zaznam.pojem, hodnota });
                }}
                className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-[#00f2fe] bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/30 hover:border-cyan-400/60 transition-all normal-case tracking-normal"
              >
                <Sparkles className="w-3 h-3" />
                <span>Co to znamená u mě?</span>
              </button>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};
