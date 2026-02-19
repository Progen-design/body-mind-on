// Rozdělení: bodyandmindon.cz = marketing, app.bodyandmindon.cz = registrace + profil
import { NextResponse } from 'next/server';

const MAIN_HOST = 'bodyandmindon.cz';
const APP_HOST = 'app.bodyandmindon.cz';
const APP_URL = `https://${APP_HOST}`;

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  const isMainSite = host === MAIN_HOST || host === `www.${MAIN_HOST}`;
  const isAppSite = host === APP_HOST;

  // Na hlavní doméně: /start, /profil, /login → přesměrovat do aplikace
  if (isMainSite && ['/start', '/profil', '/login'].includes(pathname)) {
    return NextResponse.redirect(new URL(pathname, APP_URL), 302);
  }

  // V aplikaci: úvodní stránka / → registrace /start
  if (isAppSite && pathname === '/') {
    return NextResponse.redirect(new URL('/start', APP_URL), 302);
  }

  return NextResponse.next();
}
