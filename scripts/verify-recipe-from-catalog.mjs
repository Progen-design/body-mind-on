#!/usr/bin/env node
/**
 * Ověří GET /api/recipe-from-catalog — ok:true a český Postup v HTML.
 *
 *   node scripts/verify-recipe-from-catalog.mjs
 *   BASE_URL=https://app.bodyandmindon.cz RECIPE_CATALOG_ID=48 node scripts/verify-recipe-from-catalog.mjs
 */
import {
  fetchWithTimeout,
  FETCH_TIMEOUT,
  formatFetchError,
} from './lib/fetchWithTimeout.mjs';

const BASE_URL = (process.env.BASE_URL || 'https://app.bodyandmindon.cz').replace(/\/$/, '');
const RECIPE_ID =
  process.env.RECIPE_CATALOG_ID ||
  process.argv.find((a) => /^\d+$/.test(a)) ||
  '48';
const url = `${BASE_URL}/api/recipe-from-catalog?id=${encodeURIComponent(RECIPE_ID)}`;

console.log('GET', url);
console.log('timeout:', `${FETCH_TIMEOUT.GET} ms`);

let res;
try {
  res = await fetchWithTimeout(url, { method: 'GET' }, FETCH_TIMEOUT.GET);
} catch (err) {
  console.error(formatFetchError(err, url));
  process.exit(1);
}

let body;
try {
  body = await res.json();
} catch {
  console.error(`HTTP ${res.status}: invalid JSON from ${url}`);
  process.exit(1);
}

if (!res.ok) {
  console.error(`HTTP ${res.status}: ${url}`);
  console.error(JSON.stringify(body).slice(0, 300));
  process.exit(1);
}

if (body?.ok !== true) {
  console.error(`FAIL: ok !== true (${url})`, body?.error || body);
  process.exit(1);
}

const html = String(body.html || '');
const postupMatch = html.match(/Postup:[\s\S]*?<ol>([\s\S]*?)<\/ol>/i);
if (!postupMatch) {
  console.error(`FAIL: HTML neobsahuje Postup (<ol>) — ${url}`);
  process.exit(1);
}

const postupText = postupMatch[1].replace(/<[^>]+>/g, '').trim();
if (!postupText) {
  console.error(`FAIL: Postup je prázdný — ${url}`);
  process.exit(1);
}

console.log('PASS: ok=true, Postup nalezen');
console.log('Preview:', postupText.slice(0, 160) + (postupText.length > 160 ? '…' : ''));
