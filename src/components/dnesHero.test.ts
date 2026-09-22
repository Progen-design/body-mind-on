// Hero „Tvůj den" — PROMPT_DNES_HERO.md (21. 9. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const KOREN = path.join(import.meta.dirname, '..', '..');
const cti = (p: string) => fs.readFileSync(path.join(KOREN, p), 'utf8');

const HERO = cti('src/components/DnesHero.tsx');
const APP = cti('src/App.tsx');
const DNES = cti('src/components/DnesObrazovka.tsx');

test('hero je nahoře na Dnes a adherenci ze serveru bere DnesObrazovka', () => {
  assert.match(APP, /<DnesObrazovka/, 'App obrazovku Dnes nekreslí');
  assert.match(DNES, /<DnesHero/, 'DnesObrazovka hero nekreslí');
  assert.match(DNES, /'\/api\/stats\/adherence'/, 'DnesObrazovka nevolá adherenci');
  assert.ok(
    APP.indexOf("activeTab === 'profil'") < APP.indexOf('<DnesObrazovka'),
    'Dnes není uvnitř větve pro záložku Dnes'
  );
  assert.ok(DNES.indexOf('<DnesHero') < DNES.indexOf('<RadekTeda'), 'hero musí být nad TEDem');
});

test('trénink v ukazateli platí za odcvičený i bez odškrtnutí, když ho naměřily hodinky', () => {
  const TRENINK_ = cti('src/lib/trenink.ts');
  assert.match(TRENINK_, /watch_workout_count/, 'hodinkový trénink se nepočítá');
  assert.match(TRENINK_, /manual_workout_count/, 'ručně zapsaný trénink se nepočítá');
});

test('ukazatel Trénink ve dni volna nabídne nejbližší další trénink', () => {
  assert.match(HERO, /najdiNejblizsiTrenink/, 'chybí dohledání nejbližšího tréninku pro den volna');
});

test('tři kroužky jsou tlačítka s aria-label se skutečnými čísly', () => {
  assert.match(HERO, /ProgresniKruh/, 'hero nekreslí kroužky');
  assert.match(HERO, /ariaLabel=\{`Jídlo: snědeno/, 'kroužek jídla nemá aria-label se snědenými kaloriemi');
  assert.match(HERO, /Trénink: hotovo/, 'kroužek tréninku nemá aria-label se stavem');
  assert.match(HERO, /Váha: /, 'kroužek váhy nemá aria-label');
  assert.match(HERO, /<button[\s\S]{0,120}aria-label=\{ariaLabel\}/, 'ukazatel není <button> s aria-label');
});

test('kliknutí na kroužek otevře příslušnou záložku', () => {
  assert.match(HERO, /onSelectTab\('jidelnicek'\)/);
  assert.match(HERO, /onSelectTab\('trenink'\)/);
  assert.match(HERO, /onSelectTab\('vaha'\)/);
});

test('kroužek se plní animací a respektuje prefers-reduced-motion', () => {
  const KRUH = cti('src/components/ProgresniKruh.tsx');
  assert.match(KRUH, /useReducedMotion/, 'kroužek nerespektuje prefers-reduced-motion');
  assert.match(KRUH, /duration: bezPohybu \? 0 : 0\.4/, 'animace má být do 400 ms a bez pohybu okamžitá');
});

test('primární akce sedí přímo v hero pod větou o stavu dne, ne v samostatném rámečku', () => {
  assert.ok(!/p-4 rounded-2xl border border-cyan-500\/25/.test(HERO), 'akce je zase v samostatném rámečku');
  assert.ok(
    HERO.indexOf('{vetaStavu}') < HERO.indexOf('onClick={spustDalsiKrok}'),
    'tlačítko není pod větou o stavu dne'
  );
});

test('„Další krok" je skutečné tlačítko, ne klikací div', () => {
  const zacatek = HERO.indexOf('DALŠÍ KROK');
  assert.ok(zacatek > -1, 'sekce Další krok chybí');
  const blok = HERO.slice(zacatek, zacatek + 500);
  assert.match(blok, /<button/, 'Další krok není <button>');
  assert.ok(!/role="button"/.test(blok), 'Další krok používá klikací div s role="button" místo <button>');
});

test('„Další krok" volá spustDalsiKrok podle typu z dalsiKrok()', () => {
  assert.match(HERO, /import \{ dalsiKrok(, datumDneCesky)? \}/, 'hero neimportuje pravidla pro Další krok');
  assert.match(HERO, /onClick=\{spustDalsiKrok\}/, 'tlačítko Dalšího kroku nevolá spustDalsiKrok');
});

test('pozdrav používá src/lib/pozdrav.ts, ne vlastní text natvrdo', () => {
  assert.match(HERO, /import \{ pozdrav \}/, 'hero neimportuje sdílenou funkci pozdrav');
  assert.ok(!/Dobrý (večer|den)[,.]?["'`]/.test(HERO), 'pozdrav je napsaný natvrdo místo přes pozdrav()');
});

test('den programu používá src/lib/denProgramu.ts', () => {
  assert.match(HERO, /import \{ denProgramu \}/, 'hero neimportuje sdílenou funkci denProgramu');
  assert.match(HERO, /Den \{denN\} tvého programu/, 'chybí věta „Den N tvého programu"');
});

test('pole „Jak ti máme říkat?" v hero už není (přestěhovalo se do Účtu)', () => {
  assert.ok(!/Jak ti máme říkat\?/.test(HERO), 'výzva je zpátky v hero');
  assert.ok(!/onSavePreferredAddress/.test(HERO), 'hero pořád ukládá oslovení');
  const UCET = cti('src/components/UcetASpravaSection.tsx');
  assert.match(UCET, /Jak ti máme říkat\?/, 'Účet oslovení needituje');
  assert.match(UCET, /onSavePreferredAddress/, 'Účet oslovení neukládá přes handler z App');
});

test('řádek TEDa NENÍ součástí hero — je to samostatná komponenta (bod B zadání)', () => {
  assert.ok(!/<RadekTeda/.test(HERO), 'hero vykresluje RadekTeda sám');
  assert.ok(!/\bcoachTips\b/.test(HERO), 'hero pořád dostává coachTips — ty patří RadekTeda');
  assert.match(DNES, /<RadekTeda/, 'DnesObrazovka RadekTeda nekreslí');
  assert.ok(
    DNES.indexOf('<DnesHero') < DNES.indexOf('<RadekTeda')
    && DNES.indexOf('<RadekTeda') < DNES.indexOf('<CasovaOsaDne'),
    'pořadí musí být hero → TED → osa dne'
  );
});

test('kroužek tréninku se plní podle odškrtnutých cviků, Hotovo až po všech (jeden výpočet v src/lib/trenink.ts)', () => {
  const TRENINK = cti('src/lib/trenink.ts');
  assert.match(TRENINK, /export function podilTreninku/, 'chybí podíl odcvičených cviků');
  assert.match(TRENINK, /filter\(\(c\) => c\.completed\)\.length \/ cviky\.length/, 'podíl se nepočítá z cviků');
  assert.match(TRENINK, /podilTreninku\(den, stav\) >= 1/, 'Hotovo nesmí svítit před posledním cvikem');
  assert.match(HERO, /from '\.\.\/lib\/trenink\.ts'/, 'hero neimportuje sdílený výpočet');
  assert.ok(!/export function podilTreninku/.test(HERO), 'hero má vlastní kopii podilTreninku');
  assert.match(HERO, /podil=\{podilTrenink\}/, 'kroužek nebere podíl cviků');
});

test('celé Dnes počítá trénink stejně: hero, osa i Tvoje cesta berou sdílené funkce', () => {
  const DNES_ = cti('src/components/DnesObrazovka.tsx');
  assert.match(DNES_, /jeTreninkHotovy\(todayWorkout, stav\)/, 'DnesObrazovka nepoužívá sdílené jeTreninkHotovy');
  assert.match(DNES_, /rozpracovaneCviky\(todayWorkout, stav\)/);
  assert.match(DNES_, /tydenSouhrn\(workouts, weekMeals, maTrenink \? treninkHotovy : null\)/, 'týden nezná hotovost dnešního tréninku z hero');
  assert.match(DNES_, /dnesTreninekHotovy=\{maTrenink \? treninkHotovy : null\}/, 'Tvoje cesta nedostává hotovost z hero');
  // Nikde v src/ se trénink nesmí brát za splněný z adherence napřímo mimo trenink.ts.
  for (const soubor of ['DnesHero', 'DnesObrazovka', 'CasovaOsaDne', 'TvojeCesta']) {
    const kod = cti(`src/components/${soubor}.tsx`).split('\n').filter((r) => !r.trim().startsWith('//') && !r.trim().startsWith('*') && !r.trim().startsWith('/*')).join('\n');
    assert.ok(!/trenink_splnen|manual_workout_count/.test(kod), `${soubor} bere trénink z adherence napřímo`);
  }
});

test('u automatického cíle váhy je v hero malé „(auto)", ručně zadaný cíl ho nemá', () => {
  assert.match(HERO, /targetWeightAuto \? ' \(auto\)' : ''/);
  assert.match(cti('src/components/DnesObrazovka.tsx'), /targetWeightAuto=\{preferences\.targetWeightAuto === true\}/);
});

test('údaje v kroužcích jsou krátké řádky, ne jedna dlouhá věta, která se láme (390 px)', () => {
  assert.ok(!/cíl \$\{kg\(vahaPokrok\.cilKg\)\} kg`\s*: ''\}`/.test(HERO), 'váha je zase v jednom dlouhém řádku');
  assert.match(HERO, /radek3\?: string/, 'ukazatel neumí třetí řádek');
  assert.match(HERO, /line-clamp-2/, 'řádky ukazatele se neořezávají');
});
