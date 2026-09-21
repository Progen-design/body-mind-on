import React from 'react';
import { Flame } from 'lucide-react';

interface Props {
  typ: string;
  nazev: string;
  kcal: number;
  odskrtnuto?: boolean;
}

/**
 * ZAROVNÁNÍ NÁZVŮ JÍDEL (PROMPT_UX_DNES.md bod B).
 *
 * Štítek a název stály ve flexu za sebou, takže název začínal pokaždé jinde —
 * „SNÍDANĚ" a „DOPOLEDNÍ SVAČINA" mají jinou šířku. Grid o třech sloupcích
 * (štítek pevná šířka / název 1fr / kcal auto, doprava) zarovná všechny
 * řádky na stejnou pozici. Na mobilu (pod `sm`) štítek sedí nad názvem —
 * dva řádky v jednom sloupci — a kcal zůstává vpravo přes oba řádky.
 *
 * Sdílené mezi „Dnešek" (DnesniPrehled) a „Tvůj další týden" (TrialPaywallCard) —
 * dřív měla jen druhá jmenovaná ten flex bug, ale obě places ukazují
 * stejný typ řádku a mají zarovnávat stejně.
 *
 * PROMPT_UX_DOLADENI.md bod A (21. 9. 2026) — na 390 px zbylo na název
 * s `truncate` jen ~90 px („Ovesná kaš…", „Kuře s rýži…"), nešlo přečíst,
 * co je k jídlu. Pod `sm` se název zalomí na dva řádky (`line-clamp-2`),
 * na desktopu zůstává jednořádkový `truncate` — tam je místa dost.
 */
export const RadekJidlaGrid: React.FC<Props> = ({ typ, nazev, kcal, odskrtnuto = false }) => (
  <div className="min-w-0 flex-1 grid grid-cols-[1fr_auto] sm:grid-cols-[6rem_1fr_auto] gap-x-3 gap-y-0.5 items-center">
    <span className="col-start-1 row-start-1 sm:col-start-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">
      {typ}
    </span>
    <span
      className={`col-start-1 row-start-2 sm:row-start-1 sm:col-start-2 text-sm font-bold leading-snug line-clamp-2 sm:truncate ${
        odskrtnuto ? 'line-through text-slate-500' : 'text-slate-200'
      }`}
    >
      {nazev}
    </span>
    <span className="col-start-2 row-start-1 row-span-2 sm:row-span-1 sm:col-start-3 justify-self-end whitespace-nowrap text-xs font-semibold text-amber-300 inline-flex items-center gap-1">
      <Flame className="w-3.5 h-3.5" />
      {kcal} kcal
    </span>
  </div>
);
