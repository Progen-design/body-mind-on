// Idempotentni srovnani cest po presunu. Lze pustit opakovane bez skody.
//   api/*                -> finalni misto Vercel Functions
//   _legacy-next/pages/* -> UI stranky Nextu, ceka na prepis do SPA
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SLOZKY = ['lib', 'scripts', 'api'];
const PRIPONY = new Set(['.js', '.mjs', '.ts']);

function projdi(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) projdi(p, out);
    else if (PRIPONY.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function srovnej(text) {
  let t = text;
  // 1) zrusit zdvojeni z drivejsiho behu
  for (let i = 0; i < 5; i++) {
    t = t.replace(/'_legacy-next',\s*'_legacy-next',/g, "'_legacy-next',");
    t = t.replace(/_legacy-next\/_legacy-next\//g, '_legacy-next/');
  }
  // 2) segmentovy zapis: join(ROOT, 'pages', ...) -> join(ROOT, '_legacy-next', 'pages', ...)
  t = t.replace(/(?<!'_legacy-next',\s{0,4})'pages'\s*,/g, "'_legacy-next', 'pages',");
  t = t.replace(/(?<!'_legacy-next',\s{0,4})'components'\s*,/g, "'_legacy-next', 'components',");
  // 3) retezcovy zapis: 'pages/profil.js' -> '_legacy-next/pages/profil.js'
  t = t.replace(/(['"`])(?!_legacy-next\/)pages\//g, '$1_legacy-next/pages/');
  t = t.replace(/(['"`])(?!_legacy-next\/)components\//g, '$1_legacy-next/components/');
  t = t.replace(/(?<!'_legacy-next',\s{0,4})'hooks'\s*,/g, "'_legacy-next', 'hooks',");
  t = t.replace(/(['"`])(?!_legacy-next\/)hooks\//g, '$1_legacy-next/hooks/');
  t = t.replace(/(?<!'_legacy-next',\s{0,4})'styles'\s*,/g, "'_legacy-next', 'styles',");
  t = t.replace(/(['"`])(?!_legacy-next\/)styles\//g, '$1_legacy-next/styles/');
  // 4) znovu zrusit pripadne zdvojeni
  for (let i = 0; i < 5; i++) {
    t = t.replace(/'_legacy-next',\s*'_legacy-next',/g, "'_legacy-next',");
    t = t.replace(/_legacy-next\/_legacy-next\//g, '_legacy-next/');
  }
  return t;
}

let souboru = 0;
for (const soubor of SLOZKY.flatMap((d) => projdi(path.join(ROOT, d)))) {
  const puvodni = fs.readFileSync(soubor, 'utf8');
  const novy = srovnej(puvodni);
  if (novy !== puvodni) { fs.writeFileSync(soubor, novy); souboru += 1; }
}
console.log('srovnano souboru=' + souboru);
