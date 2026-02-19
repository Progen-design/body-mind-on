// Rozdělení: bodyandmindon.cz = marketing, app.bodyandmindon.cz (nebo *.vercel.app) = registrace + profil
import { NextResponse } from 'next/server';

const MAIN_HOST = 'bodyandmindon.cz';
const APP_HOST = 'app.bodyandmindon.cz';
const APP_URL = `https://${APP_HOST}`;

function getAppUrl(host) {
  // Na Vercel doméně použij aktuální host jako základ URL
  if (host.endsWith('.vercel.app')) return `https://${host}`;
  return APP_URL;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  const isMainSite = host === MAIN_HOST || host === `www.${MAIN_HOST}`;
  const isAppSite = host === APP_HOST || host.endsWith('.vercel.app');
  const appBaseUrl = getAppUrl(host);

  // Na hlavní doméně: /start, /profil, /login → přesměrovat do aplikace
  if (isMainSite && ['/start', '/profil', '/login'].includes(pathname)) {
    return NextResponse.redirect(new URL(pathname, APP_URL), 302);
  }

  // V aplikaci (app.bodyandmindon.cz nebo *.vercel.app): úvodní stránka / → registrace /start
  if (isAppSite && pathname === '/') {
    return NextResponse.redirect(new URL('/start', appBaseUrl), 302);
  }

  return NextResponse.next();
}
