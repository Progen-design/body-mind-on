import React from 'react';
import { Lock, PenLine } from 'lucide-react';

/**
 * KDO SMÍ V KOMUNITĚ CO — jen zobrazení. Rozhoduje server
 * (lib/membershipHelpers.js → pravaKomunity, api/community/*):
 *   - bez aktivního členství → GET vrátí 403 → ZamcenaKomunita
 *   - START → `muze_psat: false` → feed jen ke čtení + ListaOnClub
 *   - ON CLUB (a tým) → píše
 */

const TEXT_PSANI_ON_CLUB = 'Psát můžeš v ON CLUBU';

/**
 * Lišta místo „+" a pole pro komentář. CTA vede do Účet a předplatné: kdo
 * předplatné ještě nemá, odemkne ON CLUB Checkoutem; kdo ho má, přejde
 * tlačítkem „Přejít na ON CLUB" (change-tier) — nový Checkout by vrátil 409.
 */
export const ListaOnClub: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`p-3 rounded-2xl bg-slate-900/90 border border-lime-500/30 ${className}`}>
      <div className="flex items-center gap-2.5">
        <PenLine className="w-4 h-4 text-akcent-lime shrink-0" aria-hidden="true" />
        <p className="flex-1 text-[13px] leading-snug text-slate-200">
          <strong className="text-white">{TEXT_PSANI_ON_CLUB}</strong>
          <span className="text-slate-400"> — ve STARTu komunitu čteš.</span>
        </p>
        <a
          href="/profil?predplatne=1"
          className="shrink-0 min-h-9 px-3 inline-flex items-center rounded-xl text-xs font-bold text-slate-950 bg-akcent-lime"
        >
          Přejít na ON CLUB
        </a>
      </div>
    </div>
  );
};

/** Prošlý trial / zrušené předplatné: komunita zamčená, odkaz na odemknutí. */
export const ZamcenaKomunita: React.FC = () => (
  <div className="p-6 rounded-3xl bg-karta/90 border border-amber-400/30 text-center space-y-3">
    <div className="mx-auto w-11 h-11 rounded-2xl bg-amber-950/60 border border-amber-400/40 flex items-center justify-center">
      <Lock className="w-5 h-5 text-amber-300" aria-hidden="true" />
    </div>
    <p className="text-sm font-bold text-white">Komunita je dostupná s aktivním předplatným.</p>
    <p className="text-xs text-slate-400">Tvoje příspěvky zůstaly — po odemknutí je uvidíš zase.</p>
    <a
      href="/profil?predplatne=1"
      className="inline-flex min-h-11 px-5 items-center rounded-xl text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300"
    >
      Odemknout předplatné
    </a>
  </div>
);
