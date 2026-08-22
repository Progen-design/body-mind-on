// Hlaseni chyb z API funkci.
//
// Bez SENTRY_DSN se nic neinicializuje a zachytChybu() jen zaloguje do konzole.
// Sentry nikdy nesmi rozhodovat o tom, jestli endpoint odpovi.
import * as Sentry from '@sentry/node';

let spusteno = false;

function zajistiInicializaci() {
  if (spusteno) return !!process.env.SENTRY_DSN;
  spusteno = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || 'development',
    tracesSampleRate: 0.1,
    // Telo requestu muze nest vahu, datum narozeni nebo zdravotni omezeni.
    sendDefaultPii: false
  });
  return true;
}

/**
 * @param {unknown} chyba
 * @param {{ route?: string, userId?: string, [k: string]: unknown }} [kontext]
 */
export function zachytChybu(chyba, kontext = {}) {
  const zprava = chyba?.message || String(chyba);
  console.error(`[${kontext.route || 'api'}] ${zprava}`);

  if (!zajistiInicializaci()) return;

  Sentry.withScope((scope) => {
    if (kontext.route) scope.setTag('route', kontext.route);
    // Jen id uzivatele, nikdy e-mail ani jmeno.
    if (kontext.userId) scope.setUser({ id: kontext.userId });
    for (const [klic, hodnota] of Object.entries(kontext)) {
      if (klic !== 'route' && klic !== 'userId') scope.setExtra(klic, hodnota);
    }
    Sentry.captureException(chyba instanceof Error ? chyba : new Error(zprava));
  });
}

/** Vyprazdni frontu pred koncem funkce — serverless proces jinak zmizi driv. */
export async function odesliChyby(timeoutMs = 2000) {
  if (!spusteno || !process.env.SENTRY_DSN) return;
  try { await Sentry.flush(timeoutMs); } catch { /* nevadi */ }
}
