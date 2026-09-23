#!/usr/bin/env node
/**
 * IKONY PRO „PŘIDAT NA PLOCHU" (PWA) A FAVICON.
 *
 * Appka nemá soubor s logem — v hlavičce je logo textem („Body & Mind ON").
 * Značka „ON" na přechodu cyan → lime je favicon marketingového webu
 * (bodyandmindon-web, app/icon.tsx); tady je to samé jako SVG, ať appka
 * na ploše vypadá stejně jako web v záložce prohlížeče.
 *
 * Písmena jsou nakreslená jako tvary, ne textem — sharp (librsvg) by jinak
 * sáhl po systémovém fontu a na každém stroji vyšla jiná ikona.
 *
 * Spuštění: `node scripts/generate-pwa-icons.mjs` — výstup jde do public/
 * a commituje se. Build ho nespouští.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(fileURLToPath(import.meta.url), '..', '..', 'public');
const IKONY = join(PUBLIC, 'icons');

/** Barvy značky — src/index.css (@theme). */
const CYAN = '#00f2fe';   // --color-akcent-cyan
const LIME = '#39ff14';   // --color-akcent-lime
const TMAVA = '#08090d';  // --color-pozadi / --color-na-akcentu (tmavý text na neonu)

/**
 * Písmena „ON" v souřadnicích 0–100, vycentrovaná na (50, 50).
 * `meritko` je šířka nápisu v procentech plochy.
 */
function napisON(meritko) {
  // Návrh v boxu 100 × 60 (O: 0–46, N: 54–100), tah 12.
  const s = meritko / 100;
  const dx = 50 - 50 * s;
  const dy = 50 - 30 * s;
  return `<g transform="translate(${dx} ${dy}) scale(${s})" fill="${TMAVA}">
    <path fill-rule="evenodd" d="M23 0a23 30 0 1 1 0 60a23 30 0 1 1 0-60zm0 12a11 18 0 1 0 0 36a11 18 0 1 0 0-36z"/>
    <path d="M54 0h12l22 38V0h12v60H88L66 22v38H54z"/>
  </g>`;
}

function prechod() {
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${CYAN}"/><stop offset="1" stop-color="${LIME}"/>
  </linearGradient></defs>`;
}

/** „any": zaoblený čtverec, rohy průhledné — tak ho ukáže launcher bez masky. */
const svgAny = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${prechod()}
  <rect width="100" height="100" rx="22" fill="url(#g)"/>${napisON(58)}</svg>`;

/**
 * „maskable" a apple-touch-icon: přechod přes celou plochu (maskování si dělá
 * systém) a nápis uvnitř bezpečné zóny — kruh o průměru 80 % plochy.
 * iOS průhlednost vyplní černou, proto ani apple ikona rohy nemá.
 */
const svgPlna = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${prechod()}
  <rect width="100" height="100" fill="url(#g)"/>${napisON(46)}</svg>`;

/** Favicon: malá plocha, nápis co největší. */
const svgFavicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${prechod()}
  <rect width="100" height="100" rx="22" fill="url(#g)"/>${napisON(70)}</svg>`;

async function png(svg, rozmer) {
  return sharp(Buffer.from(svg), { density: 72 * (rozmer / 100) * 4 })
    .resize(rozmer, rozmer)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO s jedním vloženým PNG (formát to od Windows Vista umí). */
function ico(pngBuffer, rozmer) {
  const hlavicka = Buffer.alloc(6);
  hlavicka.writeUInt16LE(0, 0);
  hlavicka.writeUInt16LE(1, 2); // typ: ikona
  hlavicka.writeUInt16LE(1, 4); // počet obrázků
  const zaznam = Buffer.alloc(16);
  zaznam.writeUInt8(rozmer >= 256 ? 0 : rozmer, 0);
  zaznam.writeUInt8(rozmer >= 256 ? 0 : rozmer, 1);
  zaznam.writeUInt8(0, 2);
  zaznam.writeUInt8(0, 3);
  zaznam.writeUInt16LE(1, 4);
  zaznam.writeUInt16LE(32, 6);
  zaznam.writeUInt32LE(pngBuffer.length, 8);
  zaznam.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([hlavicka, zaznam, pngBuffer]);
}

mkdirSync(IKONY, { recursive: true });

const vystupy = [
  ['icons/icon-192.png', await png(svgAny, 192)],
  ['icons/icon-512.png', await png(svgAny, 512)],
  ['icons/icon-512-maskable.png', await png(svgPlna, 512)],
  ['apple-touch-icon.png', await png(svgPlna, 180)],
  ['favicon-32.png', await png(svgFavicon, 32)],
];

for (const [cesta, data] of vystupy) writeFileSync(join(PUBLIC, cesta), data);
writeFileSync(join(PUBLIC, 'favicon.ico'), ico(await png(svgFavicon, 32), 32));
writeFileSync(join(PUBLIC, 'favicon.svg'), `${svgFavicon}\n`);

console.log('PWA ikony vygenerovány:', [...vystupy.map(([c]) => c), 'favicon.ico', 'favicon.svg'].join(', '));
