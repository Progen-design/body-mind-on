/**
 * JAK DÁVNO — naměřený odstup, ne nastavený interval.
 *
 * Chyba, kterou to opravuje: karta Apple Health psala „Odesílá tvůj iPhone
 * každou hodinu" a u synchronizace staré hodinu a půl svítil stav
 * „Aktuální". Obojí je konfigurovaný záměr, ne naměřený fakt.
 *
 * Změřeno v produkci 24. 8. 2026 08:20: ze 45 payloadů přišlo posledních 8
 * mezi 23:07:00 a 23:08:08 — tedy jedna dávka za 68 sekund, ne hodinová
 * úloha. Od 23:08 do 08:20 nepřišlo nic a propadlo devět hodinových slotů.
 * Spojení přitom bylo `active`, `last_sync_error` prázdný a všech 45 dávek
 * zpracovaných bez chyby. Aplikace tedy neměla z čeho poznat, že je něco
 * špatně — a taky nic nehlásila.
 *
 * Odstup od poslední dávky je jediné, co o té frekvenci opravdu víme.
 */

/** Milisekundy v minutě, hodině a dni. */
const MINUTA = 60_000;
const HODINA = 60 * MINUTA;
const DEN = 24 * HODINA;

/**
 * Odstup v milisekundách, nebo null, když se nedá spočítat.
 *
 * Null znamená „nevíme", ne nula. Čas z budoucnosti (rozejité hodiny
 * telefonu a serveru) se taky bere jako nevíme — tvrdit „před -3 min"
 * by bylo horší než mlčet.
 */
export function odstupMs(iso: string | null | undefined, ted: number = Date.now()): number | null {
  const t = Date.parse(String(iso ?? ''));
  if (!Number.isFinite(t)) return null;
  const rozdil = ted - t;
  return rozdil >= 0 ? rozdil : null;
}

/** Odstup v hodinách, nebo null. Pro prahy zastarání. */
export function odstupHodin(iso: string | null | undefined, ted: number = Date.now()): number | null {
  const ms = odstupMs(iso, ted);
  return ms === null ? null : ms / HODINA;
}

/**
 * Dny v 7. pádu, protože se to připojuje za „před".
 *
 * Jednotné číslo je „dnem", množné „dny" bez ohledu na počet — na rozdíl od
 * 1. pádu se tu 2–4 a 5+ neliší („před 2 dny" i „před 9 dny").
 */
function dny(pocet: number): string {
  return pocet === 1 ? '1 dnem' : `${pocet} dny`;
}

/**
 * „před 1 h 26 min" — kolik času uplynulo.
 *
 * Vrací prázdný řetězec, když se odstup spočítat nedá. Volající pak napíše,
 * že data nedorazila; tahle funkce si čas nevymýšlí.
 *
 * Zrno se s délkou zvětšuje. U dvou dnů nikoho nezajímají minuty a „před
 * 2 dny 3 h 14 min" se do řádku karty stejně nevejde.
 */
export function odstupText(iso: string | null | undefined, ted: number = Date.now()): string {
  const ms = odstupMs(iso, ted);
  if (ms === null) return '';

  if (ms < MINUTA) return 'právě teď';

  if (ms < HODINA) {
    return `před ${Math.floor(ms / MINUTA)} min`;
  }

  if (ms < DEN) {
    const hodin = Math.floor(ms / HODINA);
    const minut = Math.floor((ms % HODINA) / MINUTA);
    return minut === 0 ? `před ${hodin} h` : `před ${hodin} h ${minut} min`;
  }

  return `před ${dny(Math.floor(ms / DEN))}`;
}
