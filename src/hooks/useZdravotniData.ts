import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { RadekRegenerace, RadekTreninku } from '../data/adapteryZdravi';

interface Zdravi {
  regenerace: RadekRegenerace[];
  treninky: RadekTreninku[];
  pripojeno: boolean;
  posledniSync: string | null;
  nacitam: boolean;
}

/**
 * Apple Health je volitelna integrace. Kdyz endpointy selzou nebo uzivatel
 * nema hodinky pripojene, vratime prazdno - sekce se pak vubec neukaze.
 * Chyba tady nesmi shodit cely profil.
 */
export function useZdravotniData(prihlasen: boolean): Zdravi {
  const [stav, setStav] = useState<Zdravi>({
    regenerace: [], treninky: [], pripojeno: false, posledniSync: null, nacitam: prihlasen
  });

  useEffect(() => {
    if (!prihlasen) return;
    let zive = true;

    Promise.allSettled([
      apiFetch<{ rows: RadekRegenerace[] }>('/api/health/recovery?days=30'),
      apiFetch<{ rows: RadekTreninku[] }>('/api/health/workouts?limit=10'),
      apiFetch<any>('/api/health/connection')
    ]).then(([reg, tre, con]) => {
      if (!zive) return;
      const spojeni = con.status === 'fulfilled' ? con.value?.active : null;
      setStav({
        regenerace: reg.status === 'fulfilled' ? (reg.value?.rows ?? []) : [],
        treninky: tre.status === 'fulfilled' ? (tre.value?.rows ?? []) : [],
        pripojeno: !!spojeni,
        posledniSync: spojeni?.last_sync_at ?? null,
        nacitam: false
      });
    });

    return () => { zive = false; };
  }, [prihlasen]);

  return stav;
}
