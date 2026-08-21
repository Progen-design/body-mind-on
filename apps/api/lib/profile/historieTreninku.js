/**
 * SJEDNOCENÁ HISTORIE TRÉNINKŮ — ruční zápisy i tréninky z Apple Watch.
 *
 * PROČ TENHLE MODUL VZNIKL. „Historie tréninků“ četla jen tabulku `workouts`
 * (ruční zápis), zatímco „Statistiky a progres“ počítaly i tréninky z hodinek
 * z `apple_health_workouts`. U člověka, který nosí hodinky a ručně nic nezapisuje,
 * to znamenalo prázdnou historii vedle statistik hlásících pět tréninků a 505
 * minut. Dvě čísla o téže věci na jedné stránce, každé z jiného zdroje, a nikde
 * vysvětlení.
 *
 * ZÁZNAMY SE NESLUČUJÍ. Když si někdo trénink zapíše ručně a zároveň ho měly
 * hodinky, objeví se dvakrát — s odlišeným zdrojem. Sloučit je nejde poctivě:
 * ruční zápis nese jen datum (ne čas), takže shodu bychom museli hádat podle
 * dne a typu. Radši dva viditelné řádky se zdrojem než jeden, který někdy
 * schová skutečné měření.
 *
 * MODUL JE ČISTÝ — žádný React, žádné DOM. Kvůli `node --test` bez transpilace.
 */

/** @returns {number|null} */
function cisloNeboNull(hodnota) {
  if (hodnota === null || hodnota === undefined || hodnota === '') return null;
  const n = Number(hodnota);
  return Number.isFinite(n) ? n : null;
}

/** Milisekundy pro řazení. Nečitelné datum spadne na konec, ne na 1970. */
function casMs(hodnota) {
  if (!hodnota) return null;
  const t = new Date(hodnota).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Trénink z hodinek do společného tvaru.
 *
 * `label_cs` chodí z `workout_type_map` a je to jediný zdroj českých názvů —
 * druhá mapa tady by se s ním časem rozešla.
 */
function zHodinekNaZaznam(row) {
  const trvaniS = cisloNeboNull(row?.duration_s);
  return {
    klic: `hodinky:${row?.id || row?.external_id || row?.started_at}`,
    zdroj: 'hodinky',
    id: row?.id ?? null,
    cas: casMs(row?.started_at),
    datum: row?.started_at || row?.local_date || null,
    nazev: row?.label_cs || row?.workout_type || 'Trénink',
    minuty: trvaniS === null ? null : Math.round(trvaniS / 60),
    kcal: cisloNeboNull(row?.active_kcal) ?? cisloNeboNull(row?.total_kcal),
    tepPrumer: cisloNeboNull(row?.avg_hr),
    tepMax: cisloNeboNull(row?.max_hr),
    vzdalenostM: cisloNeboNull(row?.distance_m),
    poznamka: null,
    lzeSmazat: false,
  };
}

/**
 * Ruční zápis do společného tvaru.
 *
 * Minuty a popisek si modul nepočítá sám — dostane je zvenčí z `lib/workoutFormat.js`,
 * aby existoval jediný výklad `duration`/`notes`. Kdyby si je počítal, měli
 * bychom dvě pravdy o tom, jak dlouhý trénink byl.
 *
 * @param {object} w
 * @param {{minuty?: (w: object) => number|null, popisek?: (w: object) => string|null,
 *          nazev?: (w: object) => string|null, poznamka?: (w: object) => string|null}} pomocnici
 */
function rucniNaZaznam(w, pomocnici = {}) {
  const minuty = pomocnici.minuty ? cisloNeboNull(pomocnici.minuty(w)) : cisloNeboNull(w?.duration);
  return {
    klic: `rucni:${w?.id || w?.workout_date}`,
    zdroj: 'rucni',
    id: w?.id ?? null,
    cas: casMs(w?.workout_date),
    datum: w?.workout_date || null,
    nazev: (pomocnici.nazev ? pomocnici.nazev(w) : null) || w?.workout_name || 'Trénink',
    minuty,
    kcal: cisloNeboNull(w?.calories),
    tepPrumer: null,
    tepMax: null,
    vzdalenostM: null,
    popisek: pomocnici.popisek ? pomocnici.popisek(w) : null,
    poznamka: pomocnici.poznamka ? pomocnici.poznamka(w) : null,
    lzeSmazat: true,
  };
}

/**
 * Obě sady dohromady, od nejnovějšího.
 *
 * @param {{rucni?: object[], zHodinek?: object[], pomocnici?: object}} vstup
 * @returns {object[]}
 */
export function sjednocenaHistorie({ rucni = [], zHodinek = [], pomocnici = {} } = {}) {
  const zaznamy = [
    ...(Array.isArray(rucni) ? rucni : []).map((w) => rucniNaZaznam(w, pomocnici)),
    ...(Array.isArray(zHodinek) ? zHodinek : []).map(zHodinekNaZaznam),
  ];
  // Záznam bez čitelného data patří na konec, ne na začátek roku 1970.
  return zaznamy.sort((a, b) => {
    if (a.cas === null && b.cas === null) return 0;
    if (a.cas === null) return 1;
    if (b.cas === null) return -1;
    return b.cas - a.cas;
  });
}

/**
 * Souhrn pro podtitulek nad seznamem — kolik odkud.
 *
 * @param {object[]} zaznamy
 * @returns {{celkem: number, rucnich: number, zHodinek: number, minutyCelkem: number|null}}
 */
export function souhrnHistorie(zaznamy = []) {
  const list = Array.isArray(zaznamy) ? zaznamy : [];
  let minuty = 0;
  let mameMinuty = false;
  for (const z of list) {
    if (z?.minuty !== null && z?.minuty !== undefined) {
      minuty += z.minuty;
      mameMinuty = true;
    }
  }
  return {
    celkem: list.length,
    rucnich: list.filter((z) => z?.zdroj === 'rucni').length,
    zHodinek: list.filter((z) => z?.zdroj === 'hodinky').length,
    minutyCelkem: mameMinuty ? minuty : null,
  };
}

/** Vzdálenost v km, nebo null. Nula je platná hodnota, ne „nic“. */
export function kmNeboNull(metry) {
  const n = cisloNeboNull(metry);
  if (n === null || n <= 0) return null;
  return Math.round((n / 1000) * 10) / 10;
}
