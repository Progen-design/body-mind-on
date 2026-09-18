import React from 'react';
import { ShoppingBag, ChevronRight } from 'lucide-react';

interface Props {
  pocetPolozek: number;
  onOpen: () => void;
}

/**
 * NÁKUPNÍ SEZNAM NA DNES — JEDNOŘÁDKOVÝ VSTUP (PROMPT_UX_DNES.md bod A.5).
 *
 * Dřív byl blok součástí jídelníčkové karty na Dnes (OverviewBentoGrid) —
 * po sloučení té karty s DnesniPrehled dostal seznam vlastní, jasně menší
 * místo v novém pořadí sekcí, ne další podnadpis uvnitř „Dnešku".
 */
export const NakupniSeznamVstup: React.FC<Props> = ({ pocetPolozek, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-povrch border border-slate-800 hover:border-cyan-500/30 transition-all"
  >
    <span className="flex items-center gap-2.5 text-sm font-bold text-slate-200">
      <ShoppingBag className="w-4 h-4 text-cyan-400" />
      Nákupní seznam
    </span>
    <span className="flex items-center gap-1.5 text-sm text-slate-400">
      {pocetPolozek > 0 ? `${pocetPolozek} ${pocetPolozek === 1 ? 'položka' : pocetPolozek < 5 ? 'položky' : 'položek'}` : 'Zatím prázdný'}
      <ChevronRight className="w-4 h-4" />
    </span>
  </button>
);
