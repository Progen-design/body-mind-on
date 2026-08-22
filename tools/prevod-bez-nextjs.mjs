// Prevod na ciste Vercel Functions bez Next.js.
// 1) slouci package.json (skripty a zavislosti z Nextu + Vite, bez nextu)
// 2) doplni pripony u relativnich importu, aby platily v cistem ESM
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);

// ---------- 1) package.json ----------
const stary = JSON.parse(read(path.join(ROOT, '_legacy-next', 'package.json')));
const dep = stary.dependencies || {};
const dev = stary.devDependencies || {};

delete dep.next;
delete dev['eslint-config-next'];

dep.react = '^19.2.0';
dep['react-dom'] = '^19.2.0';
dep.motion = '^12.23.24';
dep['@vercel/functions'] = '^3.1.0';

dev.vite = '^6.2.3';
dev['@vitejs/plugin-react'] = '^5.0.4';
dev['@tailwindcss/vite'] = '^4.1.14';
dev['@types/node'] = '^22.14.0';
dev['@types/react-dom'] = '^19.2.0';
dev['@vercel/node'] = '^5.1.0';

const s = stary.scripts || {};
s.dev = 'vite --port=3000 --host=0.0.0.0';
s.build = 'vite build';
s.preview = 'vite preview';
delete s.start;
s.lint = 'eslint api lib src';
s['lint:ci'] = 'eslint lib/mail.js';
s.typecheck = 'tsc --noEmit';

const novy = {
  name: 'body-and-mind-on',
  version: stary.version || '1.0.0',
  private: true,
  type: 'module',
  scripts: s,
  dependencies: Object.fromEntries(Object.entries(dep).sort()),
  devDependencies: Object.fromEntries(Object.entries(dev).sort())
};
write(path.join(ROOT, 'package.json'), JSON.stringify(novy, null, 2) + '\n');
console.log('package.json: skriptu=' + Object.keys(s).length +
  ' dep=' + Object.keys(dep).length + ' dev=' + Object.keys(dev).length +
  ' next=' + ('next' in dep));

// ---------- 2) pripony u relativnich importu ----------
const SLOZKY = ['api', 'lib', 'data', 'scripts'];
const KOD = new Set(['.js', '.mjs', '.ts']);
const KANDIDATI = ['.js', '.mjs', '.ts', '/index.js', '/index.mjs'];

function projdi(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) projdi(p, out);
    else if (KOD.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function doplnPriponu(specifier, souborDir) {
  if (!specifier.startsWith('.')) return null;
  if (/\.(js|mjs|ts|json|html|css)$/.test(specifier)) return null;
  for (const k of KANDIDATI) {
    if (fs.existsSync(path.resolve(souborDir, specifier + k))) {
      return specifier + (k.startsWith('/') ? k : k);
    }
  }
  return null;
}

let zmenenoSouboru = 0;
let zmenenoImportu = 0;
let nenalezeno = [];

const VZOR = /(\bfrom\s*|\bimport\s*\(\s*|\bexport\s+\*\s+from\s*|\bexport\s*\{[^}]*\}\s*from\s*)(['"])(\.[^'"]*)\2/g;

for (const soubor of SLOZKY.flatMap((d) => projdi(path.join(ROOT, d)))) {
  const dir = path.dirname(soubor);
  const puvodni = read(soubor);
  let pocet = 0;
  const novyObsah = puvodni.replace(VZOR, (cely, pred, q, spec) => {
    const opraveny = doplnPriponu(spec, dir);
    if (!opraveny) {
      if (spec.startsWith('.') && !/\.(js|mjs|ts|json|html|css)$/.test(spec)) {
        nenalezeno.push(path.relative(ROOT, soubor) + ' -> ' + spec);
      }
      return cely;
    }
    pocet += 1;
    return pred + q + opraveny + q;
  });
  if (pocet > 0) {
    write(soubor, novyObsah);
    zmenenoSouboru += 1;
    zmenenoImportu += pocet;
  }
}

console.log('importy: opraveno=' + zmenenoImportu + ' v souborech=' + zmenenoSouboru);
console.log('neresolvovatelne=' + nenalezeno.length);
for (const n of nenalezeno.slice(0, 20)) console.log('  ' + n);
