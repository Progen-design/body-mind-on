// Kolik cviku slovnik pojmenuje a co ho shodilo.
import { readFileSync } from 'fs';
import { nazevCviku, SLOVNIK_VELIKOST } from '../lib/exerciseNameCs.js';

const d = JSON.parse(readFileSync('.cache/free-exercise-db.json', 'utf8'));
const VYBAVENI_OK = new Set(['body only', 'dumbbell', 'barbell', 'cable', 'machine', 'kettlebells', 'bands']);
const KATEGORIE_OK = new Set(['strength', 'plyometrics', 'cardio']);

const vhodne = d.filter((e) => VYBAVENI_OK.has(e.equipment) && KATEGORIE_OK.has(e.category)
  && (e.primaryMuscles || []).length && (e.images || []).length);

const ok = []; const spadlo = []; const cetnostNeznamych = new Map();
for (const e of vhodne) {
  const r = nazevCviku(e.name);
  if (r.nazev) ok.push([e.name, r.nazev]);
  else {
    spadlo.push([e.name, r.nezname.join(',')]);
    for (const t of r.nezname) cetnostNeznamych.set(t, (cetnostNeznamych.get(t) || 0) + 1);
  }
}

console.log(`slovnik: ${SLOVNIK_VELIKOST} polozek`);
console.log(`pojmenovano: ${ok.length} / ${vhodne.length} (${Math.round(100 * ok.length / vhodne.length)} %)`);
console.log('');
console.log('nejcastejsi neznama slova:');
for (const [t, c] of [...cetnostNeznamych.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(`   ${t.padEnd(18)} ${c}`);
}
console.log('');
console.log('UKAZKA POJMENOVANYCH:');
for (const [en, cs] of ok.slice(0, 30)) console.log(`   ${en.padEnd(42)} -> ${cs}`);
