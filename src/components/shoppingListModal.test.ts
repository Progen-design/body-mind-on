// PROMPT_UX_DNES.md bod E — „Zaškrtnout vše" jako JEDNO dávkové volání na
// server (ne jedno PATCH na položku) a tisk/PDF stejným window.print()
// vzorem jako ExportMealPlanModal.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const MODAL = cti('src/components/ShoppingListModal.tsx');
const APP = cti('src/App.tsx');
const API = cti('api/shopping-extras.js');
const CSS = cti('src/index.css');

test('modál má tlačítko zaškrtnout/odškrtnout vše a volá jeden callback', () => {
  assert.match(MODAL, /onToggleAll/, 'modál nedostává onToggleAll');
  assert.match(MODAL, /Zaškrtnout vše|Odškrtnout vše/, 'chybí text tlačítka');
});

test('App posílá zaškrtnutí všech jedním dávkovým PATCH, ne smyčkou jednotlivých', () => {
  assert.match(APP, /handleToggleAllShoppingItems/, 'App nemá handler pro hromadné zaškrtnutí');
  // Jeden apiFetch s polem `ids` v handleru, ne .map(...).forEach(apiFetch).
  const [, telo] = APP.split('const handleToggleAllShoppingItems');
  assert.ok(telo, 'handler chybí');
  const blok = telo.slice(0, 900);
  assert.match(blok, /ids:\s*idsNaServer/, 'handler neposílá dávkové pole ids');
  assert.ok(!/\.forEach\(.*apiFetch/s.test(blok), 'handler pořád volá apiFetch ve smyčce');
});

test('server (api/shopping-extras.js) umí PATCH s polem ids, ne jen jedno id', () => {
  assert.match(API, /Array\.isArray\(telo\.ids\)/, 'endpoint nerozezná dávkové volání');
  assert.match(API, /\.in\('id', ids\)/, 'endpoint neaktualizuje víc řádků najednou přes .in()');
});

test('tisk nákupního seznamu jede stejným window.print() vzorem, žádný jsPDF', () => {
  assert.match(MODAL, /window\.print\(\)/, 'chybí window.print()');
  assert.match(MODAL, /id="tiskovy-nakupni-seznam"/, 'chybí tisknutelný uzel se svým id');
  assert.ok(!MODAL.includes('jspdf'), 'do modálu se dostala nová závislost jsPDF');
});

test('tiskový CSS blok skrývá zbytek appky i pro nákupní seznam, ne jen pro jídelníček', () => {
  assert.match(CSS, /#tiskovy-nakupni-seznam,\s*\n\s*#tiskovy-nakupni-seznam \*/, 'nákupní seznam není v pravidlech viditelnosti při tisku');
  assert.match(CSS, /#tiskovy-nakupni-seznam \.polozka-kategorie/, 'kategorie se může rozpadnout přes dvě stránky');
});

test('tiskový dokument nákupního seznamu je bez zaškrtávátek, navigace a tlačítek — jen kategorie a množství', () => {
  const zacatek = MODAL.indexOf('id="tiskovy-nakupni-seznam"');
  assert.ok(zacatek > -1, 'tisknutelný blok chybí');
  const konec = MODAL.indexOf('{/* Categories Bar', zacatek) > -1
    ? MODAL.indexOf('{/* Categories Bar', zacatek)
    : MODAL.length;
  const blok = MODAL.slice(zacatek, konec === MODAL.length ? zacatek + 2000 : konec);
  assert.ok(!blok.includes('onToggleItem'), 'tiskový blok má klikací zaškrtávátka');
  assert.ok(blok.includes('item.amount'), 'tiskový blok neukazuje množství');
});
