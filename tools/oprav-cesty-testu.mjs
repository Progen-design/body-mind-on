// Testy a verify skripty ctou zdrojaky podle cesty. Po presunu plati:
//   pages/api/*  -> api/*                 (uz bez Next.js, finalni misto)
//   pages/*.js   -> _legacy-next/pages/*  (UI stranky cekaji na prepis do SPA)
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

const NAHRADY = [
  [/\[\s*'lib'\s*,\s*'pages'\s*,\s*'components'\s*,\s*'scripts'\s*\]/g, "['lib', 'api', 'scripts']"],
  [/\[\s*'lib'\s*,\s*'pages'\s*\]/g, "['lib', 'api']"],
  [/'pages'\s*,\s*'api'\s*,/g, "'api',"],
  [/'\.\.'\s*,\s*'pages'\s*,/g, "'..', '_legacy-next', 'pages',"],
  [/'pages'\s*,/g, "'_legacy-next', 'pages',"],
  [/'components'\s*,/g, "'_legacy-next', 'components',"],
  [/(['"])components\//g, "$1_legacy-next/components/"]
];

let souboru = 0, zmen = 0;
for (const soubor of SLOZKY.flatMap((d) => projdi(path.join(ROOT, d)))) {
  const puvodni = fs.readFileSync(soubor, 'utf8');
  let novy = puvodni;
  for (const [vzor, cim] of NAHRADY) novy = novy.replace(vzor, cim);
  if (novy !== puvodni) {
    fs.writeFileSync(soubor, novy);
    souboru += 1;
    zmen += 1;
    console.log('  upraveno: ' + path.relative(ROOT, soubor));
  }
}
console.log('celkem souboru=' + souboru);
