// Časová osa dne — PROMPT_DNES_WOW.md bod C. Čistá funkce, žádné API.
//
// Pořadí podle zadání: Snídaně → Svačina → Oběd → Trénink → Svačina → Večeře.
// Jídla mají čas z plánu, trénink čas NEMÁ (plán ho nenese) — ukazuje se
// jako „Kdykoli" a řadí se hned za oběd, ne na vymyšlenou hodinu.
import type { MealItem } from '../types.ts';
import { casVPraze } from './casVPraze.ts';

export interface PolozkaOsy {
  klic: string;
  typ: 'jidlo' | 'trenink';
  /** „7:30", nebo `null` (trénink). */
  cas: string | null;
  nazev: string;
  /** Kategorie nad názvem: „Snídaně", „Trénink". */
  stitek: string;
  /** „420 kcal" / „45 min". */
  udaj: string;
  hotovo: boolean;
  /** Jen `typ === 'jidlo'`. */
  jidloId?: string;
  /** Minuty od půlnoci, podle kterých se osa řadí a hledá „teď". */
  poradiMin: number;
}

export interface TreninekOsy {
  nazev: string;
  delkaMin: number;
  /** Hotovo až po VŠECH cvicích (`jeTreninkHotovy` v src/lib/trenink.ts). */
  hotovo: boolean;
  /** Načatý, ale nedokončený trénink: „2 z 4 cviků". */
  rozpracovano?: { hotovo: number; celkem: number } | null;
}

export interface CasovaOsa {
  polozky: PolozkaOsy[];
  /**
   * Před kterou položkou leží značka „Teď" (0 = před první, `polozky.length`
   * = za poslední). `null`, když osa nemá co porovnávat.
   */
  tedPredIndexem: number | null;
}

/** „7:30" → 450. `null` pro nerozpoznatelný tvar. */
export function casNaMinuty(cas: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(cas ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const NEZNAMY_CAS_MIN = 24 * 60;
/** Kdyby v plánu nebyl oběd, trénink se zařadí odpoledne. */
const ODPOLEDNE_MIN = 16 * 60 + 30;

export function sestavCasovouOsu(
  meals: MealItem[],
  trenink: TreninekOsy | null,
  ted: Date = new Date()
): CasovaOsa {
  const jidla: PolozkaOsy[] = meals.map((m) => ({
    klic: `jidlo-${m.id}`,
    typ: 'jidlo',
    cas: casNaMinuty(m.time) !== null ? m.time : null,
    nazev: m.title,
    stitek: m.type,
    udaj: `${Math.round(m.calories)} kcal`,
    hotovo: m.completed,
    jidloId: m.id,
    poradiMin: casNaMinuty(m.time) ?? NEZNAMY_CAS_MIN,
  }));
  jidla.sort((a, b) => a.poradiMin - b.poradiMin);

  const polozky = [...jidla];

  if (trenink) {
    const obed = jidla.findIndex((j) => j.stitek === 'Oběd');
    const item: PolozkaOsy = {
      klic: 'trenink',
      typ: 'trenink',
      cas: null,
      nazev: trenink.nazev,
      stitek: 'Trénink',
      // Rozpracovaný trénink ukáže postup místo délky — jinak by osa mlčela
      // o tom, že už je něco odcvičeno.
      udaj: !trenink.hotovo && trenink.rozpracovano
        ? `${trenink.rozpracovano.hotovo} z ${trenink.rozpracovano.celkem} ${trenink.rozpracovano.celkem === 1 ? 'cviku' : 'cviků'}`
        : `${trenink.delkaMin} min`,
      hotovo: trenink.hotovo,
      poradiMin: obed >= 0 ? jidla[obed].poradiMin + 1 : ODPOLEDNE_MIN,
    };
    if (obed >= 0) {
      polozky.splice(obed + 1, 0, item);
    } else {
      const pozice = polozky.findIndex((p) => p.poradiMin > item.poradiMin);
      polozky.splice(pozice === -1 ? polozky.length : pozice, 0, item);
    }
  }

  if (polozky.length === 0) return { polozky, tedPredIndexem: null };

  const { hodina, minuta } = casVPraze(ted);
  const terazMin = hodina * 60 + minuta;
  // Značka „Teď" leží za všemi položkami, jejichž čas už nastal.
  const tedPredIndexem = polozky.filter((p) => p.poradiMin <= terazMin).length;
  return { polozky, tedPredIndexem };
}
