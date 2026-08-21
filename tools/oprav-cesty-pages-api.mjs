// API routy se presunuly z pages/api/ do api/. Nekterym testum a skriptum
// jsme tim rozbili cestu, kterou maji zapsanou jako retezec.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SLOZKY = ['api', 'lib', 'scripts', 'src'];
const PRIPONY = new Set(['.js', '.mjs', '.ts', '.tsx', '.json', '.md']);

function projdi(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) projdi(p, out);
    else if (PRIPONY.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

let souboru = 0;
let vyskytu = 0;

for (const soubor of SLOZKY.flatMap((d) => projdi(path.join(ROOT, d)))) {
  const puvodni = fs.readFileSync(soubor, 'utf8');
  if (!puvodni.includes('pages/api')) continue;
  const pocet = (puvodni.match(/pages\/api/g) || []).length;
  fs.writeFileSync(soubor, puvodni.split('pages/api').join('api'));
  souboru += 1;
  vyskytu += pocet;
}

console.log('pages/api -> api : vyskytu=' + vyskytu + ' v souborech=' + souboru);
