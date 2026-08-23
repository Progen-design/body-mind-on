import { useEffect, useRef, useState } from 'react';
import { isValidEmailFormat } from '@lib/registration/registrationStepValidation.js';
import { fetchRegistrationEmailAvailable } from '@lib/registration/checkEmailAvailableClient.js';

export type StavEmailu = 'necinny' | 'overuji' | 'volny' | 'obsazeny' | 'nelze';

/**
 * Overi dostupnost e-mailu uz pri psani, ne az pri odeslani kroku.
 *
 * Kontroluje se az kdyz ma e-mail platny tvar - jinak by se na kazde pismeno
 * volalo API s nesmyslem. Prodleva 600 ms tlumi psani; odpovedi na starsi
 * dotaz se zahazuji, aby pomalejsi odpoved neprepsala novejsi vysledek.
 */
export function useKontrolaEmailu(email: string): StavEmailu {
  const [stav, setStav] = useState<StavEmailu>('necinny');
  const posledniDotaz = useRef(0);

  useEffect(() => {
    const hodnota = String(email || '').trim();

    if (!hodnota || !isValidEmailFormat(hodnota)) {
      setStav('necinny');
      return;
    }

    const cislo = ++posledniDotaz.current;
    setStav('overuji');

    const casovac = setTimeout(async () => {
      const vysledek = await fetchRegistrationEmailAvailable(hodnota);
      // Mezitim uzivatel napsal neco jineho - tenhle vysledek uz neplati.
      if (cislo !== posledniDotaz.current) return;

      if (vysledek.networkError || vysledek.rateLimited) setStav('nelze');
      else setStav(vysledek.available ? 'volny' : 'obsazeny');
    }, 600);

    return () => clearTimeout(casovac);
  }, [email]);

  return stav;
}
