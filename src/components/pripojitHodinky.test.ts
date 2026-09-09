// Propojení hodinek musí mít v aplikaci cestu, ne jen radu.
//
// Do 9. 9. 2026 karta zařízení psala „nastav odesílání v Health Auto Export",
// ale adresu ani klíč nikde neukázala — návod popisoval krok, který uživatel
// nemohl udělat. Server přitom klíč vyrobit uměl.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const TLACITKO = cti('src/components/PripojitHodinky.tsx');
const ZARIZENI = cti('src/components/PropojenaZarizeniSection.tsx');
const ROTATE = cti('api/health/connections/rotate.js');

test('karta zařízení nabízí propojení, ne jen text o Health Auto Export', () => {
  assert.match(ZARIZENI, /<PripojitHodinky\s*\/>/, 'karta tlačítko nekreslí');
  assert.match(ZARIZENI, /import \{ PripojitHodinky \}/, 'karta komponentu neimportuje');
  assert.ok(
    !/nastav odesílání na Body/.test(ZARIZENI),
    'zpátky je slepá rada bez adresy a klíče'
  );
});

test('tlačítko volá endpoint, který klíč opravdu vyrábí', () => {
  assert.match(TLACITKO, /'\/api\/health\/connections\/rotate'/, 'chybí volání rotate');
  assert.match(TLACITKO, /method: 'POST'/, 'rotate se musí volat POSTem');
  assert.match(TLACITKO, /'\/api\/health\/connection'/, 'nečte se stav připojení');
});

test('server posílá adresu i klíč — samotný klíč nemá kam napsat', () => {
  assert.match(ROTATE, /adresaProIngest\(\)/, 'rotate neposílá adresu ingestu');
  assert.equal(
    (ROTATE.match(/ingest_url: adresaProIngest\(\)/g) || []).length,
    3,
    'adresa chybí u některé z odpovědí rotate (vytvoření, rotace, rotace s varováním)'
  );
  assert.match(TLACITKO, /ingest_url/, 'UI adresu ze serveru nezobrazuje');
});

test('klíč se ukazuje jednou a UI to říká', () => {
  // Server ukládá jen hash, zpětně klíč nikdo nepřečte. Kdyby to UI
  // nenapsalo, uživatel by ho zavřel a nevěděl, že je pryč.
  assert.match(TLACITKO, /vidíš jenom teď/i, 'chybí varování, že klíč je jednorázový');
  assert.match(TLACITKO, /x-api-key/, 'chybí název hlavičky, do které klíč patří');
});

test('adresa se skládá na serveru, ne natvrdo ve frontendu', () => {
  // Dvě verze adresy by se při změně projektu rozešly.
  assert.ok(
    !/supabase\.co/.test(TLACITKO),
    'adresa Supabase je natvrdo ve frontendu'
  );
  const POMOCNIK = cti('lib/health/ingestUrl.js');
  assert.match(POMOCNIK, /SUPABASE_URL/, 'adresa se nebere z prostředí');
  assert.match(POMOCNIK, /apple-health-ingest/, 'chybí název edge funkce');
});
