// „Tvoje cesta" — PROMPT_DNES_WOW.md bod D. Čisté funkce nad daty, která
// appka už má (váha, dokončené aktivity, plán týdne). Nic se nevymýšlí:
// co se z dat spočítat nedá, vrací se `null`/0 a karta to nekreslí.
import { calendarDateIsoInPrague } from '../../lib/czechCalendar.js';

// ------------------------------------------------------------------ série

/** Data jsou omezená na 500 řádků, série delší než rok nikoho nezajímá. */
const MAX_DNI_SERIE = 365;

function odectiDen(iso: string): string {
  const [r, m, d] = iso.split('-').map(Number);
  const den = new Date(Date.UTC(r, m - 1, d, 12) - 86_400_000);
  return den.toISOString().slice(0, 10);
}

/**
 * Kolik dní v řadě mělo aspoň jednu dokončenou aktivitu (jídlo, trénink).
 *
 * Dnešek, který ještě nic nemá, sérii NEPŘERUŠUJE — den neskončil. Série se
 * pak počítá od včerejška; jakmile je dnes něco zapsané, přibude i dnešek.
 * Vrací 0, když série nezačala.
 *
 * @param dokonceniISO `completed_at` z `daily_activity_completions`
 */
export function serieDni(dokonceniISO: (string | null | undefined)[], ted: Date = new Date()): number {
  const dny = new Set<string>();
  for (const cas of dokonceniISO) {
    if (!cas) continue;
    const t = new Date(cas);
    if (Number.isNaN(t.getTime())) continue;
    dny.add(calendarDateIsoInPrague(t));
  }
  if (dny.size === 0) return 0;

  let den = calendarDateIsoInPrague(ted);
  if (!dny.has(den)) den = odectiDen(den);

  let serie = 0;
  while (dny.has(den) && serie < MAX_DNI_SERIE) {
    serie += 1;
    den = odectiDen(den);
  }
  return serie;
}

// ------------------------------------------------------------ týdenní souhrn

export interface TydenSouhrn {
  treninkuHotovo: number;
  treninkuCelkem: number;
  jidelZapsano: number;
  jidelCelkem: number;
  /** Dnešní trénink, který je načatý, ale ne dokončený („2 z 4 cviků"). */
  rozpracovano: { hotovo: number; celkem: number } | null;
}

/**
 * @param dnesHotovo Zda je DNEŠNÍ trénink hotový podle stejného pravidla jako v hero
 *   (`jeTreninkHotovy` v src/lib/trenink.ts — vč. hodinek). `null` = neznámé, počítá
 *   se jen z odškrtnutých cviků.
 */
export function tydenSouhrn(
  treninky: { maTrenink?: boolean; isCompleted: boolean; isToday?: boolean; exercises: { completed?: boolean }[] }[],
  dnyJidel: { meals: { completed: boolean }[] }[],
  dnesHotovo: boolean | null = null
): TydenSouhrn {
  const planovane = treninky.filter((t) => t.maTrenink !== false && t.exercises.length > 0);
  // Hotovo až po VŠECH cvicích — stejné pravidlo jako kroužek v hero. `isCompleted`
  // ze serveru samo nestačí u dne, jehož odškrtnutí se právě propsalo.
  const jeHotovy = (t: (typeof planovane)[number]) =>
    (t.isToday === true && dnesHotovo === true) || t.isCompleted || t.exercises.every((c) => c.completed === true);
  const jidla = dnyJidel.flatMap((d) => d.meals);

  const dnes = planovane.find((t) => t.isToday === true);
  const hotovoCviku = dnes ? dnes.exercises.filter((c) => c.completed === true).length : 0;
  const rozpracovano =
    dnes && !jeHotovy(dnes) && hotovoCviku > 0
      ? { hotovo: hotovoCviku, celkem: dnes.exercises.length }
      : null;

  return {
    treninkuHotovo: planovane.filter(jeHotovy).length,
    treninkuCelkem: planovane.length,
    jidelZapsano: jidla.filter((j) => j.completed).length,
    jidelCelkem: jidla.length,
    rozpracovano,
  };
}

// ------------------------------------------------------- co je připravené

export interface PripravenoVstup {
  jidelNaTyden: number;
  treninkuNaTyden: number;
  polozekNakupu: number;
  tedDostupny: boolean;
}

function sklon(n: number, jedno: string, dve: string, pet: string): string {
  if (n === 1) return `${n} ${jedno}`;
  if (n >= 2 && n <= 4) return `${n} ${dve}`;
  return `${n} ${pet}`;
}

/** Řádky „Co pro tebe máme připravené" — jen to, co opravdu existuje (počet > 0). */
export function pripravenoRadky(v: PripravenoVstup): string[] {
  const radky: string[] = [];
  if (v.jidelNaTyden > 0) radky.push(`${sklon(v.jidelNaTyden, 'jídlo', 'jídla', 'jídel')} na tento týden`);
  if (v.treninkuNaTyden > 0) radky.push(sklon(v.treninkuNaTyden, 'trénink', 'tréninky', 'tréninků'));
  if (v.polozekNakupu > 0) radky.push(`nákupní seznam ${sklon(v.polozekNakupu, 'položka', 'položky', 'položek')}`);
  if (v.tedDostupny) radky.push('AI trenér TED');
  return radky;
}

// ----------------------------------------------------------- graf váhy

export interface BodGrafu {
  x: number;
  y: number;
  datum: string;
  kg: number;
}

export interface GrafVahy {
  body: BodGrafu[];
  /** Y čáry cíle, nebo `null`, když cíl neznáme. */
  cilY: number | null;
  minKg: number;
  maxKg: number;
}

/**
 * Sparkline váhy za posledních `dni` dní v souřadnicích 0..šířka × 0..výška.
 * `null`, když v okně nejsou aspoň 2 záznamy — jedna tečka není graf.
 * Cíl se do rozsahu osy započítá, ať je čára vidět, i když je od aktuální
 * váhy daleko.
 */
export function grafVahy(
  zaznamy: { date: string; weight: number }[],
  cilKg: number | null | undefined,
  ted: Date = new Date(),
  sirka = 300,
  vyska = 80,
  dni = 30,
  okraj = 6
): GrafVahy | null {
  const dnes = calendarDateIsoInPrague(ted);
  let odIso = dnes;
  for (let i = 0; i < dni; i += 1) odIso = odectiDen(odIso);

  const okno = zaznamy
    .filter((z) => z.date >= odIso && z.date <= dnes && Number.isFinite(z.weight) && z.weight > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (okno.length < 2) return null;

  const cil = cilKg != null && cilKg > 0 ? cilKg : null;
  const hodnoty = okno.map((z) => z.weight).concat(cil != null ? [cil] : []);
  let minKg = Math.min(...hodnoty);
  let maxKg = Math.max(...hodnoty);
  if (maxKg - minKg < 0.5) {
    minKg -= 0.25;
    maxKg += 0.25;
  }

  const cas = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();
  const t0 = cas(okno[0].date);
  const rozsahT = Math.max(1, cas(okno[okno.length - 1].date) - t0);
  const yNa = (kg: number) => okraj + ((maxKg - kg) / (maxKg - minKg)) * (vyska - 2 * okraj);

  const body = okno.map((z) => ({
    x: okraj + ((cas(z.date) - t0) / rozsahT) * (sirka - 2 * okraj),
    y: yNa(z.weight),
    datum: z.date,
    kg: z.weight,
  }));

  return { body, cilY: cil != null ? yNa(cil) : null, minKg, maxKg };
}

/** Body grafu jako řetězec pro `<polyline points>`. */
export function bodyNaPolyline(body: { x: number; y: number }[]): string {
  return body.map((b) => `${Math.round(b.x * 10) / 10},${Math.round(b.y * 10) / 10}`).join(' ');
}
