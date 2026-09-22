// AUTOMATICKÁ CÍLOVÁ VÁHA (22. 9. 2026).
//
// Když si člověk cílovou váhu sám nezadal (`goal_weight_kg` v Nastavení),
// dopočítá ji appka z výšky, aktuální váhy a cíle z registrace. Dřív se
// v tom případě ukazovala natvrdo 102 kg z `initialData` — u všech účtů
// bez zadaného cíle stejné, vymyšlené číslo.
//
// Pravidla jsou záměrně konzervativní (žádné zdravotní sliby):
//   redukce        → max(váha při BMI 24,9 ; aktuální − 10 %), aspoň o 2 kg níž
//   nabirani_svaly → min(aktuální + 5 % ; váha při BMI 27), aspoň o 2 kg výš
//   udrzovani      → aktuální váha
// Výsledek je zaokrouhlený na 0,5 kg. Ručně zadaná hodnota má vždy přednost.

export type CilProgramu = 'redukce' | 'nabirani_svaly' | 'udrzovani' | string | null | undefined;

const naPulKila = (kg: number) => Math.round(kg * 2) / 2;

function kladneCislo(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @returns automatická cílová váha v kg, nebo `null`, když chybí váha
 *          (bez výšky se počítá jen z procent)
 */
export function automatickaCilovaVaha(
  vahaKg: unknown,
  vyskaCm: unknown,
  cil: CilProgramu
): number | null {
  const vaha = kladneCislo(vahaKg);
  if (vaha == null) return null;
  const vyska = kladneCislo(vyskaCm);
  const m2 = vyska != null && vyska >= 120 && vyska <= 230 ? (vyska / 100) ** 2 : null;

  const c = String(cil ?? '').toLowerCase();
  if (c.includes('reduk')) {
    const podleProcent = vaha * 0.9;
    const podleBmi = m2 != null ? 24.9 * m2 : podleProcent;
    const cilKg = Math.min(Math.max(podleBmi, podleProcent), vaha - 2);
    return naPulKila(cilKg);
  }
  if (c.includes('sval') || c.includes('nabir')) {
    const podleProcent = vaha * 1.05;
    const podleBmi = m2 != null ? 27 * m2 : podleProcent;
    const cilKg = Math.max(Math.min(podleProcent, podleBmi), vaha + 2);
    return naPulKila(cilKg);
  }
  return naPulKila(vaha);
}

/** Ručně zadaný cíl (`goal_weight_kg`) má přednost, jinak automatický. */
export function cilovaVaha(
  zadanaKg: unknown,
  vahaKg: unknown,
  vyskaCm: unknown,
  cil: CilProgramu
): { kg: number | null; automaticky: boolean } {
  const zadana = kladneCislo(zadanaKg);
  if (zadana != null) return { kg: zadana, automaticky: false };
  return { kg: automatickaCilovaVaha(vahaKg, vyskaCm, cil), automaticky: true };
}
