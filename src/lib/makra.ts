/**
 * DENNÍ CÍLE MAKROŽIVIN — JEDEN VÝPOČET PRO CELOU APLIKACI.
 *
 * Chyba, kterou to opravuje: Přehled ukazoval „B 34 % (103 g)“ a Profil
 * „Bílkoviny (34 %) 184 g“ — tentýž údaj, dvě různá čísla. Procento bylo
 * v obou případech skutečné, ale gramy v Přehledu byly napsané natvrdo
 * v JSX (`OverviewBentoGrid.tsx:385`), zatímco Profil je dopočítával
 * z kalorického cíle. Sto tři gramů bílkovin odpovídalo poměru 19 %,
 * což je výchozí hodnota z makety, ne uživatelův profil.
 *
 * Gramy se proto počítají tady a obě místa je odsud berou.
 */

/** Energie na gram. Bílkoviny a sacharidy 4 kcal, tuky 9 kcal. */
const KCAL_NA_GRAM = { bilkoviny: 4, sacharidy: 4, tuky: 9 } as const;

export interface CileMakra {
  /** Podíl na denním příjmu v procentech. */
  procenta: number;
  /** Kolik gramů to při daném kalorickém cíli dělá. */
  gramy: number;
}

export interface DenniMakra {
  bilkoviny: CileMakra;
  sacharidy: CileMakra;
  tuky: CileMakra;
}

/**
 * Gramy makroživiny z kalorického cíle a jejího podílu.
 *
 * @param kcalZaDen denní kalorický cíl
 * @param procenta podíl makroživiny na příjmu
 * @param kcalNaGram 4 pro bílkoviny a sacharidy, 9 pro tuky
 */
export function gramyMakra(kcalZaDen: number, procenta: number, kcalNaGram: number): number {
  if (!(kcalZaDen > 0) || !(procenta > 0) || !(kcalNaGram > 0)) return 0;
  return Math.round((kcalZaDen * (procenta / 100)) / kcalNaGram);
}

/**
 * Denní cíle všech tří makroživin z uživatelských preferencí.
 *
 * @param preferences zdroj pravdy — kalorický cíl a poměry z profilu
 */
export function denniMakra(preferences: {
  dailyCalorieTarget: number;
  proteinRatioPercent: number;
  carbsRatioPercent: number;
  fatRatioPercent: number;
}): DenniMakra {
  const kcal = preferences.dailyCalorieTarget;
  return {
    bilkoviny: {
      procenta: preferences.proteinRatioPercent,
      gramy: gramyMakra(kcal, preferences.proteinRatioPercent, KCAL_NA_GRAM.bilkoviny),
    },
    sacharidy: {
      procenta: preferences.carbsRatioPercent,
      gramy: gramyMakra(kcal, preferences.carbsRatioPercent, KCAL_NA_GRAM.sacharidy),
    },
    tuky: {
      procenta: preferences.fatRatioPercent,
      gramy: gramyMakra(kcal, preferences.fatRatioPercent, KCAL_NA_GRAM.tuky),
    },
  };
}
