// Co obchodní podmínky slibují, to musí jít v aplikaci najít.
//
// Bod 9 podmínek: „Předplatné můžeš kdykoli zrušit ve svém profilu."
// Bod 11: „Účet i s daty můžeš nechat smazat — použij smazání účtu v profilu."
//
// Do 9. 9. 2026 neplatilo ani jedno. `/api/delete-account` existoval od
// začátku, ale v `src/` na něj nevedl JEDINÝ odkaz — tlačítko nikde. Zrušení
// předplatného neexistovalo vůbec: ani API, ani UI, ani Stripe portál.
// U trialu se přitom lidem psalo „zrušit můžeš kdykoli v profilu" a osmý den
// se strhlo 599 Kč.
//
// Tenhle test hlídá to, co se v testech jinak nedá chytit: že cesta z textu
// do funkční akce nikde nechybí. Endpoint sám o sobě prochází i tehdy, když
// na něj nic neklikne.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const SEKCE = cti('src/components/UcetASpravaSection.tsx');
const APP = cti('src/App.tsx');
const CANCEL = cti('api/subscription/cancel.js');
const SMAZANI = cti('api/delete-account.js');

test('sekce je v profilu vykreslená — jinak na ni nikdo nenarazí', () => {
  assert.match(APP, /import \{ UcetASpravaSection \}/, 'App komponentu neimportuje');
  assert.match(APP, /<UcetASpravaSection\s*\/>/, 'App sekci nekreslí');
});

test('zrušení předplatného volá endpoint, který opravdu existuje', () => {
  assert.match(SEKCE, /'\/api\/subscription\/cancel'/, 'UI zrušení nikam nevolá');
  assert.match(SEKCE, /method: 'POST'/, 'zrušení se musí volat POSTem');
  assert.match(CANCEL, /req\.method !== 'POST'/, 'endpoint POST nehlídá');
});

test('zrušení je ke KONCI období, ne okamžité — podmínky slibují doběhnutí', () => {
  // Okamžité `subscriptions.cancel()` by uživatele připravilo o dny, které
  // má zaplacené. Bod 9 podmínek říká pravý opak.
  assert.match(CANCEL, /cancel_at_period_end/, 'endpoint neruší ke konci období');
  assert.ok(
    !/stripe\.subscriptions\.cancel\(/.test(CANCEL),
    'okamžité storno bere zaplacené dny — podmínky slibují doběhnutí období'
  );
});

test('zrušení jde vzít zpět, dokud období běží', () => {
  assert.match(CANCEL, /obnovit/, 'endpoint neumí zrušení vrátit');
  assert.match(SEKCE, /Vrátit zpět/, 'UI nenabízí návrat po omylu');
});

test('endpoint si stav členství nepřepisuje sám — pravdu potvrdí webhook', () => {
  // Dvě místa, která zapisují tentýž stav, se dřív nebo později rozejdou.
  assert.ok(
    !/from\('memberships'\)[\s\S]{0,200}\.update\(/.test(CANCEL),
    'endpoint zapisuje do memberships; stav má přijít webhookem'
  );
});

test('smazání účtu vede na endpoint a posílá potvrzení, které server vyžaduje', () => {
  assert.match(SEKCE, /'\/api\/delete-account'/, 'UI smazání nikam nevolá');
  assert.match(SEKCE, /confirm: true/, 'chybí potvrzení, server bez něj vrátí 400');
  assert.match(SMAZANI, /confirm !== true/, 'server potvrzení nevyžaduje');
});

test('smazání chce OPSAT slovo, ne jen druhý klik — je nevratné', () => {
  assert.match(SEKCE, /SLOVO_POTVRZENI = 'SMAZAT'/, 'chybí opisované slovo');
  assert.match(
    SEKCE,
    /opsaneSlovo\.trim\(\)\.toUpperCase\(\) !== SLOVO_POTVRZENI/,
    'tlačítko se dá zmáčknout bez opsání slova'
  );
});

test('po smazání účtu se odhlašuje — session na neexistující účet je rozbitý stav', () => {
  assert.match(SEKCE, /useAuth\(\)/, 'sekce nemá přístup k odhlášení');
  assert.match(SEKCE, /logout\(\);/, 'po smazání zůstává platná session');
});

test('sekce odkazuje na právní texty na veřejném webu, ne do SPA', () => {
  assert.match(SEKCE, /ODKAZ_PODMINKY/, 'chybí odkaz na obchodní podmínky');
  assert.match(SEKCE, /ODKAZ_GDPR/, 'chybí odkaz na ochranu údajů');
  assert.ok(
    !/href="\/obchodni-podminky"/.test(SEKCE),
    'relativní odkaz by v appce mířil na 404 — texty žijí na webu'
  );
});
