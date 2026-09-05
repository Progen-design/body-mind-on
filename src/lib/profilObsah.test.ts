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
const WORKOUT_LOGGER = kod(cti('../components/WorkoutLoggerModal.tsx'));
const NUTRITION = kod(cti('../components/NutritionSection.tsx'));
const WITHINGS_CARD = kod(cti('../components/WithingsCard.tsx'));
const BODY_STATS = kod(cti('../components/BodyStatsGrid.tsx'));
const CALORIE_BANNER = kod(cti('../components/CalorieMismatchBanner.tsx'));
const WEEKLY_WORKOUT_MODAL = kod(cti('../components/WeeklyWorkoutModal.tsx'));

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

test('nákupní seznam sedí u jídelníčku (Karta 3), ne u TEDa (Karta 6) — docs/DALSI_KROK.md 6.8', () => {
  // Karta 6 se hlavičkou hlásila jako "AI Trenér TED", ale zobrazovala pod
  // ní i nesouvisející nákupní seznam — rozpor mezi nadpisem a obsahem.
  // Značky karet jsou v JSX komentářích, které kod() odstraňuje, proto se
  // tu čte surový soubor, ne sdílená stripnutá konstanta BENTO.
  const surovy = cti('../components/OverviewBentoGrid.tsx');
  const zacatekKarty3 = surovy.indexOf('KARTA 3');
  const zacatekKarty4 = surovy.indexOf('KARTA 4');
  const zacatekKarty6 = surovy.indexOf('KARTA 6');
  assert.ok(zacatekKarty3 > -1 && zacatekKarty4 > -1 && zacatekKarty6 > -1, 'značky karet zmizely ze souboru');

  // kod() na výřezu, ne na celém souboru — markery karet jsou v komentářích
  // a bez stripu by je nešlo najít; komentáře uvnitř výřezu ale nesmí
  // ovlivnit test (např. tenhle komentář u Karty 6 sám "Nákupní seznam"
  // zmiňuje jako historii, ne jako obsah).
  const obsahKarty3 = kod(surovy.slice(zacatekKarty3, zacatekKarty4));
  const obsahKarty6 = kod(surovy.slice(zacatekKarty6));

  assert.ok(obsahKarty3.includes('Nákupní seznam'), 'Karta 3 nemá nákupní seznam');
  assert.ok(!obsahKarty6.includes('Nákupní seznam'), 'Karta 6 (TED) zase zobrazuje nákupní seznam');
});

test('v den volna karta 4 nabízí zápis mimo plán, ne stopky pro neexistující trénink (docs/DALSI_KROK.md 6.11)', () => {
  // "Spustit záznamník (Stopky)" dávalo smysl jen u naplánovaného tréninku.
  // V den volna (DEN_BEZ_TRENINKU) muselo tlačítko dostat jiný text — jinak
  // nabízelo nahrát trénink, který v plánu není.
  assert.ok(BENTO.includes("from '../lib/trenink'"), 'Karta 4 nesahá na jeNaplanovany() z lib/trenink');
  assert.ok(BENTO.includes('maDnesTrenink'), 'chybí rozlišení dne volna od naplánovaného tréninku');
  assert.ok(BENTO.includes('Zapsat trénink mimo plán'), 'tlačítko v den volna nenabízí zápis mimo plán');
  assert.ok(BENTO.includes('Spustit záznamník (Stopky)'), 'naplánovaný den ztratil původní text tlačítka');
});

test('maPlan v App.tsx nepočítá dny volna jako důkaz existujícího plánu (docs/DALSI_KROK.md 8.14)', () => {
  // naTreninky() od 8.14 vrací všech sedm dnů i pro plán bez jediného
  // tréninku — samotné "workouts.length > 0" by pak tvrdilo, že plán
  // existuje, i když je celý týden volno.
  assert.ok(APP.includes('treninkoveDny(workouts).length > 0'), 'maPlan zase počítá syrové workouts.length');
  assert.ok(!/\bworkouts\.length > 0/.test(APP), 'nefiltrovaný workouts.length > 0 je zpátky');
});

test('WeeklyWorkoutModal nedovolí vybrat ani zobrazit den volna jako aktuální (docs/DALSI_KROK.md 8.14)', () => {
  // "Celý rozpis" mapuje `workouts`, který teď nese i dny volna — bez téhle
  // úpravy byly klikací a po kliknutí ukázaly "Volno" a "Seznam cviků (0)".
  assert.ok(WEEKLY_WORKOUT_MODAL.includes('treninkoveDny'), 'currentDay se vybírá ze všech dnů včetně volna');
  assert.ok(WEEKLY_WORKOUT_MODAL.includes('jeVolno'), 'den volna už nemá žádné rozlišení v záložkách');
  assert.ok(WEEKLY_WORKOUT_MODAL.includes('disabled={jeVolno}'), 'záložka dne volna je zase klikací');
});

test('WorkoutLoggerModal s prázdným todayWorkout vypadá jako záměr, ne jako prázdná obrazovka (docs/DALSI_KROK.md 6.11)', () => {
  // Prázdný todayWorkout (den volna) dřív protekl do modalu beze změny:
  // "Aktivní trénink •" bez dne a "Cviky a série (0 z 0 hotovo)". Modal
  // teď musí rozlišit maPlan a nabídnout zápis tréninku mimo plán místo
  // předstírání prázdného naplánovaného tréninku.
  assert.ok(WORKOUT_LOGGER.includes("from '../lib/trenink'"), 'modal nesahá na jeNaplanovany() z lib/trenink');
  assert.ok(WORKOUT_LOGGER.includes('maPlan'), 'chybí rozlišení prázdného tréninku v modalu');
  assert.ok(WORKOUT_LOGGER.includes('Trénink mimo plán'), 'hlavička modalu bez plánu nezmizela');
  assert.ok(WORKOUT_LOGGER.includes('Vlastní trénink'), 'nadpis modalu bez plánu zůstal "Dnes bez tréninku"');
  assert.ok(
    WORKOUT_LOGGER.includes('Dnes nemáš v plánu žádný trénink'),
    'seznam cviků bez plánu pořád tvrdí "0 z 0 hotovo"'
  );
});

test('Karta 3 neříká "Všechna jídla" nad výřezem tří z pěti (docs/DALSI_KROK.md 7.2c)', () => {
  // meals.slice(0, 3) pod nadpisem "Všechna jídla" ukazovalo 1338 kcal proti
  // cíli 2634 — vypadalo to, že třetina dne chybí. Nadpis lhal o tom, co je
  // pod ním; teď je pravdivý nadpis navigace + počet zobrazených jídel.
  assert.ok(!BENTO.includes('Všechna jídla'), 'nadpis "Všechna jídla" nad výřezem se vrátil');
  assert.ok(BENTO.includes('Otevřít jídelníček'), 'chybí pravdivý navigační odkaz na Kartě 3');
  assert.ok(BENTO.includes('meals.length > 3'), 'chybí podmínka pro zobrazení počtu jídel jen když se opravdu ořezávají');
  assert.ok(BENTO.includes('Zobrazeny 3 z'), 'chybí přiznání, že karta ukazuje jen výřez');
});

test('nesoulad cíle vs. plánu je vidět na profilu i v jídelníčku (docs/DALSI_KROK.md 7.2a)', () => {
  // Watchdog `calorie_target_mismatch` detekci má, ale nikdo interní alert
  // nečte. Uživatel musí nesoulad vidět na obou místech, odkud se s cílem
  // pracuje — na profilu (kde cíl nastavuje) i v jídelníčku (kde se podle
  // něj skládá jídlo) — ne jen na jednom z nich.
  assert.ok(PROFIL.includes('CalorieMismatchBanner'), 'profil nezobrazuje banner nesouladu cíle');
  assert.ok(NUTRITION.includes('CalorieMismatchBanner'), 'jídelníček nezobrazuje banner nesouladu cíle');
  assert.ok(APP.includes('nesouladCile('), 'App.tsx nepočítá nesoulad cíle přes sdílenou funkci');
  assert.ok(
    APP.includes("'/api/profile-preferences'") && APP.includes('handleRegeneratePlanForCurrentTarget'),
    'chybí handler pro přegenerování plánu na aktuální cíl'
  );
});

test('přegenerování jídelníčku nesmí tiše zahodit rozpracovaný týden — regenerateMealsOnly (docs/DALSI_KROK.md 7.2a)', () => {
  // Ověřeno na datech 31. 8. 2026: generatePlanForEmail bez shodného
  // valid_from založí NOVÝ řádek ai_generated_plans s NOVÝM id, na které se
  // stará daily_activity_completions.plan_id už nenaváže — odškrtnutí za
  // celý týden (jídla i tréninky) zmizí. Tlačítko proto musí posílat
  // regenerateMealsOnly, ne prázdné tělo (to spustí i regeneraci tréninku).
  assert.ok(
    APP.includes('regenerateMealsOnly: true'),
    'handler neposílá regenerateMealsOnly — server přegeneruje i trénink a založí nový plan_id'
  );
});

test('banner řekne důsledek PŘED kliknutím, ne až v toastu po akci (docs/DALSI_KROK.md 7.2a)', () => {
  // Věta o tom, že se ztratí odškrtnutá jídla (trénink ne), musí být přímo
  // v textu bannera — ne v title/aria-label (tooltip), ne jen v showToast().
  assert.ok(
    /trénink [^.]*beze změny/.test(CALORIE_BANNER) || /trénink [^.]*nezmění/.test(CALORIE_BANNER),
    'banner neříká, že trénink zůstane beze změny'
  );
  assert.ok(
    /jídla[^.]*ztrat/.test(CALORIE_BANNER) || /odškrtnut[^.]*ztrat/.test(CALORIE_BANNER),
    'banner neříká, že se odškrtnutá jídla ztratí'
  );
  assert.ok(!CALORIE_BANNER.includes('title='), 'důsledek nesmí být schovaný v tooltipu (title=)');
});

test('tlačítko slibuje jídelníček — a s regenerateMealsOnly je to i pravda (docs/DALSI_KROK.md 7.2a)', () => {
  assert.ok(CALORIE_BANNER.includes('Přegenerovat jídelníček'), 'tlačítko ztratilo svůj text');
  // "jen jídelníček, ne trénink" musí platit i na serveru, ne jen v textu.
  const HANDLER = cti('../../api/profile-preferences.js');
  assert.match(HANDLER, /mealsOnly:\s*onlyDietChanged\s*\|\|\s*regenerateMealsOnly/, 'server u regenerateMealsOnly pořád přegeneruje i trénink');
});

test('připojenému uživateli Withings karta neříká, ať se připojí (docs/DALSI_KROK.md 7.2e)', () => {
  // Odstavec "Propojte svou chytrou váhu…" byl v JSX natvrdo, bez podmínky.
  assert.ok(!WITHINGS_CARD.includes('Propojte svou chytrou váhu'), 'text pro nepřipojené je pořád natvrdo v JSX');
  assert.ok(WITHINGS_CARD.includes('stav.description'), 'karta nebere popisek z withingsCardStav()');
});

test('appka vedle Withings BMR ukazuje i vlastní výpočet, ne ho schovává (docs/DALSI_KROK.md 7.2g)', () => {
  // "neschovávej bazální metabolismus" — dlaždice se štítkem "Bazální
  // metabolismus:" a hodnotou z Withings (slozeni.basal_metabolic_rate)
  // musí zůstat; přibývá jen druhá, jasně označená hodnota vedle ní.
  assert.ok(BODY_STATS.includes('slozeni.basal_metabolic_rate'), 'Withings BMR zmizel z dlaždice');
  assert.ok(BODY_STATS.includes('vlastniBmrKcal'), 'appka nemá vlastní BMR pro porovnání vedle Withings čísla');
  assert.ok(APP.includes('bmrMifflinStJeor'), 'App.tsx nepočítá vlastní BMR přes sdílený vzorec');
});
