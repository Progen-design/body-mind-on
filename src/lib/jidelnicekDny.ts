/**
 * Logika přepínače dnů v jídelníčku — docs/DALSI_KROK.md 9.8.
 *
 * Čistý modul bez Reactu: výběr dne, řazení Po–Ne a součty pro kartu
 * „Denní příjem & Makronutrienty" a pro dlaždice pruhu dnů. Karta makro
 * počítá VYBRANÝ den, ne pořád dnešek — jinak by přepínač lhal, a přesně
 * to je jádro bodu 9.8.
 */
import type { TydenniDenJidel } from '../data/adaptery.ts';
import { poradiDneVTydnu } from '../data/adaptery.ts';

/**
 * Dny plánu chodí v pořadí plánu (`valid_from` může být čtvrtek), ale pruh
 * dnů má být Po–Ne jako u tréninku — stejné řazení, jaké dělá `naTreninky`.
 */
export function seradDnyPoNe(dny: TydenniDenJidel[]): TydenniDenJidel[] {
  return [...(Array.isArray(dny) ? dny : [])].sort(
    (a, b) => poradiDneVTydnu(a.denNazev) - poradiDneVTydnu(b.denNazev)
  );
}

/**
 * Vybraný den: kliknuté datum, jinak dnešek (`jeDnes` garantuje adaptér
 * včetně záskoku na první den), jinak první den. `null` jen u plánu bez dnů.
 */
export function vybranyDenJidel(
  dny: TydenniDenJidel[],
  vybraneDatum: string | null
): TydenniDenJidel | null {
  const seznam = Array.isArray(dny) ? dny : [];
  if (vybraneDatum) {
    const kliknuty = seznam.find((d) => d.datum === vybraneDatum);
    if (kliknuty) return kliknuty;
  }
  return seznam.find((d) => d.jeDnes) ?? seznam[0] ?? null;
}

export interface SouhrnDneJidel {
  /** Součet kalorií VŠECH jídel dne — velikost plánu, jako 60m u tréninku. */
  kcalPlan: number;
  /** Jen odškrtnutá jídla — to, co karta ukazuje jako snědené. */
  kcalSnedeno: number;
  bilkovinyG: number;
  sacharidyG: number;
  tukyG: number;
  maJidla: boolean;
  /** Den splněn = má jídla a všechna jsou odškrtnutá. */
  vseSplneno: boolean;
}

export function souhrnDneJidel(den: TydenniDenJidel | null): SouhrnDneJidel {
  const jidla = den?.meals ?? [];
  return {
    kcalPlan: jidla.reduce((acc, m) => acc + m.calories, 0),
    kcalSnedeno: jidla.reduce((acc, m) => acc + (m.completed ? m.calories : 0), 0),
    bilkovinyG: jidla.reduce((acc, m) => acc + (m.completed ? m.protein : 0), 0),
    sacharidyG: jidla.reduce((acc, m) => acc + (m.completed ? m.carbs : 0), 0),
    tukyG: jidla.reduce((acc, m) => acc + (m.completed ? m.fat : 0), 0),
    maJidla: jidla.length > 0,
    vseSplneno: jidla.length > 0 && jidla.every((m) => m.completed),
  };
}

/** Druhý řádek dlaždice dne: „5 jídel", „1 jídlo"; den bez jídel = „Volno" u tréninku. */
export function pocetJidelSlovy(pocet: number): string {
  if (pocet <= 0) return 'Bez jídel';
  if (pocet === 1) return '1 jídlo';
  if (pocet <= 4) return `${pocet} jídla`;
  return `${pocet} jídel`;
}
