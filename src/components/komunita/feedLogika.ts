/**
 * Čistá logika feedu a vlákna komunity — bez Reactu, ať jde otestovat.
 *
 * Relativní čas, seskupování bublin a slučování stránek feedu. Komponenty
 * jen vykreslují, co tu vznikne.
 */

/** Kolik příspěvků se tahá najednou. Server jich unese až 100. */
export const VELIKOST_STRANKY = 20;

/** Jak často se tiše obnoví otevřené vlákno. */
export const OBNOVA_VLAKNA_MS = 30_000;

/**
 * Delší pauza mezi dvěma zprávami téhož autora = nová skupina. Čas je jen
 * pod poslední bublinou skupiny; bez téhle hranice by ranní a večerní zpráva
 * splynuly pod jedním časem.
 */
export const MEZERA_SKUPINY_MS = 10 * 60_000;

const MIN = 60_000;
const HOD = 60 * MIN;
const DEN = 24 * HOD;

/** Začátek kalendářního dne v Praze — „včera" se počítá podle data, ne po 24 h. */
function denPraha(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}

/**
 * „právě teď", „před 5 min", „před 2 h", „včera", „před 3 dny", pak datum.
 *
 * Budoucí čas (hodiny klienta jdou pozadu) se hlásí jako „právě teď" —
 * „za 2 min" by u právě odeslané zprávy mátlo.
 */
export function casRelativne(iso: string | null | undefined, ted: number = Date.now()): string {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return '';

  const rozdil = ted - t;
  if (rozdil < MIN) return 'právě teď';
  if (rozdil < HOD) return `před ${Math.floor(rozdil / MIN)} min`;

  const dnyZpet = Math.round((Date.parse(denPraha(ted)) - Date.parse(denPraha(t))) / DEN);
  if (dnyZpet === 0) return `před ${Math.floor(rozdil / HOD)} h`;
  if (dnyZpet === 1) return 'včera';
  if (dnyZpet < 7) return `před ${dnyZpet} dny`;

  const stejnyRok = denPraha(t).slice(0, 4) === denPraha(ted).slice(0, 4);
  return new Date(t).toLocaleDateString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    ...(stejnyRok ? {} : { year: 'numeric' }),
  });
}

/** 1 dotaz, 2 dotazy, 5 dotazů. */
export function sklonuj(n: number, [jeden, dvaAzCtyri, pet]: [string, string, string]): string {
  if (n === 1) return `${n} ${jeden}`;
  if (n >= 2 && n <= 4) return `${n} ${dvaAzCtyri}`;
  return `${n} ${pet}`;
}

type StranaBubliny = 'moje' | 'cizi' | 'tym';

export interface ZpravaVlakna {
  id: string;
  user_id?: string;
  author_name: string;
  created_at: string;
  is_team?: boolean;
}

export interface SkupinaBublin<T extends ZpravaVlakna> {
  klic: string;
  strana: StranaBubliny;
  zpravy: T[];
}

/**
 * Po sobě jdoucí zprávy téhož autora do jedné skupiny (avatar a jméno jen
 * u první, čas jen pod poslední).
 *
 * Strana: vlastní vpravo, tým vlevo se zeleným okrajem, ostatní vlevo.
 * Vlastní má přednost před týmem — moderátor svou odpověď vidí vpravo
 * jako každý jiný.
 */
export function seskupBubliny<T extends ZpravaVlakna>(
  zpravy: readonly T[],
  mojeId: string | null,
): SkupinaBublin<T>[] {
  const skupiny: SkupinaBublin<T>[] = [];

  for (const z of zpravy) {
    const autor = z.user_id || `jmeno:${z.author_name}`;
    const strana: StranaBubliny = mojeId && z.user_id === mojeId ? 'moje' : z.is_team ? 'tym' : 'cizi';
    const posledni = skupiny[skupiny.length - 1];
    const predchozi = posledni?.zpravy[posledni.zpravy.length - 1];
    const mezera = predchozi ? Date.parse(z.created_at) - Date.parse(predchozi.created_at) : Infinity;

    if (
      posledni
      && posledni.klic.startsWith(`${autor}|`)
      && posledni.strana === strana
      && mezera <= MEZERA_SKUPINY_MS
    ) {
      posledni.zpravy.push(z);
    } else {
      skupiny.push({ klic: `${autor}|${z.id}`, strana, zpravy: [z] });
    }
  }

  return skupiny;
}

/**
 * Připojí další stránku feedu bez duplicit. Mezi dvěma stránkami může
 * někdo přidat příspěvek — offset se posune a první položka nové stránky
 * je ta, kterou už máme.
 */
export function pripojStranku<T extends { id: string }>(stavajici: readonly T[], nove: readonly T[]): T[] {
  const mame = new Set(stavajici.map((p) => p.id));
  return [...stavajici, ...nove.filter((p) => !mame.has(p.id))];
}
