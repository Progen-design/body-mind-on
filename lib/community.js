// /lib/community.js
/**
 * KOMUNITA — společná vrstva pro `api/community/*`.
 *
 * Endpointy fóra si dosud každý zvlášť tahal token z hlavičky, skládal
 * jméno autora a dopočítával avatary. S check-iny, fotkami a lajky by to
 * znamenalo čtyři kopie téhož. Tohle je jedno místo.
 *
 * FOTKY POSTAVY JSOU CITLIVÁ DATA — proto private bucket, signed URL
 * s krátkou platností a EXIF pryč (v EXIFu jezdí GPS souřadnice z telefonu).
 * Viz docs/BMON_KOMUNITA_NAVRH_2026-09-23.md.
 */
import sharp from 'sharp';
import crypto from 'node:crypto';
import { supabaseServer } from './supabaseServer.js';
import { DRUH_SOUHLASU_KOMUNITA, zapisSouhlasy } from './souhlasy.js';
import { requireCommunityAccess } from './membershipHelpers.js';

export const BUCKET_FOTEK = 'community-photos';

/** Kolik fotek unese jeden příspěvek. */
export const MAX_FOTEK = 4;

/** Nejdelší strana po zmenšení. Víc nemá na mobilu co zobrazovat. */
export const MAX_HRANA_PX = 1600;

/** Strop na jeden vstupní soubor — zrcadlí `file_size_limit` bucketu. */
export const MAX_BAJTU_FOTKY = 5 * 1024 * 1024;

/** Kolik příspěvků smí jeden člověk poslat za 24 h. */
export const MAX_PRISPEVKU_DENNE = 10;

/** Platnost signed URL. Delší znamená déle živý odkaz na cizí fotku. */
export const PLATNOST_URL_S = 3600;

const POVOLENE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Přihlášený uživatel z hlavičky, nebo chyba k odeslání.
 *
 * @param {import('next').NextApiRequest} req
 * @returns {Promise<{user?: object, status?: number, error?: string}>}
 */
export async function prihlasenyUzivatel(req) {
  const hlavicka = req.headers.authorization || '';
  const token = hlavicka.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { status: 401, error: 'Přihlas se.' };

  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data?.user) return { status: 401, error: 'Neplatná session. Přihlas se znovu.' };
  return { user: data.user };
}

/**
 * KDO SMÍ KOMUNITU ČÍST A KDO DO NÍ PSÁT. Pravidla jsou v
 * lib/membershipHelpers.js (`pravaKomunity`); tady se k nim přidává jen tým:
 * admin (`ADMIN_EMAILS`) projde vždy, i bez členství.
 *
 * @param {{ id: string, email?: string|null }} user
 * @param {{ psani?: boolean }} [opts]
 * @returns {Promise<{ allowed: true, prava: { cist: boolean, psat: boolean } } | { allowed: false, status: number, error: string }>}
 */
export async function overPravaKomunity(user, { psani = false } = {}) {
  if (jeAdminKomunity(user)) return { allowed: true, prava: { cist: true, psat: true } };
  return requireCommunityAccess(user.id, { psani });
}

/**
 * JMÉNO AUTORA = PŘEZDÍVKA, KTEROU SI ČLOVĚK ZVOLIL.
 *
 * `profiles.preferred_address` je pole „Jak ti máme říkat" (migrace
 * 20260921090000). Kdo si ho nevyplnil, vystupuje pod jménem z profilu —
 * e-mail se do komunity nedostane ani jako záloha, jen jeho část před
 * zavináčem, a i to až jako poslední možnost.
 *
 * @param {object} user
 * @returns {Promise<string>}
 */
export async function jmenoAutora(user) {
  const { data: profil } = await supabaseServer
    .from('profiles')
    .select('preferred_address')
    .eq('id', user.id)
    .maybeSingle();

  return vyberJmenoAutora({
    prezdivka: profil?.preferred_address,
    jmenoProfilu: user.user_metadata?.name,
    email: user.email,
  });
}

/**
 * Avatary pro sadu uživatelů, klíčované podle id.
 *
 * @param {string[]} userIds
 * @returns {Promise<Record<string, string|null>>}
 */
export async function avatary(userIds) {
  const unikatni = [...new Set((userIds || []).filter(Boolean))];
  if (unikatni.length === 0) return {};

  const { data } = await supabaseServer.from('profiles').select('id, avatar_url').in('id', unikatni);
  const podleId = {};
  (data || []).forEach((p) => {
    podleId[p.id] = p.avatar_url || null;
  });
  return podleId;
}

/**
 * Rozebere `data:` URL na typ a bajty.
 *
 * @param {unknown} dataUrl
 * @returns {{ mime: string, buffer: Buffer }}
 */
export function rozeberDataUrl(dataUrl) {
  const shoda = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || '').trim());
  if (!shoda) {
    const err = new Error('Fotka není v očekávaném formátu.');
    err.statusCode = 400;
    throw err;
  }

  const mime = shoda[1].toLowerCase();
  if (!POVOLENE_MIME.has(mime)) {
    const err = new Error('Fotka musí být JPEG, PNG nebo WebP.');
    err.statusCode = 400;
    throw err;
  }

  const buffer = Buffer.from(shoda[2], 'base64');
  if (buffer.length === 0) {
    const err = new Error('Fotka dorazila prázdná.');
    err.statusCode = 400;
    throw err;
  }
  if (buffer.length > MAX_BAJTU_FOTKY) {
    const err = new Error('Fotka je větší než 5 MB.');
    err.statusCode = 413;
    throw err;
  }
  return { mime, buffer };
}

/**
 * Zmenší, převede na JPEG a zbaví metadat.
 *
 * `.rotate()` bez argumentu otočí obrázek podle EXIF orientace DŘÍV, než se
 * metadata zahodí — jinak by fotky z telefonu ležely na boku. Sharp
 * metadata jinak nepřenáší (nevoláme `withMetadata()`), takže GPS z EXIFu
 * odchází s nimi.
 *
 * @param {Buffer} vstup
 * @returns {Promise<{ buffer: Buffer, width: number|null, height: number|null }>}
 */
export async function zmensAOcisti(vstup, hrana = MAX_HRANA_PX) {
  const { data, info } = await sharp(vstup)
    .rotate()
    .resize({ width: hrana, height: hrana, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, width: info?.width ?? null, height: info?.height ?? null };
}

/**
 * Zpracuje a nahraje fotky příspěvku; vrátí řádky pro `community_post_photos`.
 *
 * Při chybě uprostřed uklidí, co už nahrála — jinak by v bucketu zůstaly
 * soubory, na které nevede žádný řádek, a nikdo by je nenašel.
 *
 * @param {unknown[]} fotky base64 data URL
 * @param {{ userId: string, postId: string }} kam
 */
export async function nahrajFotky(fotky, { userId, postId }) {
  const seznam = Array.isArray(fotky) ? fotky.filter(Boolean) : [];
  if (seznam.length === 0) return [];
  if (seznam.length > MAX_FOTEK) {
    const err = new Error(`Najednou jde přidat nejvýš ${MAX_FOTEK} fotky.`);
    err.statusCode = 400;
    throw err;
  }

  const nahrane = [];
  try {
    for (let i = 0; i < seznam.length; i++) {
      const { buffer } = rozeberDataUrl(seznam[i]);
      const { buffer: jpeg, width, height } = await zmensAOcisti(buffer);
      const cesta = `${userId}/${postId}/${crypto.randomUUID()}.jpg`;

      const { error } = await supabaseServer.storage
        .from(BUCKET_FOTEK)
        .upload(cesta, jpeg, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;

      nahrane.push({
        post_id: postId,
        user_id: userId,
        storage_path: cesta,
        width,
        height,
        sort_order: i,
      });
    }
  } catch (err) {
    if (nahrane.length > 0) {
      await supabaseServer.storage
        .from(BUCKET_FOTEK)
        .remove(nahrane.map((f) => f.storage_path))
        .catch(() => {});
    }
    throw err;
  }

  const { data, error } = await supabaseServer
    .from('community_post_photos')
    .insert(nahrane)
    .select('id, post_id, storage_path, width, height, sort_order');

  if (error) {
    await supabaseServer.storage
      .from(BUCKET_FOTEK)
      .remove(nahrane.map((f) => f.storage_path))
      .catch(() => {});
    throw error;
  }
  return data || [];
}

/**
 * Fotky k příspěvkům jako podepsané URL, klíčované podle post_id.
 *
 * Bucket je private, takže bez podpisu se na soubor nedá dostat. Když se
 * podpis nepovede, fotka se vynechá — rozbitý obrázek v kartě je horší než
 * karta bez fotky.
 *
 * @param {string[]} postIds
 * @returns {Promise<Record<string, Array<{id: string, url: string, width: number|null, height: number|null}>>>}
 */
export async function fotkyPrispevku(postIds) {
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (ids.length === 0) return {};

  const { data: radky, error } = await supabaseServer
    .from('community_post_photos')
    .select('id, post_id, storage_path, width, height, sort_order')
    .in('post_id', ids)
    .order('sort_order', { ascending: true });

  if (error || !radky?.length) return {};

  const { data: podepsane } = await supabaseServer.storage
    .from(BUCKET_FOTEK)
    .createSignedUrls(radky.map((r) => r.storage_path), PLATNOST_URL_S);

  const urlPodleCesty = {};
  (podepsane || []).forEach((s) => {
    if (s?.signedUrl && !s.error) urlPodleCesty[s.path] = s.signedUrl;
  });

  const podlePrispevku = {};
  radky.forEach((r) => {
    const url = urlPodleCesty[r.storage_path];
    if (!url) return;
    if (!podlePrispevku[r.post_id]) podlePrispevku[r.post_id] = [];
    podlePrispevku[r.post_id].push({ id: r.id, url, width: r.width, height: r.height });
  });
  return podlePrispevku;
}

/**
 * Které z příspěvků už uživatel lajkoval.
 *
 * @param {string[]} postIds
 * @param {string} userId
 * @returns {Promise<Set<string>>}
 */
export async function lajkyUzivatele(postIds, userId) {
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const { data } = await supabaseServer
    .from('community_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', ids);

  return new Set((data || []).map((r) => r.post_id));
}

/**
 * Poslední zapsaná váha uživatele, nebo null.
 *
 * `body_measurements` je kanonická řada vážení — jediný zdroj pravdy
 * o aktuální váze (viz komentář u tabulky).
 *
 * @param {string} userId
 * @returns {Promise<number|null>}
 */
export async function posledniVaha(userId) {
  const { data } = await supabaseServer
    .from('body_measurements')
    .select('weight_kg, measured_at')
    .eq('user_id', userId)
    .not('weight_kg', 'is', null)
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const kg = Number(data?.weight_kg);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

/**
 * Překročil uživatel denní strop příspěvků?
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function prekrocilDenniLimit(userId) {
  const predDnem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseServer
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', predDnem);

  return jeNadDennimLimitem(count || 0);
}

/**
 * ADMIN KOMUNITY = PŘIHLÁŠENÝ ČLOVĚK, NE SDÍLENÝ TOKEN.
 *
 * `ADMIN_EMAILS` je čárkou oddělený seznam e-mailů. Kdo je v něm a je
 * přihlášený, může moderovat a jeho odpovědi nesou štítek „Tým BMON".
 *
 * PROČ NE ADMIN_TOKEN. Moderace i týmová odpověď zapisují do
 * `community_replies`, kde je `user_id` NOT NULL s cizím klíčem — pod
 * tokenem není kdo je autor. Token by se navíc musel zadávat zvlášť,
 * přenášet druhou hlavičkou a kdokoli, kdo ho jednou uvidí, by byl navždy
 * admin. E-mail se pozná ze session, kterou appka stejně má, a odebrání
 * práv je změna jedné env proměnné, ne rotace tajemství.
 *
 * Porovnává se bez ohledu na velikost písmen a s ořezanými mezerami —
 * v env proměnné bývá „a@b.cz, c@d.cz".
 *
 * @param {{ email?: string|null }|null} user
 * @returns {boolean}
 */
export function jeAdminKomunity(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email) return false;

  const povolene = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return povolene.includes(email);
}

/**
 * DŮVODY NAHLÁŠENÍ. Volný text je poslední možnost, ne první — z pěti slov
 * se moderuje líp než z prázdného pole.
 */
export const DUVODY_NAHLASENI = Object.freeze([
  { id: 'spam', label: 'Spam nebo reklama' },
  { id: 'urazky', label: 'Urážky' },
  { id: 'nebezpecne_rady', label: 'Nebezpečné rady (diety, léky)' },
  { id: 'jine', label: 'Jiné' },
]);

/**
 * Jméno, pod kterým člověk v komunitě vystupuje.
 *
 * ČISTÁ FUNKCE, aby šla otestovat bez databáze. Pořadí je záměrné:
 * přezdívka z „Jak ti máme říkat" → jméno z profilu → část e-mailu před
 * zavináčem. Celý e-mail se do komunity nedostane nikdy, ani jako záloha.
 *
 * @param {{ prezdivka?: string|null, jmenoProfilu?: string|null, email?: string|null }} zdroje
 * @returns {string}
 */
export function vyberJmenoAutora({ prezdivka, jmenoProfilu, email } = {}) {
  const z = String(prezdivka || '').trim();
  const j = String(jmenoProfilu || '').trim();
  const e = String(email || '').split('@')[0].trim();
  return (z || j || e || 'Člen').slice(0, 100);
}

/**
 * Překročil uživatel denní strop? Čistá funkce nad spočítaným počtem.
 *
 * @param {number} pocetZa24h
 * @returns {boolean}
 */
export function jeNadDennimLimitem(pocetZa24h) {
  const n = Number(pocetZa24h);
  return Number.isFinite(n) && n >= MAX_PRISPEVKU_DENNE;
}

/**
 * Potřebuje uživatel potvrdit pravidla, než smí přispět?
 *
 * Souhlas je ODVOLATELNÝ: `odvolano_at` s hodnotou znamená, že platný
 * souhlas neexistuje, i když řádek v logu zůstává (GDPR čl. 7 — odvolání
 * nesmí smazat důkaz, že souhlas kdysi byl).
 *
 * @param {Array<{odvolano_at?: string|null}>|null} zaznamySouhlasu
 * @returns {boolean}
 */
export function potrebujeSouhlasKomunity(zaznamySouhlasu) {
  const radky = Array.isArray(zaznamySouhlasu) ? zaznamySouhlasu : [];
  return !radky.some((r) => !r?.odvolano_at);
}

/**
 * Má uživatel platný souhlas s pravidly komunity?
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function maSouhlasKomunity(userId) {
  const { data, error } = await supabaseServer
    .from('souhlasy_uzivatelu')
    .select('odvolano_at')
    .eq('user_id', userId)
    .eq('druh', DRUH_SOUHLASU_KOMUNITA);

  // Výpadek dotazu NESMÍ souhlas předstírat — bez odpovědi se chováme,
  // jako by souhlas nebyl, a uživatel ho potvrdí znovu.
  if (error) {
    console.error('[community] souhlas', error);
    return false;
  }
  return !potrebujeSouhlasKomunity(data);
}

/**
 * Zapíše souhlas s pravidly komunity do `souhlasy_uzivatelu`.
 *
 * Jde přes `zapisSouhlasy()`, ne vlastním insertem — je to týž připisovací
 * log jako u obchodních podmínek a nemá smysl mít do jedné tabulky dvě
 * cesty. `povoleneDruhy` se předává proto, že `komunita` schválně není
 * v `DRUHY_SOUHLASU` (ten seznam vyžaduje registrace celý).
 *
 * @param {string} userId
 */
export async function zapisSouhlasKomunity(userId) {
  return zapisSouhlasy(userId, {
    druhy: [DRUH_SOUHLASU_KOMUNITA],
    zdroj: 'komunita',
    povoleneDruhy: [DRUH_SOUHLASU_KOMUNITA],
  });
}

/**
 * Smaže všechny fotky uživatele z bucketu, včetně podsložek příspěvků.
 *
 * KASKÁDA SOUBORY NEMAŽE. `auth.users` → `community_post_photos` kaskádu má,
 * ale objekty ve storage na ní nevisí — po smazání účtu by v private bucketu
 * zůstaly fotky postavy, ke kterým už nevede žádný řádek. Proto se maže
 * rekurzivně podle prefixu `{user_id}/`.
 *
 * Bucket jde předat — stejný úklid potřebují i fotky jídla mimo plán
 * (`quick-log-photos`, lib/quickFoodLog.js).
 *
 * @param {string} userId
 * @param {string} [bucket=BUCKET_FOTEK]
 * @returns {Promise<{ smazano: number }>}
 */
export async function smazFotkyUzivatele(userId, bucket = BUCKET_FOTEK) {
  if (!userId) return { smazano: 0 };

  const kosik = supabaseServer.storage.from(bucket);
  const kCesty = [];

  const projdi = async (prefix) => {
    const { data, error } = await kosik.list(prefix, { limit: 1000 });
    if (error || !data) return;

    for (const polozka of data) {
      const cesta = prefix ? `${prefix}/${polozka.name}` : polozka.name;
      // Složka nemá `id`; Supabase ji vrací jako položku bez metadat.
      if (polozka.id) kCesty.push(cesta);
      else await projdi(cesta);
    }
  };

  await projdi(String(userId));
  if (kCesty.length === 0) return { smazano: 0 };

  const { error } = await kosik.remove(kCesty);
  if (error) {
    console.error('[community] uklid fotek', bucket, userId, error.message);
    throw error;
  }
  return { smazano: kCesty.length };
}
