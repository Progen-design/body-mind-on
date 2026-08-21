import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_TAB, TAB_PATHS, pathForTab, tabFromPath } from './routing.ts';

test('/profil otevře záložku profil', () => {
  assert.equal(tabFromPath('/profil'), 'profil');
});

test('každá záložka má vlastní adresu a cesta tam a zpět sedí', () => {
  const tabs = Object.keys(TAB_PATHS) as (keyof typeof TAB_PATHS)[];
  const cesty = tabs.map(pathForTab);

  assert.equal(new Set(cesty).size, cesty.length, 'dve zalozky sdileji adresu');
  for (const tab of tabs) {
    assert.equal(tabFromPath(pathForTab(tab)), tab, `nesedi kolo pro ${tab}`);
  }
});

test('kořen vede na přehled', () => {
  assert.equal(tabFromPath('/'), 'dnes');
  assert.equal(pathForTab('dnes'), '/');
});

test('neznámá adresa není chyba, ale přehled', () => {
  for (const cesta of ['/neexistuje', '/profil/detail/nesmysl', '/api/profile', '']) {
    assert.equal(tabFromPath(cesta), DEFAULT_TAB, `spatny fallback pro "${cesta}"`);
  }
});

test('velikost písmen ani koncové lomítko nerozhodují', () => {
  assert.equal(tabFromPath('/Profil'), 'profil');
  assert.equal(tabFromPath('/profil/'), 'profil');
  assert.equal(tabFromPath('/PROFIL/'), 'profil');
  assert.equal(tabFromPath('  /profil  '), 'profil');
});

test('starší a anglické tvary adres vedou na správnou záložku', () => {
  assert.equal(tabFromPath('/profile'), 'profil');
  assert.equal(tabFromPath('/dashboard'), 'dnes');
  assert.equal(tabFromPath('/navyky'), 'naviky');
  assert.equal(tabFromPath('/naviky'), 'naviky');
  assert.equal(tabFromPath('/apple-watch'), 'regenerace');
});

test('cesta bez úvodního lomítka se srovná', () => {
  assert.equal(tabFromPath('profil'), 'profil');
});
