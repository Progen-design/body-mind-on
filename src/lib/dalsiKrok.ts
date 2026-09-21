// JEDNA primární akce podle stavu dne — PROMPT_DNES_HERO.md.
//
// Pevné pořadí pravidel, čistá funkce (žádné volání API, žádné náhodné
// nebo AI-generované doporučení — je to odvozené z dat, ne vymyšlené):
//   1. trénink dnes a neodcvičený                 → „Začít trénink {název}"
//   2. první nezapsané jídlo, jehož čas už nastal  → „Zapiš {typ ve 4. pádě} — {název}"
//   3. dnes ještě není vážení a je ráno           → „Zapiš dnešní váhu"
//   4. zbývá jídlo, jehož čas teprve přijde        → „Další jídlo v {čas}: {název}" (bez tlačítka)
//   5. všechno zapsané                             → „Dnešek máš splněný."
//
// Větev 4 přidána při review 21. 9.: dřív se v 8:00 se zapsanou snídaní a
// obědem ve 12:30 ukázalo „Dnešek máš splněný." — nepravda, den teprve začal.
// „Splněný" smí zaznít jen tehdy, když opravdu nic nezbývá.
import type { MealItem } from '../types.ts';
import { casVPraze } from './casVPraze.ts';

export type DalsiKrokTyp = 'trenink' | 'jidlo' | 'vaha' | 'ceka' | 'hotovo';

export interface DalsiKrok {
  typ: DalsiKrokTyp;
  label: string;
  /** Jen `typ === 'jidlo'` — id jídla, které má akce odškrtnout. */
  mealId?: string;
}

export interface DalsiKrokJidlo {
  id: string;
  type: MealItem['type'];
  title: string;
  /** „7:30" — stejný tvar jako `MealItem.time` (bez nuly na začátku). */
  time: string;
  completed: boolean;
}

export interface DalsiKrokVstup {
  maTrenink: boolean;
  treninkHotovy: boolean;
  /** Jen když `maTrenink`. */
  treninkNazev?: string;
  /** Dnešní jídla, v pořadí dne (snídaně → večeře) — stejné jako `meals` v App.tsx. */
  meals: DalsiKrokJidlo[];
  /** Existuje dnešní záznam váhy? */
  vazilSeDnes: boolean;
}

/**
 * Typ jídla ve 4. pádě pro „Zapiš …" — „Zapiš snídani", ne „Zapiš Snídaně".
 * Neznámý typ (nemělo by nastat) projde malými písmeny beze změny.
 */
const TYP_VE_4_PADE: Record<string, string> = {
  'Snídaně': 'snídani',
  'Dopolední svačina': 'dopolední svačinu',
  'Oběd': 'oběd',
  'Odpolední svačina': 'odpolední svačinu',
  'Večeře': 'večeři',
};

export function typJidlaVe4Pade(typ: string): string {
  return TYP_VE_4_PADE[typ] ?? String(typ || '').toLowerCase();
}

/** „7:30" → 450 (minut od půlnoci). `null` pro nerozpoznatelný tvar. */
function casNaMinuty(cas: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(cas || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * „Pondělí 21. září" — den velkým písmenem, měsíc malým. CSS `capitalize`
 * na `Intl` výstupu psalo i měsíc velkým („21. Září").
 */
export function datumDneCesky(ted: Date = new Date()): string {
  const text = new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Prague',
  }).format(ted);
  return text.charAt(0).toLocaleUpperCase('cs-CZ') + text.slice(1);
}

export function dalsiKrok(vstup: DalsiKrokVstup, ted: Date = new Date()): DalsiKrok {
  if (vstup.maTrenink && !vstup.treninkHotovy) {
    // Název tréninku často sám začíná slovem „Trénink" („Trénink A") —
    // bez očištění vzniklo „Začít trénink Trénink A".
    const nazev = String(vstup.treninkNazev || '').trim().replace(/^trénink(\s+|$)/i, '');
    return { typ: 'trenink', label: `Začít trénink ${nazev}`.trim() };
  }

  const { hodina, minuta } = casVPraze(ted);
  const nynejsiMinuty = hodina * 60 + minuta;

  const nezapsana = vstup.meals.filter((jidlo) => !jidlo.completed);

  const nezapsaneJidlo = nezapsana.find((jidlo) => {
    const casJidla = casNaMinuty(jidlo.time);
    return casJidla !== null && casJidla <= nynejsiMinuty;
  });
  if (nezapsaneJidlo) {
    return {
      typ: 'jidlo',
      label: `Zapiš ${typJidlaVe4Pade(nezapsaneJidlo.type)} — ${nezapsaneJidlo.title}`,
      mealId: nezapsaneJidlo.id,
    };
  }

  // „Ráno" sdílí hranici s pozdravem (pozdrav.ts) — do 10:00.
  const jeRano = hodina < 10;
  if (!vstup.vazilSeDnes && jeRano) {
    return { typ: 'vaha', label: 'Zapiš dnešní váhu' };
  }

  // Zbývá jídlo, jehož čas teprve přijde (nebo nemá rozpoznatelný čas) —
  // není to úkol na teď, ale den ještě splněný není.
  const dalsiJidlo = nezapsana[0];
  if (dalsiJidlo) {
    const cas = casNaMinuty(dalsiJidlo.time) !== null ? ` v ${dalsiJidlo.time}` : '';
    return { typ: 'ceka', label: `Další jídlo${cas}: ${dalsiJidlo.title}` };
  }

  return { typ: 'hotovo', label: 'Dnešek máš splněný.' };
}
