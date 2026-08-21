// Kolik cviku by import dodal na kazdou dvojici (vybaveni, partie).
import { readFileSync } from 'fs';
import { pripravRadek } from '../lib/exerciseImportRun.js';

const zdroj = JSON.parse(readFileSync('.cache/free-exercise-db.json', 'utf8'));
const SVALY = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs', 'glutes', 'quads', 'hamstrings', 'calves'];
const TRIDY = ['body_weight', 'dumbbell', 'barbell', 'cable', 'machine', 'kettlebell', 'band'];

const mapa = new Map();
const duvody = new Map();
let ok = 0;
const klice = new Set();
let kolizeKlicu = 0;

for (const c of zdroj) {
  const r = pripravRadek(c);
  if (r.duvod) { duvody.set(r.duvod.split(':')[0], (duvody.get(r.duvod.split(':')[0]) || 0) + 1); continue; }
  if (klice.has(r.radek.canonical_key)) { kolizeKlicu += 1; continue; }
  klice.add(r.radek.canonical_key);
  ok += 1;
  const k = `${r.radek.equipment_class}|${r.radek.primary_muscle}`;
  mapa.set(k, (mapa.get(k) || 0) + 1);
}

console.log(`prosly branou importeru: ${ok} z ${zdroj.length}`);
console.log(`kolize kanonickych klicu: ${kolizeKlicu}`);
console.log('');
console.log('duvody zahozeni:', Object.fromEntries([...duvody.entries()].sort((a, b) => b[1] - a[1])));
console.log('');
console.log('POKRYTI (radek = vybaveni, sloupec = partie, minimum je 5):');
console.log('               ' + SVALY.map((s) => s.slice(0, 6).padStart(7)).join(''));
let dvojicPod5 = 0; let dvojicOk = 0;
for (const t of TRIDY) {
  const bunky = SVALY.map((s) => {
    const n = mapa.get(`${t}|${s}`) || 0;
    if (n >= 5) dvojicOk += 1; else dvojicPod5 += 1;
    return String(n).padStart(7);
  });
  console.log(t.padEnd(15) + bunky.join(''));
}
console.log('');
console.log(`dvojic s aspon 5 cviky: ${dvojicOk} ze 70, pod minimem: ${dvojicPod5}`);
