// Krok 3 registrace — vyloučení cviků a pohybových vzorů z tréninkového
// plánu. Čistá logika (chipy → training_exclusions, formátování živého
// počtu); samotné UI je v src/components/registrace/TreninkovaOmezeni.tsx.
//
// CHIPY POHYBOVÝCH VZORŮ NEJSOU 1:1 SE SLOVNÍKEM V lib/trainingExclusions.js.
// Jeden chip může krýt víc vzorů („Dřepy a výpady" = squat + lunge) a chip
// „Cviky vleže na zemi" nemapuje na žádný z jedenácti vzorů vůbec — je to
// virtuální vzor `'floor'`, který lib/trainingExclusions.js čte přes
// `floor_required` u cviku (viz jeho hlavička). CHIP_PATTERNY je tedy
// PŘEKLADOVÁ vrstva mezi tím, jak uživatel mluví, a tím, čemu rozumí
// vylučovací logika — a je to jediné místo, které tenhle překlad zná.

export interface TreninkoveOmezeni {
  patterns: string[];
  muscles: string[];
  exercise_keys: string[];
  contraindications: string[];
  source: string;
  updated_at: string;
}

export interface ChipVzoru {
  id: string;
  label: string;
  patterny: readonly string[];
}

/** Pořadí a texty přesně podle zadání kroku 3 registrace. */
export const CHIPY_POHYBOVYCH_VZORU: readonly ChipVzoru[] = [
  { id: 'drepy_vypady', label: 'Dřepy a výpady', patterny: ['squat', 'lunge'] },
  { id: 'mrtvy_tah_predklony', label: 'Mrtvý tah a předklony', patterny: ['hinge'] },
  { id: 'skoky_doskoky', label: 'Skoky a doskoky', patterny: ['plyo'] },
  { id: 'tlaky_nad_hlavu', label: 'Tlaky nad hlavu', patterny: ['vertical_push'] },
  { id: 'kliky_tlaky', label: 'Kliky a tlaky', patterny: ['horizontal_push'] },
  { id: 'vlezeVleze', label: 'Cviky vleže na zemi', patterny: ['floor'] },
  { id: 'beh_poskoky', label: 'Běh a poskoky', patterny: ['cardio_impact'] },
] as const;

/** @param chipIds vybraná id z CHIPY_POHYBOVYCH_VZORU */
export function chipyNaPatterny(chipIds: readonly string[]): string[] {
  const vybrane = new Set(chipIds);
  const patterny = new Set<string>();
  for (const chip of CHIPY_POHYBOVYCH_VZORU) {
    if (vybrane.has(chip.id)) {
      for (const p of chip.patterny) patterny.add(p);
    }
  }
  return [...patterny];
}

/** Opačný směr — pro předvyplnění chipů z uloženého training_exclusions. */
export function patternyNaChipy(patterny: readonly string[]): string[] {
  const sada = new Set(patterny);
  return CHIPY_POHYBOVYCH_VZORU.filter((chip) => chip.patterny.some((p) => sada.has(p))).map((chip) => chip.id);
}

/**
 * Sestaví `training_exclusions` ve tvaru pro `body_metrics` (viz migrace
 * 20260909150000 a lib/trainingExclusions.js). Bere už PŘELOŽENÉ pohybové
 * vzory (výstup `chipyNaPatterny`), ne chipy samotné — chipy jsou čistě UI
 * koncept, `training_exclusions` o nich nic neví (stejně jako o nich neví
 * `lib/trainingExclusions.js`).
 */
export function sestavTreninkoveOmezeni(
  vybranePatterny: readonly string[],
  vybranePartie: readonly string[],
  zdroj: string = 'onboarding'
): TreninkoveOmezeni {
  return {
    patterns: [...new Set(vybranePatterny)],
    muscles: [...new Set(vybranePartie)],
    exercise_keys: [],
    contraindications: [],
    source: zdroj,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Text živého počtu — „Zbývá 14 cviků." / „Zbývá 14 cviků, na nohy 2."
 * `pocetNaVybranePartie` je součet `remaining` z `planExclusionCoverage()`
 * napříč partiemi, které uživatel právě zaškrtl (volitelné — bez vybrané
 * partie se druhá věta nezobrazuje).
 */
export function textZbyvajicichCviku(celkemZbyva: number, pocetNaVybranePartie: number | null): string {
  const zaklad = `Zbývá ${celkemZbyva} ${sklonovatCviky(celkemZbyva)}.`;
  if (pocetNaVybranePartie == null) return zaklad;
  return `${zaklad.slice(0, -1)}, na vybranou partii ${pocetNaVybranePartie}.`;
}

function sklonovatCviky(pocet: number): string {
  const abs = Math.abs(pocet);
  if (abs === 1) return 'cvik';
  if (abs >= 2 && abs <= 4) return 'cviky';
  return 'cviků';
}
