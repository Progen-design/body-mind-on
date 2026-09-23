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
    oznam();
  });
}

export function aktualniVyzva(): VyzvaInstalace | null {
  return vyzva;
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
export type VariantaNavodu = 'standalone' | 'ios' | 'android' | 'desktop';

/**
 * Operační systém pro návod. Na rozdíl od `urciPlatformu()` (banner) tady
 * vestavěný prohlížeč Instagramu na iPhonu zůstává iOS — návod mu řekne,
 * ať stránku otevře v Safari. Poslat ho na QR kód „otevři v telefonu"
 * by bylo absurdní, v telefonu už je.
 */
export function urciOs(userAgent: string, maxTouchPoints = 0): OsZarizeni {
  const ua = String(userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Která varianta návodu: hotovo / iOS kroky / Android / QR pro počítač. */
export function variantaNavodu(os: OsZarizeni, standalone: boolean): VariantaNavodu {
  if (standalone) return 'standalone';
  return os;
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

// ---------------------------------------------------------------- texty kroků návodu

/**
 * iOS 26: Safari nemá Sdílet ve spodní liště — je v menu (⋯ nebo ≡) vedle
 * adresního řádku. Starý návod „klepni na Sdílet dole" nechal uživatele bez
 * tlačítka, na které by klepl. Starší iOS má Sdílet dole pořád, proto
 * závorka v prvním kroku.
 */
export const KROKY_IOS = [
  'Klepni na ⋯ nebo ≡ vedle adresy (na starším iOS na ikonu Sdílet dole).',
  'Vyber Sdílet.',
  'Sjeď dolů a klepni na Přidat na plochu.',
  'Nech zapnuté „Otevřít jako webovou aplikaci“ a potvrď Přidat.',
] as const;

/** Android bez výzvy prohlížeče — stejný formát jako iOS. */
export const KROKY_ANDROID = [
  '⋮ vpravo nahoře → Přidat na plochu / Nainstalovat aplikaci.',
  'Potvrď — ikona BMON se objeví na ploše.',
] as const;

/** Poznámky pod iOS kroky. */
export const POZNAMKY_IOS = [
  'Funguje jen v Safari, ne v Chrome/Instagram prohlížeči.',
  'Když se místo appky otevře web s adresním řádkem, smaž ikonu z plochy a přidej ji znovu ze Safari.',
] as const;
