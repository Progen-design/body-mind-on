// Overi, ze vsech 104 Vercel Functions jde naimportovat cistym Node ESM,
// tedy bez Next.js. Rozlisuje chybu rozliseni cesty od chyby za behu.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

function projdi(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) projdi(p, out);
    else if (p.endsWith('.js') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const soubory = projdi(path.join(ROOT, 'api'));
let ok = 0;
const chybiModul = [];
const jineChyby = [];

for (const s of soubory) {
  try {
    const mod = await import(pathToFileURL(s).href);
    if (typeof mod.default === 'function') ok += 1;
    else jineChyby.push([path.relative(ROOT, s), 'chybi default export']);
  } catch (e) {
    const zprava = String(e && e.message || e);
    if (e && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND')) {
      chybiModul.push([path.relative(ROOT, s), zprava.split('\n')[0].slice(0, 140)]);
    } else {
      jineChyby.push([path.relative(ROOT, s), (e && e.code ? e.code + ': ' : '') + zprava.slice(0, 110)]);
    }
  }
}

console.log('API rout celkem: ' + soubory.length);
console.log('naimportovano s default exportem: ' + ok);
console.log('CHYBA ROZLISENI CESTY: ' + chybiModul.length);
for (const [f, m] of chybiModul.slice(0, 25)) console.log('  ' + f + '\n      ' + m);
console.log('jine chyby (env, side effect): ' + jineChyby.length);
for (const [f, m] of jineChyby.slice(0, 15)) console.log('  ' + f + ' :: ' + m);
