/**
 * VZOROVÁ DATA Z NÁVRHU NESMÍ SKONČIT V KÓDU.
 *
 * Návrhy z AI Studia chodí s napevno zadrátovanými hodnotami — Jan Novák,
 * 104,6 kg, 2146 kcal, „420 kcal spáleno“, streaky 18 dní, týdenní rozvrh
 * se stavy Dokončeno/Naplánováno. Vypadají realisticky a přesně proto je
 * snadné je při přebírání vzhledu přehlédnout a nechat v produkci.
 *
 * Některá z těch čísel navíc NEMÁME čím naplnit: spálené kalorie neměříme
 * a stav dokončení po dnech nesledujeme. Zobrazit je by byla stejná chyba
 * jako zdravotní verdikty Apple Watch bez dat, které jsme opravovali —
 * tvrzení bez podkladu.
 *
 * Test čte skutečné soubory a hlídá, že se tam ta čísla nevrátila.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOUBORY = [
  'components/profile/design/BodyMetricsDesign.jsx',
  'components/profile/ProfileDayMealsPanel.js',
  'components/profile/ProfileTodayPanels.js',
  'components/profile/WithingsBodyDevelopmentSection.js',
  'lib/profile/telesneMetriky.js',
  'lib/profile/designTokens.js',
  'lib/profile/jmenoUzivatele.js',
  'pages/profil.js',
  'components/habit/HabitUiPrimitives.jsx',
  'components/profile/design/ProfileShellDesign.jsx',
  'lib/profile/profilZalozky.js',
  'components/PlanViewer.js',
  'lib/profile/surovinaRadek.js',
  'lib/profile/cvikSkupiny.js',
  'lib/health/zkratky.js',
];

const obsah = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** Konkrétní hodnoty z maket v1–v3. Komentáře se nepočítají — ty popisují historii. */
function kodBezKomentaru(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((r) => !r.trim().startsWith('//'))
    .join('\n');
}

test('žádné jméno z makety', () => {
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const jmeno of ['Jan Novák', 'Ondřej Dvořák', 'Petr Svoboda']) {
      assert.ok(!kod.includes(jmeno), `${f}: zůstalo jméno z makety „${jmeno}“`);
    }
  }
});

test('žádné vzorové metriky těla', () => {
  // 104.6 kg / 11.6 % / 88.9 kg / BMI 31.6 — hodnoty z návrhu v1 i v3.
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const cislo of ['104.6', '104,6', '88.9', '88,9', '11.6', '31.6']) {
      assert.ok(!kod.includes(cislo), `${f}: zůstala vzorová hodnota ${cislo}`);
    }
  }
});

test('žádné vzorové kalorie ani makra', () => {
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const cislo of ['2146', '2164', '3048']) {
      assert.ok(!kod.includes(cislo), `${f}: zůstala vzorová kaloricka hodnota ${cislo}`);
    }
  }
});

test('nezobrazujeme data, která neměříme', () => {
  // Spálené kalorie a stav dokončení po dnech v produktu neexistují.
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    assert.ok(!/kcal spáleno/i.test(kod), `${f}: spálené kalorie neměříme`);
    assert.ok(!/\bDokončeno\b/.test(kod), `${f}: stav dokončení po dnech nesledujeme`);
    assert.ok(!/\bNaplánováno\b/.test(kod), `${f}: týdenní rozvrh se stavy nemáme`);
  }
});

test('AI trenér TED se nevykresluje — v produktu neexistuje', () => {
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    assert.ok(!/AI\s*(trenér|kouč)\s*TED|AICoachModal/i.test(kod),
      `${f}: TED je v ceníku „BRZY“, nesmí se tvářit jako hotová funkce`);
  }
});

test('vzorové streaky z makety nikde nejsou', () => {
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    assert.ok(!/streak:\s*(18|12)\b/.test(kod), `${f}: zůstal vzorový streak`);
  }
});

test('ambientní pozadí je dekorace, ne obsah', () => {
  // Kruhy na pozadí nesmí brát kliknutí ani nést informaci — kdyby se do nich
  // někdy dostal text nebo handler, přestala by to být dekorace.
  const kod = kodBezKomentaru(obsah('lib/profile/designTokens.js'));
  assert.ok(kod.includes('pointer-events-none'), 'pozadí nesmí krást kliknutí');
  assert.ok(!/onClick|onKeyDown/.test(kod), 'tokeny jsou řetězce tříd, ne chování');
});

test('neonové tokeny nepřepsaly tlumené', () => {
  const kod = obsah('lib/profile/designTokens.js');
  assert.ok(kod.includes('export const KARTA ='), 'základní karta musí zůstat');
  assert.ok(kod.includes('export const KARTA_NEON ='), 'neon je přidaný vedle ní');
});

test('v profilu nezůstal text z maket v3', () => {
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const fraze of ['Ramena & Triceps', 'Hypertrofie', 'Aktivní regenerace', 'Kardio zóna']) {
      assert.ok(!kod.includes(fraze), `${f}: zůstal text z makety „${fraze}“`);
    }
  }
});

test('vzorová jídla z v3 nikde nejsou', () => {
  // „Hovězí zadní steak, jasmínová rýže, brokolice“ a spol. z NutritionCard.tsx.
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const jidlo of ['jasmínová rýže', 'batátové pyré', 'vlašské ořechy, med']) {
      assert.ok(!kod.includes(jidlo), `${f}: zůstalo vzorové jídlo „${jidlo}“`);
    }
  }
});

/* ── NÁVRH v4 (srpen 2026) ───────────────────────────────────────────────────
 *
 * Čtvrtá maketa přišla s celou biometrií vyplněnou konkrétními čísly: HRV
 * 20,6 ms, klidový tep 68, spánek 7h 48m, 9 546 kroků, 1 678 kcal, SpO2 94 %.
 * K tomu suplementační a hydratační doporučení a názvy modelů zařízení.
 *
 * Čísla jako 68 nebo 94 se sem záměrně nepřidávají — jsou příliš obecná a
 * hlídat je by znamenalo falešné poplachy. Hlídají se ta, která se v běžném
 * kódu nevyskytnou náhodou, a hlavně texty.
 */

test('žádné vzorové hodnoty biometrie z v4', () => {
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const cislo of ['20.6', '20,6', '9546', '9 546', '1678', '7h 48m']) {
      assert.ok(!kod.includes(cislo), `${f}: zůstala vzorová hodnota z v4 „${cislo}“`);
    }
  }
});

test('nevydáváme suplementační ani hydratační rady z makety', () => {
  // „500mg Hořčík Bisglycinát“, „3,5L vody + sodík“, „RIR 1-2“ — konkrétní
  // doporučení bez zdroje. CLAUDE.md zakazuje zdravotní verdikty a pseudovědu.
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const fraze of ['Bisglycinát', 'RIR 1-2', 'přetížení CNS']) {
      assert.ok(!kod.includes(fraze), `${f}: zůstala rada z makety „${fraze}“`);
    }
  }
});

test('netvrdíme nic o stavu zařízení, co nečteme', () => {
  // Stav baterie, síla Wi-Fi a model hodinek z API nechodí.
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const fraze of ['Baterie 92', 'Apple Watch Ultra 2', '5 GHz', 'Platform v3.4']) {
      assert.ok(!kod.includes(fraze), `${f}: zůstal vymyšlený stav zařízení „${fraze}“`);
    }
  }
});

test('odznak regenerace nemá napsané číslo natvrdo', () => {
  // Návrh v4 měl v poli `tabs` položku `badge: '70'`. U člověka bez hodinek
  // by to vypadalo jako naměřené skóre.
  const kod = kodBezKomentaru(obsah('lib/profile/profilZalozky.js'))
    + kodBezKomentaru(obsah('components/profile/design/ProfileShellDesign.jsx'));
  assert.ok(!/badge:\s*'?\d/.test(kod), 'odznak nesmí být konstanta');
  assert.ok(!kod.includes("'70'"), 'sedmdesátka z makety');
});

/* ── FÁZE 2 — JÍDLO (jen vzhled) ─────────────────────────────────────────────
 *
 * NutritionCard z návrhu měl vzorová čísla přímo v signatuře
 * (`currentCalories = 2146`), NutritionSection štítek „Fáze: Čistá hypertrofie“
 * a RecipeModal blok „Nutriční tip AI Trenéra“. Nic z toho se nepřeneslo.
 */

test('žádné výchozí hodnoty props se vzorovými čísly', () => {
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    assert.ok(!/=\s*2146/.test(kod), `${f}: default props se vzorovými kaloriemi`);
    assert.ok(!/=\s*2164/.test(kod), `${f}: default props se vzorovým cílem`);
  }
});

test('nevymýšlíme tréninkovou fázi ani nutriční tipy od TEDa', () => {
  for (const f of SOUBORY) {
    const kod = kodBezKomentaru(obsah(f));
    for (const fraze of ['Čistá hypertrofie', 'Nutriční tip', 'certifikovan']) {
      assert.ok(!kod.includes(fraze), `${f}: zůstal text z makety „${fraze}“`);
    }
  }
});

test('PDF export jde přes lib/planPdf.js, ne přes druhý mechanismus', () => {
  // Návrh měl v ExportMealPlanModal vlastní skládání HTML a `window.print()`.
  const kod = obsah('components/PlanViewer.js');
  assert.ok(kod.includes('buildPlanPdfHtml'), 'PlanViewer musí používat lib/planPdf.js');
  assert.ok(!/window\.print\(\)/.test(kodBezKomentaru(kod)), 'druhý mechanismus tisku');
});

test('ikony cviků jsou dekorace, ne jediný nositel informace', () => {
  // Emoji nesmí nést význam samo — kdo ho nevidí, musí mít text.
  const kod = obsah('lib/profile/cvikSkupiny.js');
  assert.ok(/popisek:/.test(kod), 'skupina musí mít textový popisek vedle ikony');
});

test('rozepsání zkratek netvrdí nic o zdraví', () => {
  const kod = kodBezKomentaru(obsah('lib/health/zkratky.js'));
  assert.ok(!/diagnóz|léčb|nemoc/i.test(kod), 'zdravotní tvrzení v popiscích zkratek');
});
