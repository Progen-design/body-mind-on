/**
 * AVATAR — obrázek, nebo iniciály. Nikdy rozbitý `<img>`.
 *
 * Chyba, kterou to opravuje: čtyři místa v aplikaci renderovala
 * `<img src={account.avatarUrl}>` s prázdným `avatarUrl`. Prohlížeč to
 * vyhodnotí jako rozbitý obrázek a ukáže alt text — v hlavičce profilu tedy
 * svítilo „Jan Přikopa" místo fotky. Změřeno v produkci 25. 8. 2026: avatar
 * nemá ani jeden ze čtyř účtů, takže to viděl každý.
 *
 * Komponenta kreslí obrázek JEN když je opravdu z čeho. Jinak iniciály.
 * A když se obrázek nenačte (mrtvý odkaz, offline, blokovaný CDN), přepne
 * se na iniciály taky — `onError` je jediný způsob, jak se to dá poznat.
 */
import React, { useEffect, useState } from 'react';

import { inicialy } from '../lib/inicialy';

interface AvatarProps {
  /** Jméno, ze kterého se berou iniciály. Slouží i jako `alt` obrázku. */
  jmeno: string;
  /** Adresa fotky. Prázdná hodnota znamená „žádná fotka není". */
  src?: string | null;
  /** Rozměr, tvar a pozadí rámečku. Obrázek i iniciály ho vyplní celý. */
  className?: string;
  /** Velikost písma iniciál — liší se podle rozměru rámečku. */
  textClassName?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  jmeno,
  src,
  className = '',
  textClassName = 'text-sm',
}) => {
  const adresa = String(src ?? '').trim();
  const [nenacetlSe, setNenacetlSe] = useState(false);

  // Nová adresa si zaslouží nový pokus. Bez tohohle by účet, kterému se
  // jednou nenačetla fotka, zůstal u iniciál i po jejím nahrazení.
  useEffect(() => {
    setNenacetlSe(false);
  }, [adresa]);

  const zkratka = inicialy(jmeno);

  if (adresa && !nenacetlSe) {
    return (
      <img
        src={adresa}
        alt={jmeno}
        referrerPolicy="no-referrer"
        onError={() => setNenacetlSe(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center select-none ${className}`}
      // Iniciály jsou dekorace jména, které je vedle nich napsané. Screen
      // readeru by je četl podruhé, proto `aria-hidden` a `title` pro myš.
      aria-hidden="true"
      title={jmeno}
    >
      <span className={`font-bold tracking-tight text-slate-200 ${textClassName}`}>
        {/* Účet bez použitelného jména existovat může (samá čísla, prázdno).
            Neutrální značka je pořád lepší než prázdné kolečko. */}
        {zkratka || '?'}
      </span>
    </div>
  );
};
