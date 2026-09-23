/**
 * „PŘIDAT NA PLOCHU" — kdy nabídnout instalaci a jak.
 *
 * Čistá logika bez Reactu (testy v instalace.test.ts) + jeden globální
 * posluchač `beforeinstallprompt`. Ten musí běžet od startu stránky
 * (main.tsx): Chrome událost pošle jednou, klidně dřív, než se přihlášený
 * uživatel dostane k banneru — kdo ji nezachytí hned, už ji nedostane.
 */

/** Klíč v localStorage: kdy uživatel banner zavřel (ms od epochy). */
export const KLIC_ZAVRENO = 'bmon_install_dismissed';

/** Jak dlouho po „Teď ne" banner mlčí. */
export const PLATNOST_ZAVRENI_DNI = 30;

export type Platforma = 'ios' | 'android' | 'jine';

/**
 * iOS (i iPadOS, který se od verze 13 hlásí jako Mac s dotykem), Android,
 * nebo cokoli jiného. Vestavěné prohlížeče Instagramu a Facebooku na plochu
 * přidávat neumí — pro ně „jine", ať jim banner neslibuje, co nejde.
 */
export function urciPlatformu(userAgent: string, maxTouchPoints = 0): Platforma {
  const ua = String(userAgent || '');
  if (/FBAN|FBAV|Instagram/i.test(ua)) return 'jine';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'jine';
}

/**
 * Běží appka už z plochy? `display-mode: standalone` hlásí Chrome i Safari
 * 17+, starší iOS jen `navigator.standalone`.
 */
export function jeStandalone(displayModeStandalone: boolean, navigatorStandalone?: boolean): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

/** Zavřel uživatel banner v posledních 30 dnech? Nečitelná hodnota = nezavřel. */
export function jeZavreno(ulozeno: string | null | undefined, ted: number = Date.now()): boolean {
  const kdy = Number(ulozeno);
  if (!ulozeno || !Number.isFinite(kdy) || kdy <= 0) return false;
  return ted - kdy < PLATNOST_ZAVRENI_DNI * 24 * 60 * 60 * 1000;
}

export interface StavInstalace {
  prihlasen: boolean;
  platforma: Platforma;
  standalone: boolean;
  zavreno: boolean;
  /** Zachytil se `beforeinstallprompt`? Bez něj Android instalovat neumíme. */
  maVyzvu: boolean;
}

/**
 * Ukázat banner?
 * - jen přihlášenému, jen na mobilu, jen mimo standalone, jen když ho
 *   v posledních 30 dnech nezavřel,
 * - Android jen s zachycenou výzvou (Firefox a spol. ji nepošlou — tlačítko
 *   by nic neudělalo), iOS výzvu nemá nikdy, tam jde návod.
 */
export function maZobrazitBanner(s: StavInstalace): boolean {
  if (!s.prihlasen || s.standalone || s.zavreno) return false;
  if (s.platforma === 'ios') return true;
  if (s.platforma === 'android') return s.maVyzvu;
  return false;
}

// ---------------------------------------------------------------- výzva prohlížeče

/** `beforeinstallprompt` — TypeScript ho v lib.dom nezná. */
export interface VyzvaInstalace extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let vyzva: VyzvaInstalace | null = null;
let nainstalovano = false;
const odberatele = new Set<() => void>();
const oznam = () => odberatele.forEach((f) => f());

/** Volá main.tsx hned při startu. */
export function zachytVyzvuInstalace(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Bez preventDefault() by Chrome ukázal vlastní mini-infobar dřív, než
    // se uživatel přihlásí.
    e.preventDefault();
    vyzva = e as VyzvaInstalace;
    oznam();
  });
  window.addEventListener('appinstalled', () => {
    vyzva = null;
    nainstalovano = true;
    oznam();
  });
}

export function aktualniVyzva(): VyzvaInstalace | null {
  return vyzva;
}

/** Proběhla v téhle relaci instalace (`appinstalled`)? Návod pak ukáže „Hotovo". */
export function jeNainstalovano(): boolean {
  return nainstalovano;
}

export function odebirejVyzvu(f: () => void): () => void {
  odberatele.add(f);
  return () => odberatele.delete(f);
}

/** Výzvu jde použít jen jednou — po prompt() ji zahodíme. */
export function spotrebujVyzvu(): void {
  vyzva = null;
  oznam();
}

// ---------------------------------------------------------------- trvalý návod (/instalace)

/** Adresa návodu — sem vede QR kód z počítače, profil i login. */
export const URL_NAVODU = 'https://app.bodyandmindon.cz/instalace';

export type OsZarizeni = 'ios' | 'android' | 'desktop';

/**
 * Operační systém pro návod. Na rozdíl od `urciPlatformu()` (banner) tady
 * vestavěný prohlížeč Instagramu na iPhonu zůstává iOS — návod mu řekne,
 * ať stránku otevře v Safari. Poslat ho na QR kód „otevři v telefonu"
 * by bylo absurdní, v telefonu už je.
 */
function urciOs(userAgent: string, maxTouchPoints = 0): OsZarizeni {
  const ua = String(userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Je mobil a appka neběží z plochy? Podle toho se ukazují odkazy na návod. */
export function nabidnoutNavod(os: OsZarizeni, standalone: boolean): boolean {
  return os !== 'desktop' && !standalone;
}

/** Běží appka právě teď z plochy? Čte prohlížeč — mimo něj vždy false. */
export function beziZPlochy(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return jeStandalone(mq, (navigator as Navigator & { standalone?: boolean }).standalone);
}

/** OS tohoto zařízení. Mimo prohlížeč 'desktop'. */
export function osTohotoZarizeni(): OsZarizeni {
  if (typeof navigator === 'undefined') return 'desktop';
  return urciOs(navigator.userAgent, navigator.maxTouchPoints);
}

// ---------------------------------------------------------------- prohlížeč a kroky návodu

type PlatformaNavodu = 'ios' | 'android' | 'desktop';
export type Prohlizec =
  | 'safari'
  | 'chrome'
  | 'firefox'
  | 'edge'
  | 'samsung'
  | 'opera'
  | 'brave'
  | 'duckduckgo'
  | 'inapp'
  | 'jiny';

export interface RozpoznanyProhlizec {
  platforma: PlatformaNavodu;
  prohlizec: Prohlizec;
}

/**
 * Vestavěné prohlížeče aplikací. Na plochu z nich přidat nejde — člověk
 * musí stránku otevřít v normálním prohlížeči. `Line/` s lomítkem, ať to
 * nesedne na jiné slovo. Instagram, Facebook (FBAN na iOS, FB_IAB/FBAV na
 * Androidu), Messenger, TikTok (i starší `musical_ly`), X/Twitter,
 * LinkedIn, Snapchat, WeChat (MicroMessenger).
 */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Messenger|\bLine\/|TikTok|musical_ly|Twitter|LinkedInApp|Snapchat|MicroMessenger/i;

/**
 * Platforma a prohlížeč z user-agenta — kvůli návodu na míru. In-app má
 * přednost před vším ostatním.
 *
 * BRAVE A DUCKDUCKGO se v UA často tváří jako Safari (iOS) nebo Chrome
 * (Android) a odlišit je nejde. Pak zůstávají safari / chrome — kroky
 * jsou tam stejné, liší se jen ikona menu.
 */
export function rozpoznejProhlizec(userAgent: string, maxTouchPoints = 0): RozpoznanyProhlizec {
  const ua = String(userAgent || '');
  const platforma = urciOs(ua, maxTouchPoints);
  if (platforma !== 'desktop' && IN_APP.test(ua)) return { platforma, prohlizec: 'inapp' };

  if (platforma === 'ios') {
    if (/CriOS/i.test(ua)) return { platforma, prohlizec: 'chrome' };
    if (/FxiOS/i.test(ua)) return { platforma, prohlizec: 'firefox' };
    if (/EdgiOS/i.test(ua)) return { platforma, prohlizec: 'edge' };
    if (/\bOPT\/|\bOPR\//i.test(ua)) return { platforma, prohlizec: 'opera' };
    if (/Brave/i.test(ua)) return { platforma, prohlizec: 'brave' };
    if (/DuckDuckGo|\bDdg\//i.test(ua)) return { platforma, prohlizec: 'duckduckgo' };
    return { platforma, prohlizec: 'safari' };
  }
  if (platforma === 'android') {
    if (/SamsungBrowser/i.test(ua)) return { platforma, prohlizec: 'samsung' };
    if (/EdgA/i.test(ua)) return { platforma, prohlizec: 'edge' };
    if (/Firefox/i.test(ua)) return { platforma, prohlizec: 'firefox' };
    if (/\bOPR\//i.test(ua)) return { platforma, prohlizec: 'opera' };
    if (/Brave/i.test(ua)) return { platforma, prohlizec: 'brave' };
    return { platforma, prohlizec: 'chrome' };
  }
  if (/Edg\//i.test(ua)) return { platforma, prohlizec: 'edge' };
  if (/Firefox/i.test(ua)) return { platforma, prohlizec: 'firefox' };
  if (/Chrome/i.test(ua)) return { platforma, prohlizec: 'chrome' };
  if (/Safari/i.test(ua)) return { platforma, prohlizec: 'safari' };
  return { platforma, prohlizec: 'jiny' };
}

/**
 * `?ua=ios-chrome` apod. přepíše detekci — jen pro kontrolu návodu na
 * počítači. Neznámá hodnota = null, detekce zůstane.
 */
const PREPISY_UA: Record<string, RozpoznanyProhlizec> = {
  'ios-safari': { platforma: 'ios', prohlizec: 'safari' },
  'ios-chrome': { platforma: 'ios', prohlizec: 'chrome' },
  'ios-firefox': { platforma: 'ios', prohlizec: 'firefox' },
  'ios-edge': { platforma: 'ios', prohlizec: 'edge' },
  'ios-opera': { platforma: 'ios', prohlizec: 'opera' },
  'ios-brave': { platforma: 'ios', prohlizec: 'brave' },
  'ios-duckduckgo': { platforma: 'ios', prohlizec: 'duckduckgo' },
  'android-chrome': { platforma: 'android', prohlizec: 'chrome' },
  'android-firefox': { platforma: 'android', prohlizec: 'firefox' },
  'android-samsung': { platforma: 'android', prohlizec: 'samsung' },
  'android-edge': { platforma: 'android', prohlizec: 'edge' },
  'android-brave': { platforma: 'android', prohlizec: 'brave' },
  'android-opera': { platforma: 'android', prohlizec: 'opera' },
  'inapp-ios': { platforma: 'ios', prohlizec: 'inapp' },
  'inapp-android': { platforma: 'android', prohlizec: 'inapp' },
  desktop: { platforma: 'desktop', prohlizec: 'chrome' },
};

export function prohlizecZParametru(hodnota: string | null | undefined): RozpoznanyProhlizec | null {
  if (!hodnota) return null;
  return PREPISY_UA[hodnota.trim().toLowerCase()] ?? null;
}

/**
 * Prohlížeče na Androidu, které posílají `beforeinstallprompt` → tlačítko
 * „Nainstalovat aplikaci". Chromium: Chrome, Edge, Samsung, Brave, Opera.
 */
const S_TLACITKEM: ReadonlySet<Prohlizec> = new Set(['chrome', 'edge', 'samsung', 'brave', 'opera']);

export function umiTlacitkoInstalace(r: RozpoznanyProhlizec): boolean {
  return r.platforma === 'android' && S_TLACITKEM.has(r.prohlizec);
}

/** Ikona kroku — klíč, ne komponenta, ať data zůstanou bez Reactu. */
export type IkonaKroku = 'menu-vedle-adresy' | 'menu' | 'menu-svisle' | 'sdilet' | 'pridat' | 'potvrdit' | 'aplikace';

export interface KrokNavodu {
  text: string;
  ikona: IkonaKroku;
  /** Krok 0 v in-app prohlížeči — zvýrazněný, s tlačítkem „Kopírovat odkaz". */
  zvyrazneny?: boolean;
  /**
   * Popis ikony pod textem kroku („ikona: čtverec se šipkou nahoru") —
   * u kroku, kde člověk hledá malou ikonu vedle adresy. Ikona se pak
   * kreslí větší.
   */
  popisIkony?: string;
}

const krok = (text: string, ikona: IkonaKroku): KrokNavodu => ({ text, ikona });

/** Popis ikony Sdílet — na iPhonu je malá a bez popisku. */
export const POPIS_IKONY_SDILET = 'ikona: čtverec se šipkou nahoru';

/** Krok 1 na iOS: ikona Sdílet vedle adresy — větší a s popisem. */
const krokSdilet = (text: string): KrokNavodu => ({ text, ikona: 'sdilet', popisIkony: POPIS_IKONY_SDILET });

/** In-app prohlížeč: napřed ven do normálního prohlížeče, pak běžný postup. */
export const KROK_INAPP: KrokNavodu = {
  text: 'Jsi v prohlížeči uvnitř aplikace (Instagram/Facebook) — tam to nejde. Klepni na ⋯ a vyber Otevřít v prohlížeči.',
  ikona: 'aplikace',
  zvyrazneny: true,
};

/*
 * KROKY — FINÁLNÍ, OVĚŘENÉ (24. 9. 2026). Texty jsou převzaté doslova
 * ze zadání; krok 1 vždy říká, KDE tlačítko je. Neupravovat bez nového
 * ověření na zařízení.
 */

/** iOS 26 kompaktní lišta; starší iOS má Sdílet dole. */
const IOS_SAFARI = [
  krok('Klepni na tlačítko ⋯ vpravo v adresním řádku (na starším iOS na ikonu Sdílet ⬆ dole).', 'menu-vedle-adresy'),
  krok('Vyber Sdílet.', 'sdilet'),
  krok('Sjeď dolů a klepni na Přidat na plochu.', 'pridat'),
  krok('Nech zapnuté „Otevřít jako webovou aplikaci“ a klepni Přidat.', 'potvrdit'),
];

/*
 * CHROME A FIREFOX NA iOS 26 — podle screenshotů z iPhonu:
 * - Chrome: adresa nahoře, Sdílet ⬆ VPRAVO vedle adresy; s lištou dole je
 *   vlevo dole. Spodní lišta ← → + [karty] ⋯ Sdílet nemá.
 * - Firefox: adresa nahoře, Sdílet ⬆ VLEVO vedle adresy, ⟳ vpravo. Spodní
 *   lišta ‹ › + ⋯ [karty] — žádné ≡ vpravo dole (dřívější krok byl špatně).
 */
const IOS_CHROME = [
  krokSdilet('Klepni na ikonu Sdílet ⬆ vedle adresy (vpravo nahoře; máš-li lištu dole, vlevo dole).'),
  krok('Sjeď dolů a klepni na Přidat na plochu.', 'pridat'),
  krok('Klepni Přidat.', 'potvrdit'),
];

const IOS_FIREFOX = [
  krokSdilet('Klepni na ikonu Sdílet ⬆ vlevo nahoře vedle adresy.'),
  krok('Sjeď dolů a klepni na Přidat na plochu.', 'pridat'),
  krok('Klepni Přidat.', 'potvrdit'),
];

/** Edge, Opera, Brave, DuckDuckGo a ostatní na iOS. */
const IOS_OBECNE = [
  krokSdilet('Klepni na ikonu Sdílet ⬆ vedle adresy; když tam není, otevři menu ⋯ dole a vyber Sdílet.'),
  krok('Sjeď dolů a klepni na Přidat na plochu.', 'pridat'),
  krok('Klepni Přidat.', 'potvrdit'),
];

/** Chrome, Edge, Brave, Opera na Androidu — ruční postup, když ještě nepřišla výzva. */
const ANDROID_CHROME = [
  krok('Klepni na ⋮ vpravo nahoře.', 'menu-svisle'),
  krok('Vyber Přidat na plochu (nebo Nainstalovat aplikaci).', 'pridat'),
  krok('Klepni Přidat / Nainstalovat.', 'potvrdit'),
];

/** Samsung Internet má menu ≡ DOLE, ne ⋮ nahoře. */
const ANDROID_SAMSUNG = [
  krok('Klepni na menu ≡ vpravo dole.', 'menu'),
  krok('Vyber Přidat stránku do.', 'pridat'),
  krok('Vyber Domovská obrazovka a klepni Přidat.', 'potvrdit'),
];

const ANDROID_FIREFOX = [
  krok('Klepni na ⋮ vpravo nahoře.', 'menu-svisle'),
  krok('Vyber Přidat na plochu.', 'pridat'),
  krok('Klepni Přidat.', 'potvrdit'),
];

/**
 * Kroky pro každou kombinaci platformy a prohlížeče. Kombinace, které
 * v praxi nejsou nebo nejdou rozpoznat (Samsung na iOS, Safari či
 * DuckDuckGo na Androidu, neznámý prohlížeč), vedou na obecný postup
 * platformy — na iOS přes Sdílet, na Androidu přes ⋮ jako Chromium.
 */
export const KROKY: Record<'ios' | 'android', Record<Prohlizec, KrokNavodu[]>> = {
  ios: {
    safari: IOS_SAFARI,
    chrome: IOS_CHROME,
    firefox: IOS_FIREFOX,
    edge: IOS_OBECNE,
    opera: IOS_OBECNE,
    brave: IOS_OBECNE,
    duckduckgo: IOS_OBECNE,
    samsung: IOS_OBECNE,
    inapp: [KROK_INAPP, ...IOS_SAFARI],
    jiny: IOS_OBECNE,
  },
  android: {
    chrome: ANDROID_CHROME,
    edge: ANDROID_CHROME,
    brave: ANDROID_CHROME,
    opera: ANDROID_CHROME,
    samsung: ANDROID_SAMSUNG,
    firefox: ANDROID_FIREFOX,
    safari: ANDROID_CHROME,
    duckduckgo: ANDROID_CHROME,
    inapp: [KROK_INAPP, ...ANDROID_CHROME],
    jiny: ANDROID_CHROME,
  },
};

/** „Postup v Safari", „ve Firefoxu"… — řádek nad kroky. */
const KDE: Record<Prohlizec, string> = {
  safari: 'v Safari',
  chrome: 'v Chromu',
  firefox: 've Firefoxu',
  edge: 'v Edgi',
  samsung: 'v Samsung Internetu',
  opera: 'v Opeře',
  brave: 'v Brave',
  duckduckgo: 'v DuckDuckGo',
  inapp: 'v prohlížeči',
  jiny: 'v prohlížeči',
};

export function uvodKroku(prohlizec: Prohlizec): string {
  return `Postup ${KDE[prohlizec]} (nic tady neklikáš):`;
}

/**
 * Poznámka pod kroky. Dřívější „Funguje jen v Safari" byla věcně špatně —
 * Chrome, Firefox i Edge na iOS to umí od iOS 16.4.
 */
export const POZNAMKA_ZNOVU =
  'Když se místo appky otevře web s adresním řádkem, smaž ikonu z plochy a přidej ji znovu.';

// ---------------------------------------------------------------- texty stránky a banneru

/** Podnadpis /instalace. Dřívější „bez instalace, jedno klepnutí" nesedělo — kroků je víc. */
export const PODNADPIS_INSTALACE = 'Zatím bez App Storu — přidáš si ji na plochu z prohlížeče.';

/** Informační box na /instalace — proč web na ploše a ne appka z obchodu. */
export const INFO_APPKA_VE_VYVOJI =
  'Nativní aplikace pro App Store a Google Play je ve vývoji. Do té doby funguje BMON jako webová aplikace na ploše — stejné funkce, žádné stahování.';

/** Zkrácená verze pod odkazem na návod na přihlašovací obrazovce. */
export const INFO_APPKA_KRATCE = 'Appka pro App Store je ve vývoji — zatím si BMON přidej na plochu.';

/**
 * Popisek hlavního tlačítka banneru. Android s výzvou instaluje rovnou,
 * jinde vede na návod — a říká, kolik kroků čeká (Safari 4, Chrome na
 * iPhonu 3), ať to nevypadá na delší proceduru, než je.
 */
export function popisekTlacitkaBanneru(instalujRovnou: boolean, pocetKroku: number): string {
  if (instalujRovnou) return 'Nainstalovat';
  if (!Number.isFinite(pocetKroku) || pocetKroku <= 0) return 'Návod';
  const tvar = pocetKroku === 1 ? 'krok' : pocetKroku <= 4 ? 'kroky' : 'kroků';
  return `Návod (${pocetKroku} ${tvar})`;
}

/** Kolik kroků má návod pro tenhle prohlížeč (0 na počítači). */
export function pocetKrokuNavodu(r: RozpoznanyProhlizec): number {
  return r.platforma === 'desktop' ? 0 : KROKY[r.platforma][r.prohlizec].length;
}
