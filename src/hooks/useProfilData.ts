import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { ProfilOdpoved } from '../data/adaptery';

interface Stav {
  data: ProfilOdpoved | null;
  nacitam: boolean;
  chyba: string | null;
  znovu: () => void;
}

/**
 * Jeden dotaz na /api/profile misto deviti. Endpoint uz vraci profil,
 * metriky, plan, treninky i navyky v jedne odpovedi.
 */
export function useProfilData(prihlasen: boolean): Stav {
  const [data, setData] = useState<ProfilOdpoved | null>(null);
  const [nacitam, setNacitam] = useState(prihlasen);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pokus, setPokus] = useState(0);

  const znovu = useCallback(() => setPokus((p) => p + 1), []);

  useEffect(() => {
    if (!prihlasen) {
      setData(null);
      setNacitam(false);
      return;
    }
    let zive = true;
    setNacitam(true);
    setChyba(null);

    apiFetch<ProfilOdpoved>('/api/profile')
      .then((d) => { if (zive) { setData(d); setNacitam(false); } })
      .catch((e: Error) => {
        if (!zive) return;
        setChyba(e.message || 'Profil se nepodařilo načíst.');
        setNacitam(false);
      });

    return () => { zive = false; };
  }, [prihlasen, pokus]);

  return { data, nacitam, chyba, znovu };
}
