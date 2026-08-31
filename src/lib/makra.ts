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
 * Cíl jedné makroživiny. Když máme uložené gramy (`body_metrics.*_target_g`),
 * ty jsou zdroj pravdy a procento se dopočítá z nich. Když ne, spadne se na
 * starý dopočet gramů z procenta — to je jediná cesta pro preference, které
 * ještě žádná uložená makra nemají (výchozí stav před načtením profilu).
 *
 * DŘÍV TO BYLO JEN NAOPAK: gramy se vždy dopočítávaly z procenta, které je
 * samo zaokrouhlený podíl uložených gramů. Cesta gramy → procento → gramy
 * zaokrouhluje dvakrát. Změřeno 31. 8. 2026: uloženo B 189 g, profil ukazoval
 * 191 g — žádná obrazovka neukazovala číslo, se kterým se skládá jídelníček
 * (docs/DALSI_KROK.md 7.2b).
 */
function cilMakra(
  kcalZaDen: number,
  procentoZaloha: number,
  kcalNaGram: number,
  gramyUlozene: number | null | undefined
): CileMakra {
  if (typeof gramyUlozene === 'number' && gramyUlozene > 0) {
    return {
      gramy: gramyUlozene,
      procenta: kcalZaDen > 0 ? Math.round((gramyUlozene * kcalNaGram * 100) / kcalZaDen) : 0,
    };
  }
  return {
    procenta: procentoZaloha,
    gramy: gramyMakra(kcalZaDen, procentoZaloha, kcalNaGram),
  };
}

/**
 * Denní cíle všech tří makroživin z uživatelských preferencí.
 *
 * Vypočtené makro (`snědené dnes z jídel`) je JINÁ věc a nejde přes tuhle
 * funkci — ta počítá jen CÍL. Konzument (`totalProteinGrams` v
 * NutritionSection.tsx) sčítá gramy z `meals`, ne odsud.
 *
 * @param preferences zdroj pravdy — kalorický cíl, poměry a (pokud je máme) uložené gramy z profilu
 */
export function denniMakra(preferences: {
  dailyCalorieTarget: number;
  proteinRatioPercent: number;
  carbsRatioPercent: number;
  fatRatioPercent: number;
  proteinTargetG?: number | null;
  carbsTargetG?: number | null;
  fatTargetG?: number | null;
}): DenniMakra {
  const kcal = preferences.dailyCalorieTarget;
  return {
    bilkoviny: cilMakra(kcal, preferences.proteinRatioPercent, KCAL_NA_GRAM.bilkoviny, preferences.proteinTargetG),
    sacharidy: cilMakra(kcal, preferences.carbsRatioPercent, KCAL_NA_GRAM.sacharidy, preferences.carbsTargetG),
    tuky: cilMakra(kcal, preferences.fatRatioPercent, KCAL_NA_GRAM.tuky, preferences.fatTargetG),
  };
}
