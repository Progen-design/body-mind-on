import { useEffect, useState } from 'react';

/**
 * Minimalisticke smerovani. Router jako zavislost by byl vetsi nez uzitek —
 * mista v appce, kam vede `naviguj()`, se daji spocitat na prstech jedne
 * ruky. PLATNE_CESTY je jediny zdroj pravdy pro to, co App.tsx obsluhuje;
 * ostatni pouzij tenhle seznam, at se nerozejde s tim, na co se vetvi
 * skutecne renderovani (viz App.tsx, jePlatnaCesta()).
 */

/** Verejna registrace — vsechny tri retezce vedou na stejnou obrazovku. */
export const CESTY_REGISTRACE = ['/start', '/register', '/signup'] as const;

export const CESTA_PRIHLASENI = '/login';
export const CESTA_PROFIL = '/profil';

/**
 * Komunita má vlastní adresu (23. 9. 2026). Do té doby byla jen záložkou
 * uvnitř /profil bez URL — jenže middleware.ts ji odjakživa vedl jako
 * aplikační cestu, takže odkaz nebo záložka na /komunita končil na 404.
 * Ostatní záložky zůstávají pod /profil.
 */
export const CESTA_KOMUNITA = '/komunita';

/**
 * Návod „Přidat na plochu". VEŘEJNÁ cesta jako /login — vede sem QR kód
 * z počítače a odkaz z přihlašovací obrazovky, tedy i nepřihlášení.
 */
export const CESTA_INSTALACE = '/instalace';

/**
 * Admin nastaveni integraci. Nevede sem zadny odkaz z navigace — je to
 * adresa, kterou si admin otevre sam a ktera se rucne overuje proti
 * ADMIN_TOKEN. Do PLATNE_CESTY patri proto, ze bez ni by ji App.tsx
 * poslala na 404 drive, nez by se vubec vykreslila.
 */
export const CESTA_ADMIN_INTEGRACE = '/admin/integrace';

export const PLATNE_CESTY = [
  '/',
  CESTA_PRIHLASENI,
  CESTA_PROFIL,
  CESTA_KOMUNITA,
  CESTA_INSTALACE,
  CESTA_ADMIN_INTEGRACE,
  ...CESTY_REGISTRACE
] as const;

export function jePlatnaCesta(cesta: string): boolean {
  return (PLATNE_CESTY as readonly string[]).includes(cesta);
}

/** Záložka, kterou cesta otevře při přímém načtení. `null` = výchozí. */
export function zalozkaZCesty(cesta: string): 'komunita' | null {
  return cesta === CESTA_KOMUNITA ? 'komunita' : null;
}

/**
 * Kam přepsat URL při přepnutí záložky. Mimo /profil a /komunita (login,
 * registrace, `/`) se adresa nemění — `null`.
 */
export function cestaProZalozku(zalozka: string, aktualniCesta: string): string | null {
  if (aktualniCesta !== CESTA_PROFIL && aktualniCesta !== CESTA_KOMUNITA) return null;
  const cil = zalozka === 'komunita' ? CESTA_KOMUNITA : CESTA_PROFIL;
  return cil === aktualniCesta ? null : cil;
}

/**
 * `?redirect=` z URL smí vést jen na vlastní cestu, nikdy ven — jinak je to
 * otevřený redirect (přihlásíš se a `naviguj()` tě přes `kam.startsWith('http')`
 * pošle na cizí doménu). Kontroluje se ZDE, na hranici čtení parametru, ne
 * v `naviguj()` — ten smí navigovat na `http(s)` i jinde (např. platba),
 * jen ne na hodnotu, kterou útočník vloží do odkazu na přihlášení.
 *
 * `//cizi-domena.cz` je „relativní k protokolu“ a prohlížeč ho vezme jako
 * cizí origin stejně jako `http://…` — samotné `startsWith('/')` by ho
 * pustilo, proto se kontroluje zvlášť.
 */
export function bezpecnyRedirect(hodnota: string | null | undefined, vychozi: string = CESTA_PROFIL): string {
  if (!hodnota) return vychozi;
  if (!hodnota.startsWith('/') || hodnota.startsWith('//')) return vychozi;
  return hodnota;
}

export function naviguj(kam: string) {
  if (kam.startsWith('http')) {
    window.location.href = kam;
    return;
  }
  window.history.pushState({}, '', kam);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useCesta(): { cesta: string; parametry: URLSearchParams } {
  const precti = () => ({
    cesta: window.location.pathname.replace(/\/+$/, '') || '/',
    parametry: new URLSearchParams(window.location.search)
  });

  const [stav, setStav] = useState(precti);

  useEffect(() => {
    const naZmenu = () => setStav(precti());
    window.addEventListener('popstate', naZmenu);
    return () => window.removeEventListener('popstate', naZmenu);
  }, []);

  return stav;
}
