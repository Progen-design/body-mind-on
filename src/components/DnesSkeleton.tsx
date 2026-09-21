import React from 'react';

/**
 * KOSTRA ZÁLOŽKY DNES — PROMPT_DNES_WOW.md („Kvalita"). Stejné bloky a výšky
 * jako hotová obrazovka (hero s kroužky, karta TEDa, osa dne), ať se po
 * načtení layout nehne. Dokud dorazí `/api/profile`, ukazuje se tohle místo
 * točícího kolečka.
 */
const Blok: React.FC<{ className: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-2xl bg-slate-800/60 ${className}`} />
);

export const DnesSkeleton: React.FC = () => (
  <div role="status" aria-live="polite" aria-label="Načítám tvůj plán" className="space-y-4 sm:space-y-6">
    {/* Hero */}
    <div className="rounded-3xl border border-slate-800 bg-povrch p-5 sm:p-7">
      <Blok className="h-3 w-48" />
      <Blok className="mt-3 h-8 w-64 max-w-full" />
      <Blok className="mt-3 h-4 w-72 max-w-full" />
      <Blok className="mt-4 h-11 w-full sm:w-56" />
      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Blok className="h-[7.5rem]" />
        <Blok className="h-[7.5rem]" />
        <Blok className="h-[7.5rem]" />
      </div>
    </div>
    {/* TED */}
    <div className="rounded-3xl border border-slate-800 bg-povrch p-5">
      <div className="flex gap-3">
        <div className="w-11 h-11 rounded-full bg-slate-800/60 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <Blok className="h-3 w-32" />
          <Blok className="h-4 w-full" />
          <Blok className="h-4 w-2/3" />
        </div>
      </div>
    </div>
    {/* Osa dne */}
    <div className="rounded-3xl border border-slate-800 bg-povrch p-5 sm:p-6 space-y-2">
      <Blok className="h-6 w-40" />
      <Blok className="h-16 w-full" />
      <Blok className="h-16 w-full" />
      <Blok className="h-16 w-full" />
    </div>
    <span className="sr-only">Načítám tvůj plán…</span>
  </div>
);
