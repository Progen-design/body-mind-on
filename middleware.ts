// Routing Middleware bez Next.js (Vercel, @vercel/functions).
// Puvodne middleware.js s NextResponse - stejne chovani, standardni Web API.
import { next } from '@vercel/functions';
import { getPublicAppUrl, isMarketingHostname } from './lib/siteUrls.js';

const APP_HOST = 'app.bodyandmindon.cz';

const CHRANENE_PREFIXY = [
  '/start', '/profil', '/login', '/register', '/signup', '/on-club',
  '/chci-vip', '/trener', '/onboarding', '/komunita', '/dashboard',
  '/club', '/vip', '/training', '/pricing'
];

function jeAppHost(host: string): boolean {
  const h = String(host || '').toLowerCase();
  return h === APP_HOST || h.endsWith('.vercel.app');
}

function appBasePro(host: string): string {
  const h = String(host || '').toLowerCase();
  if (h.endsWith('.vercel.app')) return `https://${host.split(':')[0]}`;
  return getPublicAppUrl();
}

/** Na marketingove domene poslat aplikacni cesty na kanonickou app URL. */
function patriDoApp(pathname: string): boolean {
  if (pathname.startsWith('/_next') || pathname.startsWith('/assets') ||
      pathname.startsWith('/favicon') || pathname.startsWith('/api')) return false;
  return CHRANENE_PREFIXY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';

  if (isMarketingHostname(host) && patriDoApp(url.pathname)) {
    return Response.redirect(new URL(url.pathname, getPublicAppUrl()), 302);
  }

  if (jeAppHost(host) && url.pathname === '/') {
    return Response.redirect(new URL('/login?redirect=/profil', appBasePro(host)), 302);
  }

  return next();
}
