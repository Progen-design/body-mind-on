// Zaškrtávátko jídla v přehledu — do 17. 9. 2026 byl nezaškrtnutý stav
// prázdný čtverec bez ikony (`rounded-lg` bez SVG uvnitř), takže vypadal
// jako rozbitý obrázek a nikdo nepoznal, že je to ovládací prvek.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const BENTO = fs.readFileSync(path.join(KOREN, 'src', 'components', 'OverviewBentoGrid.tsx'), 'utf8');

test('zaškrtávátko jídla kreslí ikonu v OBOU stavech, ne jen po odškrtnutí', () => {
  // Dřív `{meal.completed && <Check .../>}` — nezaškrtnutý stav byl bez
  // jediného SVG, tedy bez jakéhokoli vizuálního náznaku ovládacího prvku.
  assert.ok(
    !/\{meal\.completed && <Check/.test(BENTO),
    'ikona se pořád kreslí jen po zaškrtnutí — nezaškrtnutý stav zůstane prázdný'
  );
  assert.match(BENTO, /<Check className="w-3\.5 h-3\.5 stroke-\[3\]" \/>/, 'ikona checku chybí úplně');
});

test('nezaškrtnutý stav má viditelnou barvu ikony, ne text-transparent, a kulatější tvar', () => {
  const [, ostatek] = BENTO.split('onToggleMeal(meal.id)');
  assert.ok(ostatek, 'tlačítko pro odškrtnutí jídla chybí');
  const blokTridy = ostatek.slice(0, 700);

  assert.match(blokTridy, /rounded-xl/, 'tvar musí být kulatější (rounded-xl), ne rounded-lg');
  assert.ok(!/rounded-lg/.test(blokTridy), 'starý hranatější rounded-lg tu nesmí zůstat');
  assert.match(
    blokTridy,
    /border-slate-700 bg-slate-800 text-slate-600/,
    'nezaškrtnutý stav musí mít viditelnou (ne transparentní) barvu ikony'
  );
  assert.ok(!/text-transparent/.test(blokTridy), 'ikona nesmí být schovaná přes text-transparent');
});
