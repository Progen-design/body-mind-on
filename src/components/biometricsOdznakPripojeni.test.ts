// ODZNAK „PŘIPOJENO" SE NESMÍ ROZSVÍTIT BEZ SIGNÁLU O PŘIPOJENÍ.
//
// 22. 9. 2026: na obrazovce Profil → „Regenerace & spánek" svítilo
// u „Withings Body Scan" i „Apple Health" „připojeno" natvrdo, bez jakékoli
// podmínky — `withings_connections` přitom nemá jediný řádek, nikdo se nikdy
// nepřipojil. `PropojenaZarizeniSection` tuhle chybu dostala opravenou
// 23. 8. 2026 a `BodyCompositionSection` má podmínku `!zdraviPosledni`;
// do `BiometricsSection` se oprava nedostala.
//
// Testuje se zdroj, ne render: odznak je JSX bez vlastní funkce, takže
// jediné, co jde uhlídat, je že text „připojeno" nikde nestojí nepodmíněně
// a že komponenta dostává reálný signál z `App.tsx`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const BIOMETRICS = cti('src/components/BiometricsSection.tsx');
const APP = cti('src/App.tsx');

test('BiometricsSection má povinné props se stavem připojení', () => {
  // Povinné schválně — volitelný prop s výchozím true by vrátil přesně tu
  // chybu, kterou tenhle test hlídá, a nikdo by si toho nevšiml.
  assert.match(BIOMETRICS, /hasWithingsConnection: boolean;/);
  assert.match(BIOMETRICS, /zdraviPripojeno: boolean;/);
  assert.match(BIOMETRICS, /withingsLastSyncedAt\?: string \| null;/);
});

test('u Withings nesvítí „připojeno" bez hasWithingsConnection', () => {
  assert.match(
    BIOMETRICS,
    /\{hasWithingsConnection \? 'připojeno' : 'nepřipojeno'\}/,
    'odznak váhy musí být ternární podle hasWithingsConnection',
  );
});

test('u Apple Health nesvítí „připojeno" bez zdraviPripojeno', () => {
  assert.match(
    BIOMETRICS,
    /\{zdraviPripojeno \? 'připojeno' : 'nepřipojeno'\}/,
    'odznak hodinek musí být ternární podle zdraviPripojeno',
  );
});

test('v komponentě nezůstal žádný natvrdo napsaný odznak „připojeno"', () => {
  // Hledá se text odznaku, který nestojí uvnitř JSX výrazu `{...}`.
  // „nepřipojeno" končí stejnými znaky, proto negativní lookbehind na „ne".
  // Komentáře o té chybě samotné slovo obsahují taky — počítá se jen kód.
  const kod = BIOMETRICS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const natvrdo = kod.match(/(?<!ne)připojeno/g) ?? [];
  const vTernarni = kod.match(/\? 'připojeno' : 'nepřipojeno'/g) ?? [];
  assert.equal(
    natvrdo.length,
    vTernarni.length,
    `text „připojeno" se v komponentě vyskytuje ${natvrdo.length}×, ale podmíněně jen ${vTernarni.length}× — zbytek je natvrdo`,
  );
});

test('barva odznaku a tečky sleduje stav, ne konstantu', () => {
  // Nepřipojený stav = amber, stejně jako v BodyCompositionSection/WithingsCard.
  assert.match(BIOMETRICS, /hasWithingsConnection[\s\S]{0,160}bg-amber-950\/60 text-amber-300/);
  assert.match(BIOMETRICS, /zdraviPripojeno[\s\S]{0,160}bg-amber-950\/60 text-amber-300/);
});

test('App.tsx posílá stav připojení ze zdrojů, které už má', () => {
  assert.match(APP, /hasWithingsConnection=\{profilData\?\.has_withings_connection === true\}/);
  assert.match(APP, /withingsLastSyncedAt=\{profilData\?\.withings_last_sync_at \?\? null\}/);
  assert.match(APP, /zdraviPripojeno=\{zdravi\.pripojeno === true\}/);
});
