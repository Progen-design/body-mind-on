// Zalozka "Navyky & Streaky" byla odstranena. Tenhle skript vycisti zbyle
// odkazy, aby nevedly do prazdna: kartu v prehledu a polozku v menu.
import fs from 'node:fs';

function vyriz(cesta, od, doo, popis) {
  let t = fs.readFileSync(cesta, 'utf8');
  const i = t.indexOf(od);
  if (i === -1) { console.log('  PRESKOCENO (zacatek nenalezen): ' + popis); return; }
  const j = t.indexOf(doo, i);
  if (j === -1) { console.log('  PRESKOCENO (konec nenalezen): ' + popis); return; }
  t = t.slice(0, i) + t.slice(j + doo.length);
  fs.writeFileSync(cesta, t);
  console.log('  odstraneno: ' + popis);
}

console.log('OverviewBentoGrid.tsx');
vyriz(
  'src/components/OverviewBentoGrid.tsx',
  '      {/* \n        ========================================================================\n        KARTA 5: Denní návyky',
  "            <span>Zobrazit kompletní týdenní matici návyků</span>\n            <ChevronRight className=\"w-3.5 h-3.5\" />\n          </button>\n        </div>\n      </motion.div>\n",
  'karta 5 - navyky se streaky'
);

console.log('Header.tsx');
vyriz(
  'src/components/Header.tsx',
  "                    { id: 'naviky', label: 'Denní návyky & Streaky' },\n",
  '',
  'polozka v slide-out menu'
);
