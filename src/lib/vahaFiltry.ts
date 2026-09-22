import type { WeightRecord } from '../types.ts';

/**
 * ČASOVÉ ŘADY PRO GRAF VÁHY.
 *
 * CO SE TU OPRAVUJE. Do 23. 9. 2026 se v `App.tsx` do všech čtyř klíčů
 * ukládalo TOTÉŽ pole:
 *
 *     setWeightRecords({ '1M': vazeni, '3M': vazeni, '6M': vazeni, '1R': vazeni });
 *
 * Přepínač 1M/3M/6M/1R tedy překresloval pokaždé stejný graf. Uživatel
 * klikl na „1M" a viděl rok — a nijak to nepoznal, protože osa nese jen
 * dny a měsíce, ne rok.
 *
 * OKNO SE POČÍTÁ OD DNEŠKA, NE OD POSLEDNÍHO VÁŽENÍ. „Posledních 30 dní"
 * musí znamenat posledních 30 dní; kdyby se okno posouvalo k poslednímu
 * záznamu, ukazovalo by se pod popiskem „1M" klidně půl roku staré měření.
 * Prázdný měsíc je platný výsledek — člověk se prostě nevážil.
 *
 * Právě proto má řada `VSE` vlastní klíč: „poslední vážení" v hero a výpočet
 * pokroku k cíli se nesmí ptát okna, jinak by po třiceti dnech bez vážení
 * appka tvrdila, že žádné vážení nemá.
 *
 * MODUL JE ČISTÝ — kvůli `node --test` bez transpilace a bez DOM.
 */

/** Klíče časových řad. `VSE` není tlačítko, je to nezkrácená řada. */
export type VahaFiltr = 'D' | 'T' | '1M' | '3M' | '6M' | '1R';

/** Klíč pro celou historii. Graf ho nenabízí, čtou ho hero a výpočty. */
export const KLIC_VSE = 'VSE';

/** Tlačítka v grafu, v pořadí od nejkratšího období. */
export const FILTRY_VAHY: readonly VahaFiltr[] = ['D', 'T', '1M', '3M', '6M', '1R'] as const;

/** Lidský popisek tlačítka. „D" a „T" samy o sobě nic neříkají. */
export const POPISEK_FILTRU: Record<VahaFiltr, string> = {
  D: 'Den',
  T: 'Týden',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '1R': '1R',
};

/**
 * Kolik dní zpátky řada sahá.
 *
 * `T` má 84 dní = 12 týdnů: dvanáct bodů je ještě čitelných na šířku grafu
 * a zároveň je na nich vidět trend, který denní kolísání schová.
 */
export const OKNO_DNI: Record<VahaFiltr, number> = {
  D: 7,
  T: 84,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1R': 365,
};

const DEN_MS = 24 * 60 * 60 * 1000;

/** „2026-09-23" → Date o půlnoci. Neplatné datum vrací null. */
function naDatum(iso: string): Date | null {
  const shoda = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!shoda) return null;
  const d = new Date(Number(shoda[1]), Number(shoda[2]) - 1, Number(shoda[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → „2026-09-23". */
function naIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const den = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${den}`;
}

/** Pondělí toho týdne, do kterého datum patří. */
function pondeli(d: Date): Date {
  const kopie = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): neděle = 0. Posun na pondělí je tedy u neděle šest dní zpět.
  const posun = (kopie.getDay() + 6) % 7;
  kopie.setDate(kopie.getDate() - posun);
  return kopie;
}

/**
 * Záznamy spadající do posledních `dni` dnů (včetně dneška).
 *
 * @param zaznamy vzestupně podle data
 * @param dni délka okna
 * @param ted referenční „dnešek"
 */
export function vOkne(zaznamy: WeightRecord[], dni: number, ted: Date = new Date()): WeightRecord[] {
  const dnesek = new Date(ted.getFullYear(), ted.getMonth(), ted.getDate());
  const od = new Date(dnesek.getTime() - (dni - 1) * DEN_MS);

  return (zaznamy || []).filter((z) => {
    const d = naDatum(z.date);
    return d != null && d.getTime() >= od.getTime() && d.getTime() <= dnesek.getTime();
  });
}

/**
 * Týdenní průměry — jeden bod na týden, datum = pondělí toho týdne.
 *
 * PRŮMĚR, NE POSLEDNÍ VÁŽENÍ V TÝDNU. Váha kolísá o kilo podle toho, co
 * člověk včera jedl a pil; týdenní průměr je jediné, co z denních čísel
 * dává trend. Přesně proto tenhle přepínač existuje.
 *
 * Tuk, svaly a BMI se průměrují taky, ať řádek nemíchá čísla z různých dní.
 */
export function tydenniPrumery(zaznamy: WeightRecord[]): WeightRecord[] {
  const koše = new Map<string, WeightRecord[]>();

  (zaznamy || []).forEach((z) => {
    const d = naDatum(z.date);
    if (!d) return;
    const klic = naIso(pondeli(d));
    if (!koše.has(klic)) koše.set(klic, []);
    koše.get(klic)!.push(z);
  });

  const prumer = (hodnoty: number[]): number => {
    const platne = hodnoty.filter((h) => Number.isFinite(h));
    if (platne.length === 0) return 0;
    return Math.round((platne.reduce((a, b) => a + b, 0) / platne.length) * 10) / 10;
  };

  return [...koše.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([datum, tyden]) => ({
      date: datum,
      weight: prumer(tyden.map((z) => z.weight)),
      fatPercent: prumer(tyden.map((z) => z.fatPercent)),
      muscleKg: prumer(tyden.map((z) => z.muscleKg)),
      bmi: prumer(tyden.map((z) => z.bmi)),
    }));
}

/**
 * Všechny řady z jedné historie vážení.
 *
 * @param vazeni celá historie, vzestupně podle data
 * @param ted referenční „dnešek"
 */
export function sestavFiltryVahy(
  vazeni: WeightRecord[],
  ted: Date = new Date(),
): Record<string, WeightRecord[]> {
  const rada = vazeni || [];

  return {
    [KLIC_VSE]: rada,
    D: vOkne(rada, OKNO_DNI.D, ted),
    // Nejdřív okno, pak agregace — opačně by poslední týden vyšel z části
    // dat a průměr by neseděl na žádné skutečné období.
    T: tydenniPrumery(vOkne(rada, OKNO_DNI.T, ted)),
    '1M': vOkne(rada, OKNO_DNI['1M'], ted),
    '3M': vOkne(rada, OKNO_DNI['3M'], ted),
    '6M': vOkne(rada, OKNO_DNI['6M'], ted),
    '1R': vOkne(rada, OKNO_DNI['1R'], ted),
  };
}

/**
 * Přidá (nebo přepíše) vážení v celé historii a přepočítá z ní řady.
 *
 * Nahrazuje `syncEngine.applyWeightRecord`, který nový bod lepil zvlášť do
 * každé řady, u `1R` mu přepisoval datum na „09.2026" a řady ořezával na
 * 8–10 bodů. S opravdovými okny to nejde: do týdenní řady nepatří jeden
 * záznam, ale přepočítaný průměr.
 */
export function sRozsirenouHistorii(
  rady: Record<string, WeightRecord[]>,
  novy: WeightRecord,
  ted: Date = new Date(),
): Record<string, WeightRecord[]> {
  const historie = rady?.[KLIC_VSE] ?? [];
  const bezTehoDne = historie.filter((z) => z.date !== novy.date);
  const nova = [...bezTehoDne, novy].sort((a, b) => a.date.localeCompare(b.date));
  return sestavFiltryVahy(nova, ted);
}
