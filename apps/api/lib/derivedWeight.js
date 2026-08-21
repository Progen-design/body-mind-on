/**
 * KROK 2: odvozená váha — jedno číslo, ze kterého se počítá kalorický cíl.
 *
 * PROČ MEDIÁN A NE PRŮMĚR. Jedno vážení v oblečení, po jídle nebo s jinou
 * kalibrací posune průměr o celý týden dopředu. Medián takové měření přebije
 * ostatními a spadne až tehdy, když se posune skutečně většina vážení.
 *
 * PROČ NULL PO 14 DNECH. Když data přestanou chodit, nabízí se spadnout zpátky
 * na registrační váhu z `body_metrics`. To je ale horší než nedělat nic:
 * registrační váha je stará měsíce, takže by se cíl skokem vrátil na hodnotu,
 * kterou uživatel dávno přerostl nebo podběhl — a vypadalo by to jako
 * regulérní přepočet. Vrací se proto null a volající NESMÍ cíl měnit.
 *
 * Ticha si všimne hlídka `zarizeni_mlci` v `system_health_alerts`.
 */

/** Hlavní okno: běžný stav. */
export const OKNO_DNI = 7;
/** Krajní okno: pod ním se ještě počítá, nad ním se vrací null. */
export const MAX_STARI_DNI = 14;
/** Kolik dní se načítá z DB — víc než se počítá, kvůli rozlišení důvodu. */
export const NACITACI_OKNO_DNI = 90;

const HODINA_MS = 60 * 60 * 1000;
const DEN_MS = 24 * HODINA_MS;

function asNum(value) {
  // POZOR NA `Number(null) === 0`. `body_measurements` smí mít řádek jen
  // s obvodem pasu a `weight_kg` NULL (viz CHECK body_measurements_has_value).
  // Bez téhle podmínky by se z takového řádku stala nula, propadla by do
  // mediánu a stáhla odvozenou váhu na polovinu — a kalorický cíl s ní.
  // Odhaleno testem „měření bez váhy se nepočítá".
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Medián. U sudého počtu průměr dvou prostředních — u váhy to dává smysl,
 * na rozdíl od „vezmi spodní".
 *
 * @param {number[]} hodnoty
 * @returns {number|null}
 */
export function median(hodnoty) {
  const serazene = (hodnoty || [])
    .map(asNum)
    .filter((n) => n !== null)
    .sort((a, b) => a - b);
  if (!serazene.length) return null;

  const stred = Math.floor(serazene.length / 2);
  return serazene.length % 2 === 1
    ? serazene[stred]
    : (serazene[stred - 1] + serazene[stred]) / 2;
}

/**
 * @typedef {object} OdvozenaVaha
 * @property {number|null} weight_kg    Medián, nebo null když data chybí.
 * @property {number} pocet_mereni      Počet měření v použitém okně.
 * @property {string|null} nejnovejsi_at ISO čas nejnovějšího měření.
 * @property {number|null} stari_hodin  Stáří nejnovějšího měření v hodinách.
 * @property {'7d'|'14d'|null} okno     Ze kterého okna medián vznikl.
 * @property {'ok'|'zadna_mereni'|'starsi_nez_14_dni'} duvod
 */

/**
 * Čistá funkce — žádná DB, aby se dala otestovat na hraničních případech.
 *
 * @param {Array<{measured_at: string|Date, weight_kg: number|string}>} mereni
 * @param {Date} [ted]
 * @returns {OdvozenaVaha}
 */
export function odvodVahu(mereni, ted = new Date()) {
  const nyni = ted instanceof Date ? ted.getTime() : new Date(ted).getTime();

  const platna = (mereni || [])
    .map((m) => ({ cas: new Date(m?.measured_at).getTime(), kg: asNum(m?.weight_kg) }))
    .filter((m) => Number.isFinite(m.cas) && m.kg !== null)
    // Měření z budoucnosti je chyba zdroje (špatná časová zóna, rozbité hodiny).
    // Kdyby se počítalo, jedno takové by drželo okno „čerstvé" donekonečna.
    .filter((m) => m.cas <= nyni)
    .sort((a, b) => b.cas - a.cas);

  const prazdna = {
    weight_kg: null,
    pocet_mereni: 0,
    nejnovejsi_at: null,
    stari_hodin: null,
    okno: null,
    duvod: 'zadna_mereni',
  };
  if (!platna.length) return prazdna;

  const nejnovejsi = platna[0];
  const stariHodin = Math.round(((nyni - nejnovejsi.cas) / HODINA_MS) * 10) / 10;
  const nejnovejsiIso = new Date(nejnovejsi.cas).toISOString();

  // Nic za 14 dní → null. Volající nechá cíl být.
  if (nyni - nejnovejsi.cas > MAX_STARI_DNI * DEN_MS) {
    return {
      ...prazdna,
      nejnovejsi_at: nejnovejsiIso,
      stari_hodin: stariHodin,
      duvod: 'starsi_nez_14_dni',
    };
  }

  const v7d = platna.filter((m) => nyni - m.cas <= OKNO_DNI * DEN_MS);
  // Když za poslední týden nic nedošlo, ale do 14 dnů ano, počítá se ze
  // širšího okna. Že je to nouzový režim, pozná volající podle `okno`.
  const pouzita = v7d.length ? v7d : platna.filter((m) => nyni - m.cas <= MAX_STARI_DNI * DEN_MS);

  return {
    weight_kg: median(pouzita.map((m) => m.kg)),
    pocet_mereni: pouzita.length,
    nejnovejsi_at: nejnovejsiIso,
    stari_hodin: stariHodin,
    okno: v7d.length ? '7d' : '14d',
    duvod: 'ok',
  };
}

/**
 * Načte měření z kanonické řady a vrátí odvozenou váhu.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} userId
 * @param {Date} [ted]
 * @returns {Promise<OdvozenaVaha>}
 */
export async function nactiOdvozenouVahu(db, userId, ted = new Date()) {
  // Načítá se ŠIRŠÍ okno, než kolik se počítá. Kdyby se filtrovalo rovnou na
  // 14 dnů, nešlo by rozlišit „uživatel nikdy nevážil" od „zařízení zmlklo" —
  // obojí by dorazilo jako prázdná množina. Ten rozdíl je přitom to jediné,
  // co v auditu a v alertu má cenu číst. Odříznutí na 14 dnech dělá
  // `odvodVahu`, tady jde jen o to, aby měla z čeho poznat rozdíl.
  const od = new Date((ted instanceof Date ? ted.getTime() : Date.now()) - NACITACI_OKNO_DNI * DEN_MS);

  const { data, error } = await db
    .from('body_measurements')
    .select('measured_at, weight_kg')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .gte('measured_at', od.toISOString())
    .order('measured_at', { ascending: false })
    .limit(200);

  if (error) {
    // Chyba čtení NENÍ „žádná měření". Kdyby se to slilo dohromady, výpadek DB
    // by vypadal jako mlčící váha a cíl by se tiše nechal být — což je sice
    // bezpečné, ale nikdo by se o problému nedozvěděl.
    throw new Error(`Načtení body_measurements selhalo: ${error.message}`);
  }

  return odvodVahu(data || [], ted);
}
