// Rozdělení: bodyandmindon.cz = marketing, app.bodyandmindon.cz (nebo *.vercel.app) = registrace + profil
import { NextResponse } from 'next/server';
import { getPublicAppUrl, isMarketingHostname } from './lib/siteUrls';

const APP_HOST = 'app.bodyandmindon.cz';

function getAppBaseForRuntime(host) {
  const h = String(host || '').toLowerCase();
  if (h.endsWith('.vercel.app')) return `https://${host.split(':')[0]}`;
  if (h.startsWith('localhost:') || h === 'localhost' || h.startsWith('127.0.0.1')) {
    return `http://${host}`;
  }
  return getPublicAppUrl();
}

function isAppSiteHost(host) {
  const h = String(host || '').toLowerCase();
  return (
    host === APP_HOST ||
    h.endsWith('.vercel.app') ||
    h.startsWith('localhost:') ||
    h === 'localhost' ||
    h.startsWith('127.0.0.1')
  );
}

/** Na marketingové doméně vždy přesměrovat na kanonickou aplikaci (produkční app URL z env). */
function shouldRedirectMarketingPathToApp(pathname) {
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/api')) return false;
  const prefixes = [
    '/start',
    '/profil',
    '/login',
    '/register',
    '/signup',
    '/on-club',
    '/chci-vip',
    '/trener',
    '/onboarding',
    '/komunita',
    '/dashboard',
    '/club',
    '/vip',
    '/training',
    '/pricing',
  ];
  for (const p of prefixes) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  const onMarketing = isMarketingHostname(host);
  const isAppSite = isAppSiteHost(host);
  const appBaseUrl = getAppBaseForRuntime(host);
  const canonicalAppUrl = getPublicAppUrl();

  if (onMarketing && shouldRedirectMarketingPathToApp(pathname)) {
    return NextResponse.redirect(new URL(pathname, canonicalAppUrl), 302);
  }

  if (isAppSite && pathname === '/') {
    return NextResponse.redirect(new URL('/start', appBaseUrl), 302);
  }

  return NextResponse.next();
}
