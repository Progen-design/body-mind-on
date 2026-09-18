/**
 * CO SMÍ A NESMÍ BÝT V PROFILU / NA DNES.
 *
 * Po sloučení záložek Přehled a Můj profil se do jedné stránky sešlo všechno,
 * takže duplicity a nepravdivá tvrzení jsou najednou vidět vedle sebe.
 * Tenhle test hlídá, co se 23. 8. 2026 opravovalo, ať se to nevrátí — a od
 * 18. 9. 2026 (PROMPT_UX_DNES.md) i přeskládané pořadí sekcí na Dnes.
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

// PROMPT_UX_DNES.md (18. 9. 2026): ProfileSection a OverviewBentoGrid zmizely
// úplně — sloučily a přestěhovaly se, viz App.tsx komentář u
// `activeTab === 'profil'`. KARTA je jejich nástupce: dnešní souhrn a
// jídelníček dneška v jedné kartě.
const KARTA = kod(cti('../components/DnesniPrehled.tsx'));
// Sekce zařízení se 9. 9. 2026 odstěhovala z ProfileSection do vlastní
// komponenty, aby ji App mohl vykreslit až pod bento mřížkou. Pravidla
// o Withings a Apple Health platí dál, jen se čtou odjinud.
const ZARIZENI = kod(cti('../components/PropojenaZarizeniSection.tsx'));
const APP = kod(cti('../App.tsx'));
const WORKOUT_LOGGER = kod(cti('../components/WorkoutLoggerModal.tsx'));
const NUTRITION = kod(cti('../components/NutritionSection.tsx'));
const WITHINGS_CARD = kod(cti('../components/WithingsCard.tsx'));
const BODY_STATS = kod(cti('../components/BodyStatsGrid.tsx'));
const CALORIE_BANNER = kod(cti('../components/CalorieMismatchBanner.tsx'));
const WEEKLY_WORKOUT_MODAL = kod(cti('../components/WeeklyWorkoutModal.tsx'));
const NAVIGACE = kod(cti('../components/NavigationTabs.tsx'));

test('AI trenér TED není v Dnešku vůbec — vstup do chatu je v hlavičce', () => {
  // Nejdřív byl TED jako dlaždice mezi zařízeními A jako vlastní karta níž.
  // Dlaždice zmizela 23. 8. (není zařízení, nic nesynchronizuje), karta
  // 8. 9.: tlačítko „Zeptat se TEDa" je v hlavičce na každé záložce, takže
  // karta byla druhý vstup do téhož chatu — a zprávy od trenéra vznikají
  // jen při registraci a po týdnu se skrývají, takže většinu času stála
  // v profilu karta se jménem TEDa, ve které TED nebyl.
  assert.ok(!KARTA.includes('AI Trenér TED'), 'karta TEDa je zpátky v Dnešku');
  assert.ok(!KARTA.includes('onAskTed'), 'Dnešek zase otevírá chat s TEDem');
});

test('netvrdíme, že data chodí v reálném čase', () => {
  // Withings se stahuje jednou za hodinu, Apple Health posílá iPhone.
  for (const [jmeno, zdroj] of [['App', APP], ['Dnešek', KARTA], ['zařízení', ZARIZENI]] as const) {
    assert.ok(!/v re[áa]ln[ée]m [čc]ase/i.test(zdroj), `${jmeno}: „v reálném čase" je zpátky`);
    assert.ok(!/Tep [žz]iv[ěe]|HRV.*[žz]iv[ěe]/i.test(zdroj), `${jmeno}: „živě" je zpátky`);
  }
});

test('u Apple Health je vidět stáří dat, ne jen „Připojeno"', () => {
  // Export v telefonu se muze zastavit a aplikace to sama nepozna.
  // Zmereno 23. 8. 2026: posledni data 22. 8., mezitim probehl trenink.
  assert.ok(ZARIZENI.includes('zdraviZastarale'), 'chybí kontrola stáří dat z hodinek');
  assert.ok(ZARIZENI.includes('posledniSynchronizace'), 'sekce nedostává čas poslední synchronizace');
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
  const shoda = /HODIN_DO_ZASTARANI = (\d+)/.exec(ZARIZENI);
  assert.ok(shoda, 'práh zastarání se nedá přečíst');
  const hodin = Number(shoda[1]);
  assert.ok(hodin <= 12, `práh ${hodin} h by schoval celodenní výpadek`);
  assert.ok(hodin >= 6, `práh ${hodin} h by hlásil poplach přes noc`);
});

test('rozdíl mezi zdroji je v UI vidět', () => {
  // Withings server stahuje sam, Apple Health posila iPhone. Kdyz to UI
  // nerekne, uzivatel ceka automatiku i tam, kde zadna neni.
  assert.ok(
    /Server naposled stahoval|Stahuje server sám/.test(ZARIZENI),
    'u Withings chybí, že stahuje server'
  );
  assert.ok(
    /iPhone/.test(ZARIZENI),
    'u Apple Health chybí, že data posílá telefon'
  );
});

test('karty netvrdí frekvenci, kterou nikdo neměří', () => {
  // Zmereno 24. 8. 2026 08:20: z 45 payloadu prislo poslednich 8 mezi
  // 23:07:00 a 23:08:08 — jedna davka za 68 sekund, ne hodinova uloha.
  // Pak devet hodin ticho. "Kazdou hodinu" je nastaveni, ne pozorovani,
  // a u Withings je to rozvrh cronu, ne zaznam o tom, ze probehl.
  assert.ok(
    !/každou hodinu/.test(ZARIZENI),
    'karta zase tvrdí hodinový interval místo naměřeného odstupu'
  );
  assert.ok(
    /odstupText/.test(ZARIZENI),
    'karta nepočítá odstup od poslední dávky'
  );
});

test('odznak u Apple Health ukazuje odstup, ne verdikt', () => {
  // "Aktualni" u dat starych hodinu a pul bylo tvrzeni navic — opiralo se
  // o predpoklad hodinoveho odesilani, ktery mereni nepotvrdilo.
  assert.ok(
    !/>\s*Aktuální\s*</.test(ZARIZENI),
    'odznak zase tvrdí „Aktuální" místo naměřeného odstupu'
  );
});

test('záložka Přehled je pryč a Dnes je jedna sloučená karta, ne ProfileSection/OverviewBentoGrid (PROMPT_UX_DNES.md)', () => {
  assert.ok(!NAVIGACE.includes("'dnes'"), 'záložka Přehled je zpátky');
  assert.ok(!APP.includes("activeTab === 'dnes'"), 'App zase vetví na Přehled');
  assert.ok(APP.includes('<DnesniPrehled'), 'Dnes nekreslí sloučenou kartu');
  assert.ok(
    !APP.includes('<ProfileSection') && !APP.includes('<OverviewBentoGrid'),
    'ProfileSection/OverviewBentoGrid se vrátily — obě se 18. 9. 2026 sloučily do DnesniPrehled a rozstěhovaly do vlastních záložek'
  );
});

test('nákupní seznam na Dnes je vlastní jednořádkový vstup, ne schovaný pod jídelníčkem (PROMPT_UX_DNES.md bod A.5)', () => {
  assert.ok(APP.includes('<NakupniSeznamVstup'), 'App na Dnes nekreslí NakupniSeznamVstup');
  assert.ok(!KARTA.includes('Nákupní seznam'), 'nákupní seznam se vrátil dovnitř karty Dnešek');
});

test('trénink se v Dnešku ukazuje jen jako stavový řádek, ne jako druhá plná karta (rozhodnutí 9. 9. 2026)', () => {
  // Trénink má vlastní záložku v horní navigaci — Dnešek smí ukázat jen
  // stav (odcvičeno/čeká/volno), ne vypsat celý trénink podruhé.
  assert.ok(!KARTA.includes('Dnešní trénink'), 'karta tréninku je zpátky v Dnešku');
  assert.ok(!KARTA.includes('Regenerace &'), 'karta regenerace je zpátky v Dnešku');

  // Zápis tréninku mimo plán se odebráním karty nesmí ztratit — je na
  // záložce Tréninkový plán, kam vede tlačítko v navigaci.
  const WORKOUT_SECTION = kod(cti('../components/WorkoutSection.tsx'));
  assert.ok(WORKOUT_SECTION.includes('onOpenWorkoutLogger'), 'záznamník tréninku není dosažitelný nikde');
  assert.ok(NAVIGACE.includes("'trenink'"), 'záložka Tréninkový plán zmizela');
  assert.ok(NAVIGACE.includes("'regenerace'"), 'záložka Regenerace & Spánek zmizela');
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

test('Dnešek ukazuje VŠECHNA dnešní jídla, ne jen výřez tří z pěti (PROMPT_UX_DNES.md bod A.3)', () => {
  // Do 18. 9. 2026 tu byl `meals.slice(0, 3)` s poznámkou „Zobrazeny 3 z 5
  // jídel" — karta tvrdila 1338 kcal proti cíli 2634, jako by třetina dne
  // chyběla (docs/DALSI_KROK.md 7.2c). Celá výseč se od 18. 9. 2026 zrušila.
  assert.ok(!KARTA.includes('Všechna jídla'), 'nadpis "Všechna jídla" nad výřezem se vrátil');
  assert.ok(!/meals\.slice\(0,\s*3\)/.test(KARTA), 'meals se zase ořezávají na tři');
  assert.ok(!KARTA.includes('Zobrazeny 3 z'), 'přiznání výřezu je zpátky — celý seznam se přece nemá ořezávat');
  assert.ok(/meals\.map\(/.test(KARTA), 'Dnešek nemapuje celé pole meals');
});

test('zarovnání jídel: štítek, název (1fr) a kcal v gridu, ne ve flexu za sebou (PROMPT_UX_DNES.md bod B)', () => {
  const GRID = kod(cti('../components/RadekJidlaGrid.tsx'));
  assert.ok(GRID.includes('grid-cols-[1fr_auto]'), 'chybí mobilní 2sloupcový grid (obsah/kcal)');
  assert.ok(GRID.includes('sm:grid-cols-[6rem_1fr_auto]'), 'chybí desktopový 3sloupcový grid štítek/název/kcal');
  assert.ok(KARTA.includes('RadekJidlaGrid'), 'Dnešek nepoužívá sdílený grid pro řádek jídla');
  const PAYWALL = kod(cti('../components/TrialPaywallCard.tsx'));
  assert.ok(PAYWALL.includes('RadekJidlaGrid'), '„Tvůj další týden" nepoužívá sdílený grid pro řádek jídla');
});

test('jídla v „Tvůj další týden" jdou rozkliknout do detailu receptu (PROMPT_UX_DNES.md bod B)', () => {
  const PAYWALL = kod(cti('../components/TrialPaywallCard.tsx'));
  assert.ok(PAYWALL.includes('onSelectRecipe'), 'karta nedostává onSelectRecipe');
  assert.ok(/onClick=\{.*onSelectRecipe\(jidlo\)/.test(PAYWALL), 'klik na jídlo neotevírá recept');
  const ADAPTERY = cti('../data/adaptery.ts');
  assert.ok(ADAPTERY.includes('jidlaPrvnihoDne'), 'ZamcenyPlan nenese plnohodnotná MealItem pro paywall');
});

test('nesoulad cíle vs. plánu je vidět v Dnešku i v jídelníčku (docs/DALSI_KROK.md 7.2a)', () => {
  // Watchdog `calorie_target_mismatch` detekci má, ale nikdo interní alert
  // nečte. Uživatel musí nesoulad vidět na obou místech, odkud se s cílem
  // pracuje — v Dnešku (kde cíl nastavuje) i v jídelníčku (kde se podle
  // něj skládá jídlo) — ne jen na jednom z nich.
  assert.ok(KARTA.includes('CalorieMismatchBanner'), 'Dnešek nezobrazuje banner nesouladu cíle');
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

test('cílová hmotnost je na Tělo & Váha, ne na Dnes (PROMPT_UX_DNES.md bod D)', () => {
  assert.ok(BODY_STATS.includes('targetWeightKg'), 'BodyStatsGrid nedostává cílovou hmotnost');
  assert.ok(BODY_STATS.includes('rozdilKg'), 'chybí dopočet rozdílu aktuální vs. cílová váha');
  assert.ok(!KARTA.includes('Cílová hmotnost'), 'cílová hmotnost je pořád i na Dnes — duplicita se měla odstranit');
});

test('nastavené denní cíle & makroživiny jsou v jídelníčku, ne na Dnes (PROMPT_UX_DNES.md bod A)', () => {
  assert.ok(NUTRITION.includes('Nastavené denní cíle'), 'jídelníček neukazuje nastavený cíl kalorií a maker');
  assert.ok(!KARTA.includes('Nastavené denní cíle'), 'cíle a makra jsou pořád i na Dnes — duplicita se měla odstranit');
});
