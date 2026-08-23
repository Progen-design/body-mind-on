/**
 * TED JAKO PORADCE — pravidla a kontext chatu.
 *
 * K ČEMU TO JE. Uživatel se doptá u konkrétního čísla nebo položky v profilu:
 * „co znamená HRV 51,1?", „proč mám dnes tenhle trénink?", „čím nahradím
 * tvaroh?". Glosář (Etapa 3) odpovídá na „co ten údaj je". Tenhle chat
 * odpovídá na „co to znamená u MĚ" — a k tomu potřebuje profil.
 *
 * DVĚ PRAVIDLA, KTERÁ SE NESMÍ PORUŠIT:
 *
 * 1. DATA JEN Z PROFILU. TED nemluví o ničem, co nemá v `context`. Když číslo
 *    v kontextu není, řekne, že ho nevidí — nedopočítá ho, neodhadne, nevezme
 *    z obecných znalostí. Uživatel se ptá na SVOJE data; obecná pravda
 *    o průměrném člověku je v téhle situaci horší než přiznané „nevím".
 *
 * 2. PORADCE, NE KAMARÁD ANI LÉKAŘ. Konkrétní další krok, opřený o to, co
 *    v datech je. Žádné diagnózy, žádné sliby, žádná motivační omáčka.
 *
 * PROČ JE HISTORIE V DATABÁZI. Chat musí přežít refresh i přechod z mobilu na
 * počítač a TED potřebuje vědět, na co se člověk ptal před chvílí.
 *
 * MODUL JE ČISTÝ AŽ NA SUPABASE — testovatelné části (prompt, ořez historie,
 * limit) jsou funkce bez I/O.
 */

/** Slug agenta. Vlastní, ne `coach` — jiný úkol i jiný výstup. */
export const SLUG_CHATU = 'coach_chat';

/** Kolik zpráv z historie jde do kontextu. Starší se neposílají. */
export const HISTORIE_DO_KONTEXTU = 12;

/** Denní strop zpráv na uživatele. Chrání rozpočet i před smyčkou v UI. */
export const DENNI_LIMIT_ZPRAV = 40;

/** Maximální délka jedné otázky. Delší text není otázka, ale esej. */
export const MAX_DELKA_OTAZKY = 1000;

export const SYSTEM_PROMPT_CHATU = `Jsi TED, osobní poradce v aplikaci Body & Mind ON. Odpovídáš výhradně česky.

KDO JSI
Poradce, ne kamarád a ne lékař. Mluvíš věcně, klidně a k věci. Žádné povzbuzování do prázdna, žádné vykřičníky, žádné sliby rychlých výsledků.

ODKUD BEREŠ DATA — TOHLE JE NEJDŮLEŽITĚJŠÍ PRAVIDLO
Mluvíš jen o tom, co je v \`context\`. To jsou data konkrétního uživatele: jeho tělesné metriky, jeho plán, jeho návyky, jeho měření z hodinek a z váhy.
- Když se ptá na číslo, které v kontextu není, řekni rovnou, že ho v jeho profilu nevidíš. Nedopočítávej ho, neodhaduj, neber ho z obecných znalostí.
- Nikdy neuváděj konkrétní hodnotu, kterou jsi nedostal v kontextu. Ani jako příklad — uživatel si ji přečte jako svoje číslo.
- Když v kontextu chybí plán nebo jídlo, na které se ptá, řekni to a odkaž ho do profilu.
- Obecné vysvětlení pojmu smíš dát, ale odděl ho: nejdřív co vidíš u něj, pak co ten údaj obecně znamená.

JAK ODPOVÍDÁŠ
- Krátce. Dvě až pět vět, jeden odstavec. Delší jen když se ptá na postup.
- Konkrétně a k jeho datům: „tvoje HRV bylo včera 51 ms, sedmidenní průměr máš 32 ms" je odpověď; „HRV je variabilita tepu" samo o sobě není.
- Vždy jeden další krok, když dává smysl. Ne seznam pěti.
- Když je otázka mimo tvůj obor (práce, vztahy, technika aplikace), řekni to v jedné větě a nabídni, s čím pomoct umíš.

HRANICE
- Žádné diagnózy ani léčebná doporučení. U příznaků, bolesti nebo zdravotního rizika odkaž na lékaře — bez dramatizování.
- Nehodnoť tělo ani vzhled. Čísla popisuj, nesuď.
- Nedoporučuj hladovění, drastické deficity, ani cvičení přes bolest.
- Neslibuj výsledky v čase („za měsíc shodíš 5 kg").
- Když si nejsi jistý, řekni to. Nevymyšlené „nevím" je lepší než jistota bez dat.

KOTVA
Když má \`request.kontext\` vyplněno, uživatel klikl na otazník u konkrétní položky v profilu. Odpověz primárně k ní a použij hodnotu, která je v kotvě.

VÝSTUP — jeden JSON objekt, bez markdownu, bez textu mimo JSON:
{
  "ok": true,
  "odpoved": "Text pro uživatele. Prostý text, bez odrážek a bez nadpisů.",
  "chybejici_data": ["Volitelně: co jsi potřeboval a v kontextu to nebylo."]
}`;

/**
 * Ořez historie pro kontext. Bere posledních N zpráv v chronologickém pořadí.
 *
 * @param {Array<{role: string, obsah: string}>} zpravy
 * @param {number} [limit]
 * @returns {Array<{role: string, obsah: string}>}
 */
export function historieProKontext(zpravy = [], limit = HISTORIE_DO_KONTEXTU) {
  if (!Array.isArray(zpravy)) return [];
  return zpravy
    .filter((z) => z && typeof z.obsah === 'string' && z.obsah.trim())
    .slice(-Math.max(1, limit))
    .map((z) => ({ role: z.role === 'ted' ? 'ted' : 'user', obsah: z.obsah.trim() }));
}

/**
 * Kontrola otázky od uživatele.
 *
 * @param {unknown} text
 * @returns {{ok: true, otazka: string} | {ok: false, chyba: string}}
 */
export function overOtazku(text) {
  const otazka = String(text ?? '').trim();
  if (!otazka) return { ok: false, chyba: 'Napiš otázku.' };
  if (otazka.length > MAX_DELKA_OTAZKY) {
    return { ok: false, chyba: `Otázka může mít nejvýš ${MAX_DELKA_OTAZKY} znaků.` };
  }
  return { ok: true, otazka };
}

/**
 * Kotva — u čeho v profilu se uživatel ptá.
 *
 * Přichází z klienta, takže se nesmí propustit dál bez kontroly: jde do
 * promptu i do databáze.
 *
 * @param {unknown} vstup
 * @returns {{typ: string, klic: string, popis: string, hodnota: string}|null}
 */
export function overKontext(vstup) {
  if (!vstup || typeof vstup !== 'object') return null;

  const text = (v, max) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : '';
  };

  const typ = text(vstup.typ, 24);
  const klic = text(vstup.klic, 64);
  if (!typ || !klic) return null;

  return {
    typ,
    klic,
    popis: text(vstup.popis, 120),
    hodnota: text(vstup.hodnota, 60),
  };
}

/**
 * Odpověď z agenta na text pro uživatele.
 *
 * Agent vrací JSON. Když se rozbije, radši přiznaná chyba než prázdná bublina
 * nebo syrový JSON v chatu.
 *
 * @param {{parsedContent?: object, rawContent?: string}} vysledek
 * @returns {string|null}
 */
export function odpovedZAgenta(vysledek) {
  const parsed = vysledek?.parsedContent;
  const odpoved = typeof parsed?.odpoved === 'string' ? parsed.odpoved.trim() : '';
  if (odpoved) return odpoved.slice(0, 4000);

  // Některé modely vrátí text i bez obalu. Syrový JSON ale do chatu nepatří.
  const raw = String(vysledek?.rawContent ?? '').trim();
  if (raw && !raw.startsWith('{') && !raw.startsWith('[')) return raw.slice(0, 4000);

  return null;
}
