import { useEffect, useState } from 'react';

/**
 * Minimalisticke smerovani. Aplikace ma jen tri verejne cesty (/login, /start,
 * /profil), takze router jako zavislost by byl vetsi nez uzitek.
 */
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
