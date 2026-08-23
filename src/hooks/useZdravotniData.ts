import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { RadekMetriky, RadekRegenerace, RadekSpanku, RadekTreninku } from '../data/adapteryZdravi';

interface Zdravi {
  regenerace: RadekRegenerace[];
  treninky: RadekTreninku[];
  /** Všech 31 metrik, které hodinky posílají. Profil dřív ukazoval 7. */
  metriky: RadekMetriky[];
  spanek: RadekSpanku[];
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
    regenerace: [], treninky: [], metriky: [], spanek: [],
    pripojeno: false, posledniSync: null, nacitam: prihlasen
  });

  useEffect(() => {
    if (!prihlasen) return;
    let zive = true;

    // Vsech pet volani bezi soubezne. Kazde muze selhat samostatne — chybejici
    // metriky nesmi shodit regeneraci a naopak.
    Promise.allSettled([
      apiFetch<{ rows: RadekRegenerace[] }>('/api/health/recovery?days=30'),
      apiFetch<{ rows: RadekTreninku[] }>('/api/health/workouts?limit=10'),
      apiFetch<any>('/api/health/connection'),
      apiFetch<{ rows: RadekMetriky[] }>('/api/health/metrics?days=30'),
      apiFetch<{ rows: RadekSpanku[] }>('/api/health/sleep?days=30')
    ]).then(([reg, tre, con, met, spa]) => {
      if (!zive) return;
      const spojeni = con.status === 'fulfilled' ? con.value?.active : null;
      setStav({
        regenerace: reg.status === 'fulfilled' ? (reg.value?.rows ?? []) : [],
        treninky: tre.status === 'fulfilled' ? (tre.value?.rows ?? []) : [],
        metriky: met.status === 'fulfilled' ? (met.value?.rows ?? []) : [],
        spanek: spa.status === 'fulfilled' ? (spa.value?.rows ?? []) : [],
        pripojeno: !!spojeni,
        posledniSync: spojeni?.last_sync_at ?? null,
        nacitam: false
      });
    });

    return () => { zive = false; };
  }, [prihlasen]);

  return stav;
}
