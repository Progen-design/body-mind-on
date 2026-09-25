// /lib/poukazy.js
/**
 * POUKAZY (tabulka public.vouchers) — „START – 1 měsíc zdarma".
 *
 * Fyzický poukaz má QR na /start?kod=<KÓD>. Kód se uplatní při registraci
 * a místo 7denního trialu dá `discount_days` (30) dní.
 *
 * TŘI PRAVIDLA:
 * 1. Uplatnění je JEDEN atomický UPDATE … WHERE code = $1 AND status =
 *    'unused' AND valid_until >= now() RETURNING *. Dva souběžné pokusy
 *    o tentýž kód: projde první, druhý dostane prázdný výsledek. Žádné
 *    „nejdřív SELECT, pak UPDATE" — mezi nimi by se kód dal uplatnit dvakrát.
 * 2. Poukaz není povinný. Neplatný, použitý nebo prošlý kód registraci
 *    nezastaví — člověk dostane běžných 7 dní a hlášku proč.
 * 3. Tabulka má RLS bez politik → čte i píše jen server se service klíčem.
 *
 * Čisté funkce (normalizace, důvod neplatnosti, konec trialu) jsou
 * testované v lib/__tests__/poukazy.test.mjs; I/O funkce berou klienta jako
 * parametr, ať jdou testovat s atrapou.
 */

/** Tvar kódu: tři čtveřice velkých písmen a číslic (např. ABCD-1E2F-G3HI). */
const TVAR_KODU = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Nejdelší vstup, který má smysl zpracovat — delší je překlep nebo útok. */
const MAX_DELKA_VSTUPU = 40;

export const HLASKY_POUKAZU = Object.freeze({
  tvar: 'Tohle nevypadá jako kód poukazu (má tvar XXXX-XXXX-XXXX).',
  neexistuje: 'Takový kód poukazu neznáme. Zkontroluj ho prosím.',
  pouzity: 'Tenhle poukaz už byl uplatněný.',
  zruseny: 'Tenhle poukaz byl zrušený.',
  expirovany: 'Platnost poukazu vypršela.',
  chyba: 'Poukaz se teď nepodařilo ověřit. Registrace proběhne s běžnými 7 dny zdarma.',
});

/**
 * Vstup od uživatele → kód v tvaru z databáze. Velká písmena, bez mezer,
 * chybějící pomlčky se doplní (12 znaků → XXXX-XXXX-XXXX). Nesmysl → null.
 *
 * @param {unknown} vstup
 * @returns {string|null}
 */
export function normalizujKod(vstup) {
  if (typeof vstup !== 'string') return null;
  const surovy = vstup.trim();
  if (!surovy || surovy.length > MAX_DELKA_VSTUPU) return null;

  const znaky = surovy.toUpperCase().replace(/[\s‐-―-]+/g, '');
  if (!/^[A-Z0-9]{12}$/.test(znaky)) return null;
  const kod = `${znaky.slice(0, 4)}-${znaky.slice(4, 8)}-${znaky.slice(8, 12)}`;
  return TVAR_KODU.test(kod) ? kod : null;
}

/**
 * Proč poukaz nejde uplatnit. null = jde.
 *
 * @param {{ status?: string, valid_until?: string|null } | null | undefined} radek
 * @param {number} [ted=Date.now()]
 * @returns {null | 'neexistuje' | 'pouzity' | 'zruseny' | 'expirovany'}
 */
export function duvodNeplatnosti(radek, ted = Date.now()) {
  if (!radek) return 'neexistuje';
  if (radek.status === 'redeemed') return 'pouzity';
  if (radek.status === 'void') return 'zruseny';
  if (radek.status === 'expired') return 'expirovany';
  if (radek.status !== 'unused') return 'neexistuje';
  // Stejně jako v UPDATE: valid_until musí být vyplněné a ne v minulosti.
  const konec = Date.parse(String(radek.valid_until || ''));
  if (!Number.isFinite(konec) || konec < ted) return 'expirovany';
  return null;
}

/**
 * Konec trialu: začátek + dny poukazu. Počty dní mimo 1–365 se nevezmou
 * vážně (chyba v datech nesmí dát rok zdarma ani nulu).
 *
 * @param {string} startedAt ISO
 * @param {number} dny
 * @returns {string} ISO
 */
export function konecTrialu(startedAt, dny) {
  const pocet = Number.isInteger(dny) && dny >= 1 && dny <= 365 ? dny : 30;
  return new Date(new Date(startedAt).getTime() + pocet * 86_400_000).toISOString();
}

/**
 * Jen ověření, nic nezapisuje — pro okamžitou odpověď v registraci, ještě
 * než účet existuje. Skutečné uplatnění dělá `uplatniPoukaz()`.
 *
 * @returns {Promise<{ platny: true, dny: number } | { platny: false, duvod: string, hlaska: string }>}
 */
export async function overPoukaz(db, vstup, ted = Date.now()) {
  const kod = normalizujKod(vstup);
  if (!kod) return { platny: false, duvod: 'tvar', hlaska: HLASKY_POUKAZU.tvar };

  const { data, error } = await db
    .from('vouchers')
    .select('status, valid_until, discount_days')
    .eq('code', kod)
    .maybeSingle();
  if (error) return { platny: false, duvod: 'chyba', hlaska: HLASKY_POUKAZU.chyba };

  const duvod = duvodNeplatnosti(data, ted);
  if (duvod) return { platny: false, duvod, hlaska: HLASKY_POUKAZU[duvod] };
  return { platny: true, dny: data.discount_days };
}

/**
 * ATOMICKÉ UPLATNĚNÍ. Jeden UPDATE s podmínkou na stav i platnost —
 * PostgREST z toho udělá `UPDATE … WHERE code = … AND status = 'unused'
 * AND valid_until >= … RETURNING …`. Když řádek podmínce nevyhoví (neexistuje,
 * použitý, prošlý, nebo ho mezitím uplatnil někdo jiný), nevrátí se nic
 * a zjistí se proč.
 *
 * @returns {Promise<{ uplatnen: true, kod: string, dny: number } | { uplatnen: false, duvod: string, hlaska: string }>}
 */
export async function uplatniPoukaz(db, vstup, userId, ted = new Date()) {
  const kod = normalizujKod(vstup);
  if (!kod) return { uplatnen: false, duvod: 'tvar', hlaska: HLASKY_POUKAZU.tvar };
  if (!userId) return { uplatnen: false, duvod: 'chyba', hlaska: HLASKY_POUKAZU.chyba };

  const tedIso = ted.toISOString();
  const { data, error } = await db
    .from('vouchers')
    .update({ status: 'redeemed', redeemed_by: userId, redeemed_at: tedIso, updated_at: tedIso })
    .eq('code', kod)
    .eq('status', 'unused')
    .gte('valid_until', tedIso)
    .select('code, discount_days, redeemed_by, redeemed_at')
    .maybeSingle();

  if (error) return { uplatnen: false, duvod: 'chyba', hlaska: HLASKY_POUKAZU.chyba };
  if (data) return { uplatnen: true, kod: data.code, dny: data.discount_days };

  // Nic se nezměnilo — zjistit proč, ať hláška sedí.
  const over = await overPoukaz(db, kod, ted.getTime());
  const duvod = over.platny ? 'pouzity' : over.duvod; // platný, ale UPDATE neprošel = souběh
  return { uplatnen: false, duvod, hlaska: HLASKY_POUKAZU[duvod] ?? HLASKY_POUKAZU.chyba };
}

/**
 * Vrácení poukazu, když se po uplatnění nepovedlo založit členství — jinak
 * by byl kód spotřebovaný a člověk by z něj nic neměl. Vrací se jen poukaz,
 * který uplatnil TENTÝŽ uživatel.
 */
export async function vratPoukaz(db, kod, userId) {
  const { error } = await db
    .from('vouchers')
    .update({ status: 'unused', redeemed_by: null, redeemed_at: null, updated_at: new Date().toISOString() })
    .eq('code', kod)
    .eq('status', 'redeemed')
    .eq('redeemed_by', userId);
  return !error;
}

/**
 * Uplatněný poukaz uživatele — pro `voucher_code` v metadatech Stripe
 * subscription. Délku trialu v checkoutu řeší `stripeTrialProCheckout()`
 * (lib/trialEligibility.js) z `memberships.trial_ends_at`, stejně pro poukaz
 * i běžný trial.
 *
 * @returns {Promise<{ code: string, discount_days: number } | null>}
 */
export async function poukazUzivatele(db, userId) {
  if (!userId) return null;
  const { data, error } = await db
    .from('vouchers')
    .select('code, discount_days')
    .eq('redeemed_by', userId)
    .eq('status', 'redeemed')
    .order('redeemed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return error ? null : data;
}
