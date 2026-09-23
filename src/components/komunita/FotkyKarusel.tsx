import React, { useState } from 'react';
import { KomunitaFotka } from './typy';

/**
 * FOTKY PŘES CELOU ŠÍŘKU, 4:5, U VÍCE FOTEK SWIPE DO STRANY.
 *
 * Posun řeší nativní scroll-snap — žádná knihovna, na mobilu se chová jako
 * jakákoli jiná galerie a nepere se se svislým scrollem feedu. Tečky jen
 * ukazují, kde člověk je.
 */
interface Props {
  fotky: KomunitaFotka[];
  /** Klepnutí na fotku (feed → detail, detail → přes celou obrazovku). */
  onKlik: (fotka: KomunitaFotka) => void;
}

export const FotkyKarusel: React.FC<Props> = ({ fotky, onKlik }) => {
  const [aktivni, setAktivni] = useState(0);
  if (fotky.length === 0) return null;

  return (
    <div className="relative">
      <div
        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAktivni(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
        }}
      >
        {fotky.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onKlik(f)}
            className="w-full shrink-0 snap-center aspect-[4/5] bg-slate-950"
          >
            <img
              src={f.url}
              alt={`Fotka ${i + 1} z ${fotky.length}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {fotky.length > 1 && (
        <div className="absolute bottom-2.5 inset-x-0 flex justify-center gap-1.5 pointer-events-none" aria-hidden="true">
          {fotky.map((f, i) => (
            <span
              key={f.id}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === aktivni ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
