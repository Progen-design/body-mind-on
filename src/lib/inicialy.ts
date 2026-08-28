/**
 * INICIÁLY ZE JMÉNA — náhrada za profilovou fotku, když žádná není.
 *
 * Chyba, kterou to opravuje: v hlavičce profilu se vykresloval alt text
 * „Jan Přikopa" místo obrázku. Nešlo o selhaný request — `avatarUrl` je
 * prázdný řetězec a `<img src="">` prohlížeč vyhodnotí jako rozbitý obrázek
 * a ukáže alt. Změřeno v produkci 25. 8. 2026: avatar nemá ANI JEDEN ze čtyř
 * účtů, ani v `auth.users.raw_user_meta_data`, ani v `profiles.avatar_url`.
 *
 * Rozbitý `<img>` vypadá jako chyba aplikace. Iniciály vypadají jako záměr.
 */

/** Kolik písmen se z jména vezme. Dvě jsou čitelná i v kolečku 28 px. */
const MAX_PISMEN = 2;

/**
 * Oddělovače slov ve jméně.
 *
 * Tečka, podtržítko a pomlčka jsou tu schválně: když účet jméno nemá,
 * dosazuje se část e-mailu před zavináčem (`AuthContext.naUcet`), takže
 * „jan.prikopa" má dát „JP", ne „J".
 */
const ODDELOVACE = /[\s._-]+/;

/**
 * Iniciály ze jména, nejvýš dvě písmena.
 *
 * Bere první písmeno prvního a posledního slova. U jednoslovného jména
 * vrací jedno písmeno — druhé není z čeho vzít a vymýšlet si ho by bylo
 * horší než kratší zkratka.
 *
 * Vrací prázdný řetězec, když ve jméně žádné písmeno není. Volající si pak
 * zvolí neutrální náhradu; tahle funkce si nic nevymýšlí.
 */
export function inicialy(jmeno: string | null | undefined): string {
  const slova = String(jmeno ?? '')
    .trim()
    .split(ODDELOVACE)
    // Číslo ani emoji nejsou iniciála. `\p{L}` bere i písmena s diakritikou.
    .map((slovo) => [...slovo].find((znak) => /\p{L}/u.test(znak)))
    .filter((znak): znak is string => Boolean(znak));

  if (slova.length === 0) return '';

  const vybrana = slova.length === 1
    ? [slova[0]]
    : [slova[0], slova[slova.length - 1]];

  return vybrana.slice(0, MAX_PISMEN).join('').toLocaleUpperCase('cs-CZ');
}
