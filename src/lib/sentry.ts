import * as Sentry from '@sentry/react';

/**
 * Hlaseni chyb z prohlizece.
 *
 * Bez DSN se nic neinicializuje a aplikace bezi dal — Sentry nesmi byt
 * podminka toho, ze se profil nacte. Prazdne DSN je proto tichy stav,
 * ne chyba.
 */
export function spustSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN || import.meta.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE === 'production' ? 'production' : 'development',
    // Vzorkovani vykonu: 10 % staci na trend a nespali kvotu.
    tracesSampleRate: 0.1,
    // Zdravotni data se nesmi dostat do hlaseni o chybe.
    sendDefaultPii: false,
    beforeSend(udalost) {
      // Token z URL (napr. ?token=) by jinak odesel spolu s chybou.
      if (udalost.request?.url) {
        udalost.request.url = udalost.request.url.replace(
          /([?&](token|access_token|apikey|key)=)[^&]*/gi,
          '$1[skryto]'
        );
      }
      return udalost;
    }
  });
}

/** Prihlaseny uzivatel u chyby — jen id, zadny e-mail ani jmeno. */
export function nastavUzivatele(id: string | null): void {
  if (!import.meta.env.VITE_SENTRY_DSN && !import.meta.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.setUser(id ? { id } : null);
}

export { Sentry };
