/**
 * VIZUÁLNÍ JAZYK PROFILU (návrh v2, srpen 2026) — jedno místo pro třídy.
 *
 * Návrh je psaný v Tailwind utility třídách a stejné kombinace se opakují
 * v každé kartě. Držet je tady místo v osmi souborech znamená, že se odstín
 * pozadí nebo poloměr rohu mění na jednom řádku, ne hledáním po repu.
 *
 * TOHLE JSOU JEN ŘETĚZCE TŘÍD, ŽÁDNÁ LOGIKA. Modul je čistý a bez závislostí,
 * takže ho jde importovat i z komponent, které běží na serveru.
 *
 * Tailwind je v aplikaci zapojený bez Preflightu (viz styles/globals.css),
 * takže tyhle třídy fungují vedle stávajícího styled-jsx, aniž by ho přepsaly.
 */

/** Základní skleněná karta — gradient, rozostřené pozadí, jemný rám. */
export const KARTA = 'rounded-2xl bg-gradient-to-b from-[#131622]/90 to-[#0e111a]/95 '
  + 'backdrop-blur-xl border border-neutral-800/90 shadow-[0_0_20px_rgba(0,0,0,0.5)] '
  + 'transition-all duration-300';

/** Karta, která reaguje na najetí myší — pro dlaždice, na které se dá klikat. */
export const KARTA_HOVER = `${KARTA} hover:border-[#00f2fe]/30`;

/** Vnořený panel uvnitř karty (souhrn tréninku, blok maker). */
export const PANEL = 'rounded-xl bg-[#171c2a]/80 border border-neutral-800/80';

/** Štítek typu jídla / stavu. Barvu si volající dodá přes `--akcent`. */
export const STITEK = 'text-[11px] font-bold px-2 py-0.5 rounded-md tracking-wide uppercase';

/** Sekundární tlačítko — tiché, na tmavém podkladu. */
export const TLACITKO = 'inline-flex items-center justify-center gap-2 rounded-xl '
  + 'bg-[#11141e] hover:bg-[#181d2c] text-neutral-300 hover:text-white '
  + 'font-medium text-sm border border-neutral-700/70 hover:border-neutral-500 '
  + 'transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

/** Primární akce — svítivá, jedna na sekci. */
export const TLACITKO_HLAVNI = 'inline-flex items-center justify-center gap-2 rounded-xl '
  + 'bg-[#00f2fe]/15 hover:bg-[#00f2fe]/25 text-[#baf6ff] font-bold text-sm '
  + 'border border-[#00f2fe]/45 shadow-[0_0_15px_rgba(0,242,254,0.15)] '
  + 'transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

/** Splněno / hotovo. Zelená je v celém profilu vyhrazená pro tenhle význam. */
export const HOTOVO_RAM = 'border-[#39ff14]/40 shadow-[0_0_18px_rgba(57,255,20,0.12)]';
export const HOTOVO_TEXT = 'text-[#39ff14]';

/**
 * Barvy maker. Drží se návrhu a používají je jak čipy, tak pruh poměru —
 * kdyby se rozešly, jedno jídlo by mělo bílkoviny ve dvou různých barvách.
 */
export const MAKRO = Object.freeze({
  bilkoviny: { barva: '#00f2fe', trida: 'bg-[#00f2fe]', text: 'text-[#00f2fe]' },
  sacharidy: { barva: '#22c55e', trida: 'bg-[#22c55e]', text: 'text-[#22c55e]' },
  tuky: { barva: '#84cc16', trida: 'bg-[#84cc16]', text: 'text-[#84cc16]' },
});

/**
 * Akcent podle typu jídla.
 *
 * Návrh v2 má všechno azurové, ale barevné odlišení typů jídla je vlastní
 * požadavek z dřívějška (snídaně/oběd/svačina/večeře na první pohled) a nese
 * informaci. Zůstává tedy zachované — jen přeloženo do jazyka nového návrhu.
 *
 * Bere anglický klíč i český popisek: ze `structured_plan_json` chodí
 * `breakfast`, z parsovaného HTML plánu „Snídaně“.
 *
 * @param {string} typ
 * @returns {{akcent: string, ram: string, stitek: string, pruh: string}}
 */
export function akcentJidla(typ) {
  const t = String(typ || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (t.startsWith('breakfast') || t.startsWith('snidan')) {
    return { akcent: '#f59e0b', ram: 'border-l-[#f59e0b]', stitek: 'bg-[#f59e0b]/15 text-[#fcd34d]', pruh: 'bg-[#f59e0b]' };
  }
  if (t.startsWith('snack') || t.startsWith('svacin')) {
    return { akcent: '#22d3ee', ram: 'border-l-[#22d3ee]', stitek: 'bg-[#22d3ee]/15 text-[#a5f3fc]', pruh: 'bg-[#22d3ee]' };
  }
  if (t.startsWith('lunch') || t.startsWith('obed')) {
    return { akcent: '#a78bfa', ram: 'border-l-[#a78bfa]', stitek: 'bg-[#a78bfa]/15 text-[#ddd6fe]', pruh: 'bg-[#a78bfa]' };
  }
  if (t.startsWith('dinner') || t.startsWith('vecer')) {
    return { akcent: '#fb7185', ram: 'border-l-[#fb7185]', stitek: 'bg-[#fb7185]/15 text-[#fecdd3]', pruh: 'bg-[#fb7185]' };
  }
  return { akcent: '#94a3b8', ram: 'border-l-[#94a3b8]', stitek: 'bg-[#94a3b8]/15 text-[#cbd5e1]', pruh: 'bg-[#94a3b8]' };
}

/**
 * Podíly maker na energii, zaokrouhlené tak, aby daly dohromady 100 %.
 *
 * Prosté zaokrouhlení tří podílů dá občas 99 nebo 101 %, což u pruhu vytvoří
 * viditelnou mezeru nebo přetečení. Zbytek se proto dorovná na největší
 * složku — ta relativní chybu unese nejlíp.
 *
 * @param {{protein_g?: number, carbs_g?: number, fat_g?: number}} makra
 * @returns {{bilkoviny: number, sacharidy: number, tuky: number}|null}
 */
export function podilyMaker(makra) {
  // Destrukturace s výchozí hodnotou zachytí jen `undefined`, ne `null` —
  // a null sem chodí z API běžně.
  const { protein_g: b, carbs_g: s, fat_g: t } = makra || {};
  const kcal = {
    bilkoviny: (Number(b) || 0) * 4,
    sacharidy: (Number(s) || 0) * 4,
    tuky: (Number(t) || 0) * 9,
  };
  const celkem = kcal.bilkoviny + kcal.sacharidy + kcal.tuky;
  if (!Number.isFinite(celkem) || celkem <= 0) return null;

  const podily = {
    bilkoviny: Math.round((kcal.bilkoviny / celkem) * 100),
    sacharidy: Math.round((kcal.sacharidy / celkem) * 100),
    tuky: Math.round((kcal.tuky / celkem) * 100),
  };
  const rozdil = 100 - (podily.bilkoviny + podily.sacharidy + podily.tuky);
  if (rozdil !== 0) {
    const nejvetsi = Object.keys(podily).reduce((a, k) => (podily[k] > podily[a] ? k : a), 'bilkoviny');
    podily[nejvetsi] += rozdil;
  }
  return podily;
}

/* ── NEONOVÁ VARIANTA (návrh v3, srpen 2026) ─────────────────────────────────
 *
 * Přidané, ne přepsané. Základní tokeny výš jsou tlumené záměrně — většina
 * profilu je čtení, ne podívaná, a kdyby svítilo všechno, nesvítilo by nic.
 * Neonová varianta se používá tam, kde má prvek přitáhnout oko: hlavní metrika,
 * aktivní stav, splněná věc.
 *
 * Barvy jsou dvě a mají význam:
 *   azurová #00f2fe — aktivní, vybrané, hlavní údaj
 *   limetková #39ff14 — hotovo, dobrý trend
 */

/** Azurová a limetková v jednom místě, ať se odstíny nerozejdou. */
export const NEON = Object.freeze({
  azurova: '#00f2fe',
  limetka: '#39ff14',
});

/** Karta s azurovým rámem a září — pro prvek, který má být vidět první. */
export const KARTA_NEON = `${KARTA} border-[#00f2fe]/30 shadow-[0_0_20px_rgba(0,242,254,0.08)] `
  + 'hover:border-[#00f2fe]/60 hover:shadow-[0_0_25px_rgba(0,242,254,0.15)]';

/** Tlumená karta, která se při najetí rozsvítí. Pro dlaždice v mřížce. */
export const KARTA_NEON_JEMNA = `${KARTA} hover:border-[#00f2fe]/40 hover:shadow-[0_0_20px_rgba(0,242,254,0.1)]`;

/** Rámeček ikony v trendové pilulce — barva podle významu. */
export const IKONA_DOBRE = 'border-[#39ff14]/40 bg-[#14291f] shadow-[0_0_10px_rgba(57,255,20,0.2)]';
export const IKONA_SPATNE = 'border-amber-400/40 bg-[#2a2113]';
export const IKONA_NEUTRALNI = 'border-neutral-700 bg-neutral-900';

/** Aktivní přepínač (rozsahy grafu, záložky). */
export const PREPINAC_AKTIVNI = 'border border-[#00f2fe]/40 bg-[#1b2233] text-[#00f2fe] '
  + 'shadow-[0_0_8px_rgba(0,242,254,0.2)]';

/**
 * AMBIENTNÍ POZADÍ — tři rozostřené kruhy za obsahem.
 *
 * Čistě hloubka, žádná informace: `pointer-events-none`, aby nebralo kliknutí,
 * `fixed` a `z-0`, aby zůstalo pod obsahem i při scrollu. Krytí je nízké
 * schválně — na tmavém podkladu stačí náznak a text nad tím musí zůstat
 * čitelný.
 *
 * Vrací pole tříd pro tři kruhy; obal si dodá volající.
 */
export const AMBIENTNI_KRUHY = Object.freeze([
  'absolute -top-40 left-1/2 h-[350px] w-[600px] -translate-x-1/2 rounded-full '
  + 'bg-gradient-to-b from-[#00f2fe]/10 via-[#39ff14]/5 to-transparent blur-[120px] opacity-60',
  'absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-[#00f2fe]/5 blur-[140px]',
  'absolute bottom-1/4 -right-40 h-[450px] w-[450px] rounded-full bg-[#39ff14]/5 blur-[140px]',
]);

/** Obal ambientního pozadí — nesmí brát kliknutí ani překrýt obsah. */
export const AMBIENTNI_OBAL = 'pointer-events-none fixed inset-0 z-0 overflow-hidden';
