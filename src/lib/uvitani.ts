// Jednorázová uvítací karta „Tvůj plán je připravený" — PROMPT_DNES_WOW.md.
//
// Ukáže se jen první dva dny programu a jen dokud ji člověk nezavře.
// Zavření se pamatuje v localStorage — ten může chybět nebo házet výjimku
// (soukromé okno, zablokovaná data, náhled), proto je každé čtení a zápis
// obalené a bez úložiště se karta prostě ukáže znovu, nic se nerozbije.

export const KLIC_UVITANI = 'bmon:uvitani-zavreno';

/** Den 1 a 2 programu; `null` (neznámé datum registrace) = neukazovat. */
export function jeUvitaciDen(denProgramu: number | null): boolean {
  return denProgramu === 1 || denProgramu === 2;
}

type Uloziste = Pick<Storage, 'getItem' | 'setItem'>;

function vychoziUloziste(): Uloziste | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function uvitaniZavreno(uloziste: Uloziste | null = vychoziUloziste()): boolean {
  try {
    return uloziste?.getItem(KLIC_UVITANI) === '1';
  } catch {
    return false;
  }
}

export function zavriUvitani(uloziste: Uloziste | null = vychoziUloziste()): void {
  try {
    uloziste?.setItem(KLIC_UVITANI, '1');
  } catch {
    // Bez úložiště se karta po obnovení ukáže znovu — lepší než výjimka.
  }
}

/** Ukázat kartu? */
export function ukazUvitaciKartu(denProgramu: number | null, uloziste: Uloziste | null = vychoziUloziste()): boolean {
  return jeUvitaciDen(denProgramu) && !uvitaniZavreno(uloziste);
}
