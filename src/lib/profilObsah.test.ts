/**
 * CO SMÍ A NESMÍ BÝT V PROFILU.
 *
 * Po sloučení záložek Přehled a Můj profil se do jedné stránky sešlo všechno,
 * takže duplicity a nepravdivá tvrzení jsou najednou vidět vedle sebe.
 * Tenhle test hlídá, co se 23. 8. 2026 opravovalo, ať se to nevrátí.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cti = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Komentáře popisují historii — kontroluje se kód. */
function kod(text: string): string {
  return text
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((r) => !r.trim().startsWith('//'))
    .join('\n');
}

const PROFIL = kod(cti('../components/ProfileSection.tsx'));
const BENTO = kod(cti('../components/OverviewBentoGrid.tsx'));
const APP = kod(cti('../App.tsx'));

test('AI trenér TED je v profilu jen jednou', () => {
  // TED byl jako dlaždice mezi zařízeními a zároveň jako vlastní karta níž.
  // Není zařízení, nic nesynchronizuje — z karty zařízení proto zmizel.
  assert.ok(!PROFIL.includes('AI trenér TED'), 'TED je zpátky mezi zařízeními');
  assert.ok(!PROFIL.includes('useTed'), 'ProfileSection zase sahá na TEDa');
  assert.ok(BENTO.includes('AI Trenér TED'), 'karta TEDa musí v Bento gridu zůstat');
});

test('prázdný štít členství se nevrátil', () => {
  // `profile.membershipPlan` se plní z user_metadata.membership_plan, kam
  // nikdo nezapisuje — v UI zbyla ikona štítu bez textu.
  assert.ok(!PROFIL.includes('membershipPlan'), 'prázdný tarif je zpátky v profilu');
  assert.ok(!PROFIL.includes('ShieldCheck'), 'ikona štítu bez obsahu je zpátky');
});

test('netvrdíme, že data chodí v reálném čase', () => {
  // Withings se stahuje jednou za hodinu, Apple Health posílá iPhone.
  for (const [jmeno, zdroj] of [['App', APP], ['profil', PROFIL], ['bento', BENTO]] as const) {
    assert.ok(!/v re[áa]ln[ée]m [čc]ase/i.test(zdroj), `${jmeno}: „v reálném čase" je zpátky`);
    assert.ok(!/Tep [žz]iv[ěe]|HRV.*[žz]iv[ěe]/i.test(zdroj), `${jmeno}: „živě" je zpátky`);
  }
});

test('u Apple Health je vidět stáří dat, ne jen „Připojeno"', () => {
  // Export v telefonu se muze zastavit a aplikace to sama nepozna.
  // Zmereno 23. 8. 2026: posledni data 22. 8., mezitim probehl trenink.
  assert.ok(PROFIL.includes('zdraviZastarale'), 'chybí kontrola stáří dat z hodinek');
  assert.ok(PROFIL.includes('posledniSynchronizace'), 'profil nedostává čas poslední synchronizace');
  assert.ok(APP.includes('posledniSynchronizace'), 'App čas poslední synchronizace nepředává');
});

test('stáří se počítá z času doručení, ne z data měření', () => {
  // Puvodne se predaval posledni `local_date` z regenerace. To je datum bez
  // casu: „2026-08-23" se naparsovalo jako pulnoc UTC a v UI z toho vzniklo
  // „23. 8. 02:00", zatimco davka dorazila ve 20:57.
  assert.ok(
    APP.includes('zdravi.posledniSync'),
    'čas synchronizace musí jít z last_sync_at, ne z local_date'
  );
  assert.ok(
    !/posledniSynchronizace[\s\S]{0,400}local_date/.test(APP),
    'do stáří synchronizace se zase dostal local_date'
  );
});

test('práh zastarání je jediné místo, kde se soudí', () => {
  // Puvodnich 36 h byla mez pro denni odesilani a schovala by dva dny
  // vypadku. Dvanact hodin ticha uz neni vypadek Wi-Fi, ale zaseknute
  // odesilani; kratsi prah by hlasil poplach pres noc, kdy iOS aplikaci
  // na pozadi bezne uspi.
  const shoda = /HODIN_DO_ZASTARANI = (\d+)/.exec(PROFIL);
  assert.ok(shoda, 'práh zastarání se nedá přečíst');
  const hodin = Number(shoda[1]);
  assert.ok(hodin <= 12, `práh ${hodin} h by schoval celodenní výpadek`);
  assert.ok(hodin >= 6, `práh ${hodin} h by hlásil poplach přes noc`);
});

test('rozdíl mezi zdroji je v UI vidět', () => {
  // Withings server stahuje sam, Apple Health posila iPhone. Kdyz to UI
  // nerekne, uzivatel ceka automatiku i tam, kde zadna neni.
  assert.ok(
    /Server naposled stahoval|Stahuje server sám/.test(PROFIL),
    'u Withings chybí, že stahuje server'
  );
  assert.ok(
    /iPhone/.test(PROFIL),
    'u Apple Health chybí, že data posílá telefon'
  );
});

test('karty netvrdí frekvenci, kterou nikdo neměří', () => {
  // Zmereno 24. 8. 2026 08:20: z 45 payloadu prislo poslednich 8 mezi
  // 23:07:00 a 23:08:08 — jedna davka za 68 sekund, ne hodinova uloha.
  // Pak devet hodin ticho. "Kazdou hodinu" je nastaveni, ne pozorovani,
  // a u Withings je to rozvrh cronu, ne zaznam o tom, ze probehl.
  assert.ok(
    !/každou hodinu/.test(PROFIL),
    'karta zase tvrdí hodinový interval místo naměřeného odstupu'
  );
  assert.ok(
    /odstupText/.test(PROFIL),
    'karta nepočítá odstup od poslední dávky'
  );
});

test('odznak u Apple Health ukazuje odstup, ne verdikt', () => {
  // "Aktualni" u dat starych hodinu a pul bylo tvrzeni navic — opiralo se
  // o predpoklad hodinoveho odesilani, ktery mereni nepotvrdilo.
  assert.ok(
    !/>\s*Aktuální\s*</.test(PROFIL),
    'odznak zase tvrdí „Aktuální" místo naměřeného odstupu'
  );
});

test('záložka Přehled je pryč a profil kreslí obojí', () => {
  const navigace = kod(cti('../components/NavigationTabs.tsx'));
  assert.ok(!navigace.includes("'dnes'"), 'záložka Přehled je zpátky');
  assert.ok(!APP.includes("activeTab === 'dnes'"), 'App zase vetví na Přehled');
  assert.ok(
    APP.includes('<ProfileSection') && APP.includes('<OverviewBentoGrid'),
    'profil musí kreslit ProfileSection i OverviewBentoGrid'
  );
});
