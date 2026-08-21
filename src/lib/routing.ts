import type { ActiveTab } from '../components/NavigationTabs';

/**
 * Aplikace je jedna stránka s záložkami, ale adresu si drží — aby šlo
 * poslat odkaz na /profil a aby fungovalo tlačítko zpět. Server všechny
 * cesty přepisuje na index.html (viz vercel.json), rozhodnutí padá tady.
 */

/** Kam se uživatel dostane, když adresu nepoznáme. */
export const DEFAULT_TAB: ActiveTab = 'dnes';

/** Kanonická adresa pro každou záložku. */
export const TAB_PATHS: Record<ActiveTab, string> = {
  dnes: '/',
  profil: '/profil',
  vaha: '/vaha',
  jidelnicek: '/jidelnicek',
  trenink: '/trenink',
  regenerace: '/regenerace',
  naviky: '/navyky',
  nakup: '/nakup'
};

/**
 * Adresy, které vedou na stejnou záložku — starší odkazy, anglické varianty
 * a české tvary bez diakritiky. Ať se nikdo nedostane na prázdno kvůli tomu,
 * že si pamatuje jiný tvar URL.
 */
const PATH_ALIASES: Record<string, ActiveTab> = {
  '/dashboard': 'dnes',
  '/prehled': 'dnes',
  '/index.html': 'dnes',
  '/profile': 'profil',
  '/muj-profil': 'profil',
  '/vaha-a-telo': 'vaha',
  '/telo': 'vaha',
  '/jidlo': 'jidelnicek',
  '/makra': 'jidelnicek',
  '/workout': 'trenink',
  '/treninky': 'trenink',
  '/apple-watch': 'regenerace',
  '/biometrie': 'regenerace',
  '/naviky': 'naviky',
  '/habits': 'naviky',
  '/nakupni-seznam': 'nakup'
};

/** "/Profil/" i "/profil" jsou totéž. */
function normalizePath(pathname: string): string {
  const trimmed = (pathname || '/').trim().toLowerCase();
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (withSlash.length > 1 && withSlash.endsWith('/')) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

/** Záložka pro danou adresu. Neznámou adresu nepovažujeme za chybu — vede na přehled. */
export function tabFromPath(pathname: string): ActiveTab {
  const path = normalizePath(pathname);

  if (path === '/') return DEFAULT_TAB;

  const direct = (Object.keys(TAB_PATHS) as ActiveTab[]).find(tab => TAB_PATHS[tab] === path);
  if (direct) return direct;

  return PATH_ALIASES[path] ?? DEFAULT_TAB;
}

/** Adresa, kterou má nést daná záložka. */
export function pathForTab(tab: ActiveTab): string {
  return TAB_PATHS[tab] ?? TAB_PATHS[DEFAULT_TAB];
}

/** Aktuální cesta; mimo prohlížeč (test, build) vrací kořen. */
export function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname;
}
