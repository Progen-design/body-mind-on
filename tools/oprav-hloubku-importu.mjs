// Druhy pruchod: presun pages/api -> api zmenil hloubku o jednu uroven.
// Cestu proto nepocitame z puvodniho zapisu, ale od korene repa.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const KOD = new Set(['.js', '.mjs', '.ts']);
// prazdny retezec jako prvni: cesta uz muze mit spravnou priponu, jen spatnou hloubku
const PRIPONY = ['', '.js', '.mjs', '.ts', '/index.js', '/index.mjs'];

function projdi(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) projdi(p, out);
    else if (KOD.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

/** Z '../../../lib/mail' vytahne 'lib/mail' a overi, ze to od korene existuje. */
function cilOdKorene(spec) {
  const bezTecek = spec.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  if (!bezTecek || bezTecek.startsWith('.')) return null;
  for (const p of PRIPONY) {
    const abs = path.resolve(ROOT, bezTecek + p);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return { abs, sPriponou: bezTecek + p };
  }
  return null;
}

const VZOR = /(\bfrom\s*|\bimport\s*\(\s*|\bexport\s+\*\s+from\s*|\bexport\s*\{[^}]*\}\s*from\s*)(['"])(\.[^'"]*)\2/g;
const SLOZKY = ['api', 'lib', 'data', 'scripts'];

let opraveno = 0, souboru = 0;
const nevyreseno = [];

for (const soubor of SLOZKY.flatMap((d) => projdi(path.join(ROOT, d)))) {
  const dir = path.dirname(soubor);
  const puvodni = fs.readFileSync(soubor, 'utf8');
  let pocet = 0;

  const novy = puvodni.replace(VZOR, (cely, pred, q, spec) => {
    // uz platny import necham byt
    const primo = path.resolve(dir, spec);
    if (/\.(js|mjs|ts|json|html|css)$/.test(spec) && fs.existsSync(primo)) return cely;

    const cil = cilOdKorene(spec);
    if (!cil) {
      nevyreseno.push(path.relative(ROOT, soubor) + ' -> ' + spec);
      return cely;
    }
    let rel = path.relative(dir, cil.abs).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    if (rel === spec) return cely;
    pocet += 1;
    return pred + q + rel + q;
  });

  if (pocet > 0) { fs.writeFileSync(soubor, novy); souboru += 1; opraveno += pocet; }
}

console.log('hloubka: opraveno=' + opraveno + ' v souborech=' + souboru);
console.log('stale nevyreseno=' + nevyreseno.length);
for (const n of nevyreseno.slice(0, 25)) console.log('  ' + n);
