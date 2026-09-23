// /lib/quickFoodLog.js
/**
 * JÍDLO MIMO PLÁN — odhad kcal a maker z fotky nebo z textu.
 *
 * Plán říká, co jíst. Tohle zapisuje, co člověk snědl NAVÍC: vyfotí jídlo
 * (nebo ho popíše), gpt-4o-mini odhadne kcal a makra, uživatel odhad před
 * uložením potvrdí nebo opraví. Žádná databáze potravin — je to odhad
 * a UI ho tak i označuje.
 *
 * DVĚ VRSTVY:
 * - čisté funkce (validace vstupu, validace odpovědi modelu, limit, součty)
 *   — testované bez sítě v lib/__tests__/quickFoodLog.test.mjs,
 * - I/O (bucket, model) — volá je api/nutrition/quick-log/*.
 *
 * ODPOVĚĎ MODELU SE NEUKLÁDÁ NASLEPO. Model smí vrátit nesmysl (5 000 kcal
 * za jablko, záporné tuky, volný text místo JSON). `rozeberOdhadAI()` takovou
 * odpověď odmítne a do DB nic nejde — horší než „nepoznali jsme" je číslo,
 * které vypadá věrohodně a přičte se do denního součtu.
 */
import crypto from 'node:crypto';
import { supabaseServer } from './supabaseServer.js';

// `community.js` táhne `sharp` (nativní knihovna). Importuje se až ve
// funkcích, které fotku opravdu zpracují — TEDův kontext (coachChatKontext)
// potřebuje z tohoto modulu jen součet a nemá kvůli němu startovat sharp.
const komunita = () => import('./community.js');

const BUCKET_QUICK_LOG = 'quick-log-photos';
export const PURPOSE_QUICK_LOG = 'quick_food_log';
export const MODEL_QUICK_LOG = 'gpt-4o-mini';

/** Kolik zápisů smí jeden člověk za den. Každý stojí volání modelu. */
export const DENNI_LIMIT_ZAPISU = 20;

/** Jak dlouho po vytvoření jde odhad opravit. Zrcadlí RLS politiku v migraci. */
export const OKNO_OPRAVY_MIN = 30;

/** Strop kcal na jeden zápis — zrcadlí CHECK v migraci. */
export const MAX_KCAL = 3000;

/** Strop gramů jednoho makra. 3000 kcal čistého tuku je ~330 g. */
const MAX_MAKRO_G = 400;

/** Nejdelší textový popis jídla. Delší text není popis, ale esej. */
const MAX_DELKA_POPISU = 500;

/** Nejdelší strana fotky pro model. Víc detailu odhad nezlepší, jen zdraží. */
const HRANA_PRO_AI_PX = 1024;

/** Jak dlouho se čeká na model. Pak dostane uživatel „zkus znovu". */
export const TIMEOUT_MODELU_MS = 20_000;

const JISTOTY = new Set(['low', 'medium', 'high']);

export const HLASKA_NEROZPOZNANO = 'Nepodařilo se rozpoznat jídlo, zkus to prosím znovu nebo zadej ručně.';

const SYSTEM_PROMPT_QUICK_LOG = `Jsi odhadce nutričních hodnot v aplikaci Body & Mind ON.
Dostaneš fotku jídla nebo jeho krátký popis. Odhadni energii a makroživiny CELÉ porce, kterou vidíš nebo která je popsaná.

Vrať PŘÍSNĚ jeden JSON objekt, žádný text kolem, žádný markdown:
{"popis": "krátký český popis jídla, nejvýš 80 znaků", "kcal": celé číslo, "protein_g": číslo, "carbs_g": číslo, "fat_g": číslo, "confidence": "low" | "medium" | "high"}

Pravidla:
- Porci odhadni podle velikosti talíře, příboru a běžných porcí. Když velikost nejde poznat, počítej s běžnou porcí jednoho dospělého.
- confidence "high" jen u jednoznačného jídla se zřejmou porcí, "low" když si nejsi jistý jídlem nebo porcí.
- Gramy makroživin zaokrouhli na jedno desetinné místo, kcal na celé číslo.
- Když na fotce nebo v popisu jídlo není, vrať {"chyba": "nejde_o_jidlo"}.`;

// ---------------------------------------------------------------- čisté funkce

/** Dnešek v Praze jako YYYY-MM-DD — hranice dne pro součet i limit. */
export function denPraha(datum = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(datum);
}

/**
 * Půlnoc v Praze jako ISO — stejný výpočet jako denní strop zpráv TEDa
 * (api/coach-chat.js), ať se oba limity chovají stejně.
 */
export function zacatekDnePraha(datum = new Date()) {
  return `${denPraha(datum)}T00:00:00`;
}

/**
 * Je uživatel na denním limitu? Nespočitatelný počet (chyba dotazu) limit
 * nezavře — výpadek počítání nesmí zablokovat zápis.
 */
export function jeNadDennimLimitem(pocetDnes) {
  return typeof pocetDnes === 'number' && Number.isFinite(pocetDnes) && pocetDnes >= DENNI_LIMIT_ZAPISU;
}

/**
 * Vstup POST: PŘESNĚ jedno z `popis` / `foto_base64`.
 *
 * @returns {{ ok: true, zdroj: 'text', popis: string } | { ok: true, zdroj: 'foto', foto: string } | { ok: false, chyba: string }}
 */
export function overVstup(body) {
  const popis = typeof body?.popis === 'string' ? body.popis.trim() : '';
  const foto = typeof body?.foto_base64 === 'string' ? body.foto_base64.trim() : '';

  if (popis && foto) return { ok: false, chyba: 'Pošli buď fotku, nebo popis — ne obojí.' };
  if (!popis && !foto) return { ok: false, chyba: 'Vyfoť jídlo, nebo napiš, co jsi snědl/a.' };

  if (popis) {
    if (popis.length > MAX_DELKA_POPISU) {
      return { ok: false, chyba: `Popis je moc dlouhý — stačí ${MAX_DELKA_POPISU} znaků.` };
    }
    return { ok: true, zdroj: 'text', popis };
  }

  // Bez hlavičky data URL bereme jako JPEG; skutečný formát pozná sharp
  // při zpracování a rozeberDataUrl() hlídá povolené typy i 5 MB.
  const dataUrl = foto.startsWith('data:') ? foto : `data:image/jpeg;base64,${foto}`;
  return { ok: true, zdroj: 'foto', foto: dataUrl };
}

function nezaporneCislo(hodnota, strop) {
  const n = typeof hodnota === 'string' && hodnota.trim() !== '' ? Number(hodnota.replace(',', '.')) : hodnota;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > strop) return null;
  return n;
}

const naDesetiny = (n) => Math.round(n * 10) / 10;

/**
 * Odpověď modelu → odhad k uložení, nebo důvod odmítnutí.
 *
 * Odmítá: ne-JSON, JSON s textem kolem, chybějící nebo nečíselné hodnoty,
 * kcal mimo 0–3000, záporná makra. `nejde_o_jidlo` je samostatný důvod —
 * UI na něj odpoví jinak než na rozbitou odpověď.
 *
 * @param {unknown} raw text odpovědi modelu
 * @returns {{ ok: true, odhad: { popis: string, kcal: number, protein_g: number, carbs_g: number, fat_g: number, confidence: string|null } }
 *   | { ok: false, duvod: 'neni_json' | 'nejde_o_jidlo' | 'mimo_rozsah' | 'chybi_pole' }}
 */
export function rozeberOdhadAI(raw) {
  let data;
  try {
    data = JSON.parse(String(raw ?? ''));
  } catch {
    return { ok: false, duvod: 'neni_json' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, duvod: 'neni_json' };
  if (data.chyba === 'nejde_o_jidlo') return { ok: false, duvod: 'nejde_o_jidlo' };

  const pole = ['kcal', 'protein_g', 'carbs_g', 'fat_g'];
  if (pole.some((k) => data[k] === undefined || data[k] === null || data[k] === '')) {
    return { ok: false, duvod: 'chybi_pole' };
  }

  const kcal = nezaporneCislo(data.kcal, MAX_KCAL);
  const protein = nezaporneCislo(data.protein_g, MAX_MAKRO_G);
  const carbs = nezaporneCislo(data.carbs_g, MAX_MAKRO_G);
  const fat = nezaporneCislo(data.fat_g, MAX_MAKRO_G);
  if (kcal === null || protein === null || carbs === null || fat === null) {
    return { ok: false, duvod: 'mimo_rozsah' };
  }

  const popis = typeof data.popis === 'string' ? data.popis.trim().slice(0, 200) : '';
  const confidence = typeof data.confidence === 'string' && JISTOTY.has(data.confidence) ? data.confidence : null;

  return {
    ok: true,
    odhad: {
      popis,
      kcal: Math.round(kcal),
      protein_g: naDesetiny(protein),
      carbs_g: naDesetiny(carbs),
      fat_g: naDesetiny(fat),
      confidence,
    },
  };
}

/**
 * Oprava odhadu od uživatele (PATCH). Aspoň jedno pole, každé v rozsahu.
 *
 * @returns {{ ok: true, zmena: Record<string, number|string> } | { ok: false, chyba: string }}
 */
export function overOpravu(body) {
  const zmena = {};
  const rozsahy = { kcal: MAX_KCAL, protein_g: MAX_MAKRO_G, carbs_g: MAX_MAKRO_G, fat_g: MAX_MAKRO_G };

  for (const [klic, strop] of Object.entries(rozsahy)) {
    if (body?.[klic] === undefined) continue;
    const n = nezaporneCislo(body[klic], strop);
    if (n === null) {
      return { ok: false, chyba: klic === 'kcal' ? `Kalorie musí být 0–${MAX_KCAL}.` : `Gramy musí být 0–${MAX_MAKRO_G}.` };
    }
    zmena[klic] = klic === 'kcal' ? Math.round(n) : naDesetiny(n);
  }

  if (typeof body?.popis === 'string') {
    const popis = body.popis.trim();
    if (popis.length > MAX_DELKA_POPISU) return { ok: false, chyba: 'Popis je moc dlouhý.' };
    zmena.popis = popis;
  }

  if (Object.keys(zmena).length === 0) return { ok: false, chyba: 'Není co opravit.' };
  return { ok: true, zmena };
}

/** Jde záznam ještě opravit? Stejné okno jako RLS politika v migraci. */
export function jeVOknuOpravy(createdAt, ted = Date.now()) {
  const t = Date.parse(String(createdAt || ''));
  return Number.isFinite(t) && ted - t <= OKNO_OPRAVY_MIN * 60_000;
}

/**
 * Součet zápisů mimo plán. Jeden výpočet pro UI i pro TEDa — dvě verze
 * by se dřív nebo později rozešly.
 *
 * @param {Array<{kcal?: unknown, protein_g?: unknown, carbs_g?: unknown, fat_g?: unknown}>} logy
 */
export function soucetLogu(logy) {
  const soucet = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, pocet: 0 };
  for (const l of Array.isArray(logy) ? logy : []) {
    soucet.kcal += Number(l?.kcal) || 0;
    soucet.protein_g += Number(l?.protein_g) || 0;
    soucet.carbs_g += Number(l?.carbs_g) || 0;
    soucet.fat_g += Number(l?.fat_g) || 0;
    soucet.pocet += 1;
  }
  return {
    ...soucet,
    kcal: Math.round(soucet.kcal),
    protein_g: naDesetiny(soucet.protein_g),
    carbs_g: naDesetiny(soucet.carbs_g),
    fat_g: naDesetiny(soucet.fat_g),
  };
}

/**
 * Zprávy pro model. U fotky jde obrázek s `detail: 'low'` — na odhad porce
 * stačí a stojí zlomek tokenů oproti plnému rozlišení.
 */
export function sestavZpravy(vstup) {
  const obsah = vstup.zdroj === 'foto'
    ? [
      { type: 'text', text: 'Odhadni jídlo na fotce.' },
      { type: 'image_url', image_url: { url: vstup.dataUrlProAI, detail: 'low' } },
    ]
    : `Snědl/a jsem: ${vstup.popis}`;

  return [
    { role: 'system', content: SYSTEM_PROMPT_QUICK_LOG },
    { role: 'user', content: obsah },
  ];
}

// ---------------------------------------------------------------- I/O

/**
 * Zmenší fotku, zbaví ji EXIFu (GPS) a nahraje do private bucketu.
 * Vrací cestu a zmenšenou verzi jako data URL pro model.
 */
export async function nahrajFotkuJidla(dataUrl, userId) {
  const { rozeberDataUrl, zmensAOcisti } = await komunita();
  const { buffer } = rozeberDataUrl(dataUrl);
  const { buffer: jpeg } = await zmensAOcisti(buffer, HRANA_PRO_AI_PX);
  const cesta = `${userId}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabaseServer.storage
    .from(BUCKET_QUICK_LOG)
    .upload(cesta, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  return { cesta, dataUrlProAI: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
}

/** Smaže jednu fotku. Selhání jen zaloguje — osiřelý soubor je menší zlo. */
export async function smazFotkuJidla(cesta) {
  if (!cesta) return;
  const { error } = await supabaseServer.storage.from(BUCKET_QUICK_LOG).remove([cesta]);
  if (error) console.error('[quick-log] mazani fotky', cesta, error.message);
}

/** Podepsané URL k fotkám (platnost 1 h), klíčované cestou. */
export async function podepsaneUrl(cesty) {
  const seznam = (cesty || []).filter(Boolean);
  if (seznam.length === 0) return {};
  const { data, error } = await supabaseServer.storage.from(BUCKET_QUICK_LOG).createSignedUrls(seznam, 3600);
  if (error || !data) return {};
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

/** Smazání účtu: celý prefix `{user_id}/` v bucketu fotek jídla. */
export async function smazFotkyJidlaUzivatele(userId) {
  const { smazFotkyUzivatele } = await komunita();
  return smazFotkyUzivatele(userId, BUCKET_QUICK_LOG);
}
