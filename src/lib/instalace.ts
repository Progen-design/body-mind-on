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
export type Prohlizec = 'safari' | 'chrome' | 'firefox' | 'edge' | 'samsung' | 'inapp' | 'jiny';

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
 * Platforma a prohlížeč z user-agenta — kvůli návodu na míru. Chrome na
 * iPhonu má Sdílet jinde než Safari, Samsung Internet má menu dole,
 * in-app prohlížeč Instagramu to neumí vůbec.
 */
export function rozpoznejProhlizec(userAgent: string, maxTouchPoints = 0): RozpoznanyProhlizec {
  const ua = String(userAgent || '');
  const platforma = urciOs(ua, maxTouchPoints);
  if (platforma !== 'desktop' && IN_APP.test(ua)) return { platforma, prohlizec: 'inapp' };

  if (platforma === 'ios') {
    if (/CriOS/i.test(ua)) return { platforma, prohlizec: 'chrome' };
    if (/FxiOS/i.test(ua)) return { platforma, prohlizec: 'firefox' };
    if (/EdgiOS/i.test(ua)) return { platforma, prohlizec: 'edge' };
    return { platforma, prohlizec: 'safari' };
  }
  if (platforma === 'android') {
    if (/SamsungBrowser/i.test(ua)) return { platforma, prohlizec: 'samsung' };
    if (/EdgA/i.test(ua)) return { platforma, prohlizec: 'edge' };
    if (/Firefox/i.test(ua)) return { platforma, prohlizec: 'firefox' };
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
  'android-chrome': { platforma: 'android', prohlizec: 'chrome' },
  'android-firefox': { platforma: 'android', prohlizec: 'firefox' },
  'android-samsung': { platforma: 'android', prohlizec: 'samsung' },
  'android-edge': { platforma: 'android', prohlizec: 'edge' },
  'inapp-ios': { platforma: 'ios', prohlizec: 'inapp' },
  'inapp-android': { platforma: 'android', prohlizec: 'inapp' },
  desktop: { platforma: 'desktop', prohlizec: 'chrome' },
};

export function prohlizecZParametru(hodnota: string | null | undefined): RozpoznanyProhlizec | null {
  if (!hodnota) return null;
  return PREPISY_UA[hodnota.trim().toLowerCase()] ?? null;
}

/** Prohlížeče na Androidu, které posílají `beforeinstallprompt` → tlačítko „Nainstalovat aplikaci". */
export function umiTlacitkoInstalace(r: RozpoznanyProhlizec): boolean {
  return r.platforma === 'android' && (r.prohlizec === 'chrome' || r.prohlizec === 'edge' || r.prohlizec === 'samsung');
}

/** Ikona kroku — klíč, ne komponenta, ať data zůstanou bez Reactu. */
export type IkonaKroku = 'menu-vedle-adresy' | 'menu' | 'menu-svisle' | 'sdilet' | 'pridat' | 'potvrdit' | 'aplikace';

export interface KrokNavodu {
  text: string;
  ikona: IkonaKroku;
  /** Krok 0 v in-app prohlížeči — zvýrazněný, s tlačítkem „Kopírovat odkaz". */
  zvyrazneny?: boolean;
}

const krok = (text: string, ikona: IkonaKroku): KrokNavodu => ({ text, ikona });

/** In-app prohlížeč: napřed ven do normálního prohlížeče, pak běžný postup. */
export const KROK_INAPP: KrokNavodu = {
  text: 'Jsi v prohlížeči uvnitř aplikace (Instagram/Facebook) — tam to nejde. Klepni na ⋯ a vyber Otevřít v prohlížeči.',
  ikona: 'aplikace',
  zvyrazneny: true,
};

/**
 * iOS 26: Safari nemá Sdílet ve spodní liště — je v menu (⋯ nebo ≡) vedle
 * adresy. Starší iOS má Sdílet dole pořád, proto závorka v prvním kroku.
 */
const IOS_SAFARI = [
  krok('Klepni na ⋯ nebo ≡ vedle adresy (na starším iOS na ikonu Sdílet dole).', 'menu-vedle-adresy'),
  krok('Vyber Sdílet.', 'sdilet'),
  krok('Sjeď dolů a klepni na Přidat na plochu.', 'pridat'),
  krok('Nech zapnuté „Otevřít jako webovou aplikaci“ a klepni Přidat.', 'potvrdit'),
];

/** Chrome, Firefox i Edge na iOS umí Přidat na plochu od iOS 16.4. */
const IOS_CHROME = [
  krok('Klepni na Sdílet (nahoře vpravo nebo v menu ⋯).', 'sdilet'),
  krok('Vyber Přidat na plochu.', 'pridat'),
  krok('Klepni Přidat.', 'potvrdit'),
];

const IOS_FIREFOX_EDGE = [
  krok('Otevři menu ≡ / ⋯.', 'menu'),
  krok('Vyber Sdílet.', 'sdilet'),
  krok('Vyber Přidat na plochu.', 'pridat'),
  krok('Klepni Přidat.', 'potvrdit'),
];

/** Chrome a Edge na Androidu — když ještě nepřišla výzva k instalaci. */
const ANDROID_CHROME = [
  krok('Klepni na ⋮ vpravo nahoře.', 'menu-svisle'),
  krok('Vyber Přidat na plochu / Nainstalovat aplikaci.', 'pridat'),
  krok('Potvrď.', 'potvrdit'),
];

/**
 * Samsung Internet má menu ≡ DOLE, ne ⋮ nahoře — kroky Chromu by poslaly
 * člověka hledat tlačítko, které tam není.
 */
const ANDROID_SAMSUNG = [
  krok('Klepni na menu ≡ vpravo dole.', 'menu'),
  krok('Vyber Přidat stránku do → Domovská obrazovka.', 'pridat'),
  krok('Potvrď Přidat.', 'potvrdit'),
];

const ANDROID_FIREFOX = [
  krok('Klepni na ⋮.', 'menu-svisle'),
  krok('Vyber Přidat na plochu.', 'pridat'),
  krok('Klepni Přidat.', 'potvrdit'),
];

const JINY = [krok('V menu prohlížeče najdi Sdílet nebo Přidat na plochu.', 'menu')];

/**
 * Kroky pro každou kombinaci platformy a prohlížeče. Kombinace, které
 * v praxi nejsou (Samsung na iOS, Safari na Androidu), vedou na obecný
 * krok — návod nikdy nezůstane prázdný.
 */
export const KROKY: Record<'ios' | 'android', Record<Prohlizec, KrokNavodu[]>> = {
  ios: {
    safari: IOS_SAFARI,
    chrome: IOS_CHROME,
    firefox: IOS_FIREFOX_EDGE,
    edge: IOS_FIREFOX_EDGE,
    samsung: JINY,
    inapp: [KROK_INAPP, ...IOS_SAFARI],
    jiny: JINY,
  },
  android: {
    chrome: ANDROID_CHROME,
    edge: ANDROID_CHROME,
    samsung: ANDROID_SAMSUNG,
    firefox: ANDROID_FIREFOX,
    safari: JINY,
    inapp: [KROK_INAPP, ...ANDROID_CHROME],
    jiny: JINY,
  },
};

/** „Postup v Safari", „ve Firefoxu"… — řádek nad kroky. */
const KDE: Record<Prohlizec, string> = {
  safari: 'v Safari',
  chrome: 'v Chromu',
  firefox: 've Firefoxu',
  edge: 'v Edge',
  samsung: 'v Samsung Internetu',
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
