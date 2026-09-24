import { useCallback, useEffect, useState } from 'react';
import { isValidEmailFormat } from '@lib/registration/registrationStepValidation.js';
import { fetchRegistrationEmailAvailable } from '@lib/registration/checkEmailAvailableClient.js';
import { stavZVysledku, vytvorKontroluEmailu } from '@lib/registration/kontrolaEmailu.js';

export type StavEmailu = 'necinny' | 'overuji' | 'volny' | 'obsazeny' | 'nelze';

/**
 * Overi dostupnost e-mailu uz pri psani, ne az pri odeslani kroku.
 *
 * Kontroluje se az kdyz ma e-mail platny tvar - jinak by se na kazde pismeno
 * volalo API s nesmyslem. Prodleva 600 ms tlumi psani.
 *
 * PORADI ODPOVEDI (24. 9. 2026): psani i klik na „Dal" (`overHned`) jdou
 * pres JEDNU kontrolu z lib/registration/kontrolaEmailu.js. Kazdy novy dotaz
 * zrusi predchozi (AbortController) a odpoved na starsi dotaz se zahodi —
 * driv mel „Dal" vlastni dotaz bez ochrany a pozdni odpoved na stary e-mail
 * zapsala „uz je registrovany" vedle „E-mail je volny" pro novy.
 */
export function useKontrolaEmailu(email: string): {
  stav: StavEmailu;
  /** Overi hned (klik na „Dal"). null = mezitim prisel novejsi dotaz. */
  overHned: (hodnota: string) => Promise<StavEmailu | null>;
} {
  const [stav, setStav] = useState<StavEmailu>('necinny');
  const [kontrola] = useState(() => vytvorKontroluEmailu(fetchRegistrationEmailAvailable));

  useEffect(() => {
    const hodnota = String(email || '').trim();
    // E-mail se zmenil: bezici dotaz na predchozi hodnotu hned zrusit, ne az
    // za 600 ms, kdy odejde novy.
    kontrola.zrus();

    if (!hodnota || !isValidEmailFormat(hodnota)) {
      setStav('necinny');
      return undefined;
    }

    setStav('overuji');
    const casovac = setTimeout(async () => {
      const vysledek = await kontrola.over(hodnota);
      if (vysledek) setStav(stavZVysledku(vysledek));
    }, 600);

    return () => clearTimeout(casovac);
  }, [email, kontrola]);

  const overHned = useCallback(async (hodnota: string) => {
    setStav('overuji');
    const vysledek = await kontrola.over(String(hodnota || '').trim());
    if (!vysledek) return null;
    const novy = stavZVysledku(vysledek);
    setStav(novy);
    return novy;
  }, [kontrola]);

  return { stav, overHned };
}
