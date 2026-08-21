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
export const TLACITKO = 'inline-flex items-center justify-center gap-2 rounded-xl min-h-[44px] '
  + 'bg-[#11141e] hover:bg-[#181d2c] text-neutral-300 hover:text-white '
  + 'font-medium text-sm border border-neutral-700/70 hover:border-neutral-500 '
  + 'transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

/** Primární akce — svítivá, jedna na sekci. */
export const TLACITKO_HLAVNI = 'inline-flex items-center justify-center gap-2 rounded-xl min-h-[44px] '
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

/* ── OBSIDIÁNOVÁ VARIANTA (návrh v4, srpen 2026) ─────────────────────────────
 *
 * Opět přidané, ne přepsané. v4 je tmavší a skleněnější než v3: pozadí jde
 * z #070B18 na obsidián #08090d, karty mají větší poloměr, silnější rozostření
 * a azurový rám místo šedého.
 *
 * Zdrojový návrh k tomu měl vlastní CSS třídy (`.glass-card`, `.glow-cyan-border`,
 * `.neon-btn-cyan`) a `@import "tailwindcss"` včetně Preflightu. Ani jedno se
 * sem nepřeneslo: Preflight by přepsal styled-jsx v celé aplikaci a paralelní
 * sada tříd by znamenala dva zdroje pravdy vedle sebe. Zůstává řetězec tříd
 * jako u všeho ostatního v tomhle souboru.
 */

/** Podklad stránky. Tmavší než v3 — sklo nad ním má větší kontrast. */
export const OBSIDIAN = '#08090d';

/** Skleněná karta v4 — větší rádius, silnější blur, azurový rám. */
export const SKLO = 'rounded-3xl bg-[#0e131d]/85 backdrop-blur-xl '
  + 'border border-[#00f2fe]/25 shadow-[0_8px_32px_rgba(0,0,0,0.5)] '
  + 'transition-all duration-300';

/** Skleněná karta, která reaguje na najetí. */
export const SKLO_HOVER = `${SKLO} hover:border-[#00f2fe]/50`;

/** Zvýrazněný rám — azurová pro aktivní, limetková pro hotové. */
export const ZARE_AZUROVA = 'border-[#00f2fe]/35 shadow-[0_0_20px_-3px_rgba(0,242,254,0.15)]';
export const ZARE_LIMETKA = 'border-[#39ff14]/40 shadow-[0_0_20px_-3px_rgba(57,255,20,0.18)]';

/**
 * Plná neonová akce — jediná na obrazovku.
 *
 * Text je tmavý schválně: na azurovém gradientu je bílá nečitelná.
 */
export const NEON_TLACITKO = 'inline-flex items-center justify-center gap-2 rounded-2xl min-h-[44px] '
  + 'bg-gradient-to-r from-[#00f2fe] to-[#38ef7d] hover:from-[#2bf5ff] hover:to-[#50fa8f] '
  + 'font-bold text-slate-950 shadow-[0_0_24px_rgba(0,242,254,0.4)] '
  + 'transition-all cursor-pointer active:scale-[0.98] '
  + 'disabled:opacity-60 disabled:cursor-not-allowed';

/** Lišta záložek a jednotlivá záložka. */
export const ZALOZKY_LISTA = 'flex items-center gap-2 rounded-2xl bg-[#0c1017]/90 '
  + 'border border-neutral-800/80 backdrop-blur-xl p-1.5 min-w-max '
  + 'shadow-[0_4px_24px_rgba(0,0,0,0.4)]';

/* `bg-transparent` tu není zbytečné: Tailwind běží bez Preflightu, takže
   <button> si jinak nechá výchozí světlé pozadí prohlížeče a záložka
   vyjde jako bílá pilulka s šedým textem. */
export const ZALOZKA = 'relative flex items-center gap-2 rounded-xl px-3.5 py-2 '
  + 'min-h-[44px] text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer '
  + 'bg-transparent border border-transparent '
  + 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50';

/* Gradient sam nestaci: `bg-gradient-to-r` je background-IMAGE. Bez
   Preflightu zustane background-color na vychozi sedi prohlizece a pod
   pruhlednym gradientem (/80) prosvita — zmereno rgb(240, 240, 240)
   na vsech sesti sirkach. `bg-transparent` tu tu seď vypina. */
export const ZALOZKA_AKTIVNI = 'relative flex items-center gap-2 rounded-xl px-3.5 py-2 '
  + 'min-h-[44px] text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer '
  + 'text-white bg-transparent bg-gradient-to-r from-[#082c33]/80 to-[#07271d]/80 '
  + 'border border-[#00f2fe]/50 shadow-[0_0_15px_rgba(0,242,254,0.25)]';

/** Odznak stavu členství. Barvu volí volající podle významu, ne podle vkusu. */
export const STAV_ODZNAK = 'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 '
  + 'text-xs font-bold uppercase tracking-wide select-none border';

export const STAV_AKTIVNI = 'text-[#39ff14] bg-emerald-950/40 border-[#39ff14]/50 '
  + 'shadow-[0_0_15px_rgba(57,255,20,0.25)]';
export const STAV_CEKA = 'text-amber-300 bg-amber-950/40 border-amber-400/50';
export const STAV_NEAKTIVNI = 'text-neutral-400 bg-neutral-900/60 border-neutral-700';

/* ── HORNÍ LIŠTA PROFILU ─────────────────────────────────────────────────────
 *
 * Lišta je přes celou šířku okna, ale její OBSAH musí sedět na stejné mřížce
 * jako zbytek stránky. Naměřeno 21. 8. 2026 na 1440 px: obsah profilu začínal
 * na 130 px, logo v liště na 28 px a hamburger končil na 1412 px místo 1310 —
 * lišta o 102 px na každou stranu mimo, takže nesedělo nic pod ní.
 *
 * Šířka 1180 px odpovídá `.profile-main-stack` v pages/profil.js. Kdyby se
 * jedna z nich změnila, druhá se musí změnit s ní — proto je to token, ne
 * číslo opsané na dvou místech.
 */

/**
 * Mřížka obsahu profilu. Všechno, co stojí přímo v `.page`, se o ni musí opřít —
 * jinak vznikne přesně to, co bylo 21. 8. 2026 naměřeno: karta uživatele široká
 * 1400 px nad sekcemi širokými 1180 px.
 */
export const SIRKA_OBSAHU = 'mx-auto w-full max-w-[1180px]';

/** Vnitřní kontejner lišty — tatáž mřížka jako obsah stránky pod ní. */
export const LISTA_OBSAH = `${SIRKA_OBSAHU} flex items-center justify-between gap-3`;

/**
 * Sklo lišty. Poloprůhledné, ne plná černá — obsah pod ní má prosvítat,
 * ale text musí zůstat čitelný i nad světlou kartou. Krytí 0,82 je nejnižší
 * hodnota, při které text lišty přežije i nad neonovým rámem karty.
 */
export const LISTA_SKLO = 'bg-[#08090d]/82 backdrop-blur-xl '
  + 'border-b border-[#00f2fe]/15 shadow-[0_2px_16px_rgba(0,0,0,0.45)]';

/* ── TŘI ÚROVNĚ TLAČÍTEK (návrh v4) ──────────────────────────────────────────
 *
 * Návrh rozlišuje tři váhy a profil je do 21. 8. 2026 míchal: „Synchronizovat
 * teď“ mělo inline `bg-[#00f2fe]/15` (tlumené), zatímco ve vzoru je to plná
 * neonová výplň se září. Vedle toho stály ikonové kruhy s vlastními třídami.
 *
 *   NEON_TLACITKO   — primární, jedna na sekci. Plná výplň, tmavý text, glow.
 *   TLACITKO        — sekundární. Jemný obrys, tmavé pozadí.
 *   TLACITKO_IKONA  — nenápadné. Jen ikona, kruh, bez výplně.
 *
 * `TLACITKO_HLAVNI` (tlumená azurová) zůstává kvůli místům, kde by plný neon
 * přebil obsah — typicky víc akcí vedle sebe v kartě jídla. Není to čtvrtá
 * úroveň, je to varianta primární pro husté rozhraní.
 */

/**
 * Ikonové tlačítko. Kulaté, bez výplně, jen obrys — používá se tam, kde je
 * akcí několik vedle sebe a text by je zahltil.
 *
 * `bg-transparent` je povinné: Tailwind běží bez Preflightu, takže <button>
 * si jinak nechá výchozí světlé pozadí prohlížeče.
 */
export const TLACITKO_IKONA = 'inline-flex items-center justify-center shrink-0 '
  + 'h-11 w-11 rounded-full bg-transparent border border-[#00f2fe]/40 text-[#e0f2fe] '
  + 'hover:border-[#00f2fe] hover:bg-[#00f2fe]/15 '
  + 'transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

/**
 * Minimální výška dotykového cíle. 44 px je práh, pod kterým se špatně trefuje.
 *
 * Změřeno v prohlížeči na šesti šířkách: tlačítka bez tohoto tokenu končila
 * na 33–40 px. Proto ho mají `TLACITKO`, `TLACITKO_HLAVNI`, `NEON_TLACITKO`
 * i obě záložky rovnou v sobě a tenhle export zbývá pro tlačítka mimo ně.
 */
export const TLACITKO_VYSKA = 'min-h-[44px]';

/* ── PALETA PRO SEKCE NA styled-jsx (biometrie, zařízení) ────────────────────
 *
 * PROČ EXISTUJE. Devět komponent v `_legacy-next/components/health/` je psaných styled-jsx
 * a barvy si bere z `BM_ON_DESIGN` v `lib/designTokens.js`. Tam ale žije
 * i paleta e-mailů (`EMAIL_V8_ALIASES` z ní derivuje), takže přebarvit ji
 * na neon by přebarvilo i e-maily — a neonová zelená v Gmailu je něco jiného
 * než na obsidiánovém pozadí aplikace.
 *
 * Tenhle objekt má proto ZÁMĚRNĚ STEJNÝ TVAR jako `BM_ON_DESIGN.colors`
 * a je to drop-in náhrada: komponenta jen vymění import a beze změny kódu
 * se překlopí do palety v4. E-maily zůstanou, kde byly.
 *
 * CO SE MĚNÍ: `sky` → azurová, `green` → limetková, `cyan` → tyrkysová.
 * CO ZŮSTÁVÁ a proč:
 *   purpleSoft — barva ČÁRY V GRAFU. Grafy HRV, klidového tepu a váhy běží
 *                vedle sebe a musí jít rozeznat; slít je do azurové by
 *                znamenalo dvě nerozlišitelné křivky.
 *   red, yellow — význam (chyba, upozornění) je v obou paletách stejný.
 *   šedé a pozadí — v4 je nemění.
 */
export const PALETA_PROFILU = Object.freeze({
  bg: OBSIDIAN,
  panel: '#0e131d',
  panelSoft: '#171c2a',
  border: 'rgba(148, 163, 184, 0.22)',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textDim: '#64748B',
  purple: '#7C3AED',
  purpleSoft: '#a78bfa',
  blue: '#38BDF8',
  sky: NEON.azurova,
  cyan: '#2dd4bf',
  green: NEON.limetka,
  yellow: '#FBBF24',
  red: '#FB7185',
  cardBg: '#121826',
  cardAlt: '#1E293B',
  footerBg: '#040308',
});

/** Obal se stejným tvarem jako BM_ON_DESIGN — kvůli `X.colors.y` v komponentách. */
export const DESIGN_PROFILU = Object.freeze({ colors: PALETA_PROFILU });
