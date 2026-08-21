/**
 * ŽÁDNÁ PUBLIKAČNÍ CESTA NESMÍ OBEJÍT DIETNÍ BRÁNU.
 *
 * PROČ TENHLE TEST EXISTUJE
 * 10. 8. 2026 dostal bezlepkový uživatel e-mailem plán s chlebem, těstovinami
 * a ovesnými vločkami. Nebyla to chyba brány — ta zafungovala a plán odmítla
 * ('Dietary publish gate failed'). Chyba byla, že brána seděla UVNITŘ
 * runUnifiedPlanPipeline, zatímco nouzová větev v api/body-metrics.js
 * pipeline obešla, sáhla po statické HTML šabloně a odeslala ji.
 *
 * Je to devátý výskyt vzorce „dvě místa dělají totéž, hlídá se jen jedno“
 * (name vs name_en, meal_type CHECK, diet_tags pořadí, Atwater na třech
 * místech, pásma slotů, nabídka diet v pěti JSX, …). Proto se netestuje
 * chování jedné funkce, ale to, že KAŽDÁ cesta k uživateli vede přes bránu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  assertPlanPublishableForDiet,
  planHtmlToTextSegments,
  hasAnyDietaryRestriction,
  buildDietaryPublishRules,
} from '../dietaryPublishGate.js';

const KOREN = join(import.meta.dirname, '..', '..');

/** Zdroják produkčního kódu — testy, skripty a node_modules do skenu nepatří. */
function zdrojoveSoubory() {
  const out = [];
  const koreny = ['lib', 'api'];
  const preskoc = new Set(['node_modules', '__tests__', '.next', 'e2e-output']);

  const projdi = (dir) => {
    for (const jmeno of readdirSync(dir)) {
      if (preskoc.has(jmeno)) continue;
      const cesta = join(dir, jmeno);
      if (statSync(cesta).isDirectory()) projdi(cesta);
      else if (/\.(js|jsx|mjs)$/.test(jmeno)) out.push(cesta);
    }
  };

  for (const k of koreny) projdi(join(KOREN, k));
  return out;
}

/**
 * Vytáhne argumenty volání `nazev(` počítáním závorek — okno pevné délky by
 * u dlouhých volání uřízlo konec a test by lhal.
 */
function volaniFunkce(zdroj, nazev) {
  const volani = [];
  const re = new RegExp(`\\b${nazev}\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(zdroj)) !== null) {
    let hloubka = 1;
    let i = m.index + m[0].length;
    while (i < zdroj.length && hloubka > 0) {
      const ch = zdroj[i];
      if (ch === '(') hloubka += 1;
      else if (ch === ')') hloubka -= 1;
      i += 1;
    }
    volani.push({ index: m.index, args: zdroj.slice(m.index + m[0].length, i - 1) });
  }
  return volani;
}

/**
 * Nese volání body_metrics? Options se občas skládají do proměnné
 * (`const sendOpts = {...}; sendPlanEmail(a, b, sendOpts)`), takže když je
 * poslední argument holý identifikátor, dohledá se jeho definice. Bez toho by
 * test hlásil chybu tam, kde je kód v pořádku.
 */
function maBodyMetrics(args, zdroj) {
  if (/bodyMetrics(ForEmail)?\s*:/.test(args)) return true;

  const posledni = args.split(',').pop()?.trim() ?? '';
  if (!/^[A-Za-z_$][\w$]*$/.test(posledni)) return false;

  const def = zdroj.match(new RegExp(`(?:const|let|var)\\s+${posledni}\\s*=\\s*\\{`));
  if (!def) return false;
  let hloubka = 1;
  let i = def.index + def[0].length;
  while (i < zdroj.length && hloubka > 0) {
    if (zdroj[i] === '{') hloubka += 1;
    else if (zdroj[i] === '}') hloubka -= 1;
    i += 1;
  }
  return /bodyMetrics(ForEmail)?\s*:/.test(zdroj.slice(def.index, i));
}

test('sendPlanEmail je jediné hrdlo a brána v něm je', () => {
  const mail = readFileSync(join(KOREN, 'lib', 'mail.js'), 'utf8');

  assert.match(
    mail,
    /import \{ assertPlanPublishableForDiet \} from '\.\/dietaryPublishGate\.js'/,
    'lib/mail.js musí importovat bránu'
  );

  const iGate = mail.indexOf('assertPlanPublishableForDiet({');
  assert.ok(iGate > 0, 'lib/mail.js musí bránu zavolat');

  // Brána musí padnout PŘED skutečným odesláním, jinak by byla jen zápisem
  // do logu. Hlídá se odeslání, ne příprava transportu — vyrobit transporter
  // nic neodešle.
  const iKonecFunkce = mail.indexOf('\nexport ', iGate);
  const telo = mail.slice(iGate, iKonecFunkce > 0 ? iKonecFunkce : mail.length);
  for (const odeslani of ['transporter.sendMail(', 'resend.emails.send(']) {
    assert.ok(
      telo.includes(odeslani),
      `\`${odeslani}\` se v sendPlanEmail za bránou nenašlo — ověř, že test míří na správnou funkci`
    );
  }

  // A musí opravdu zastavit, ne jen zalogovat.
  const poGate = mail.slice(iGate, iGate + 1600);
  assert.match(poGate, /if \(!dietaryVerdict\.ok\)/, 'výsledek brány se musí vyhodnotit');
  assert.match(poGate, /return \{\s*\n?\s*ok: false/, 'při nesplnění se musí vrátit ok:false');
  assert.match(poGate, /blocked: 'dietary_gate'/, 'důvod musí být v odpovědi, ne jen v logu');
});

test('každé volání sendPlanEmail předává body_metrics', () => {
  // Bez body_metrics brána dietu nezná. `assertPlanPublishableForDiet` v tom
  // případě NEPUBLIKUJE (reason: no_body_metrics) — tenhle test to posouvá
  // z runtime chyby na chybu, která se pozná hned.
  const chybi = [];

  for (const soubor of zdrojoveSoubory()) {
    const rel = relative(KOREN, soubor).replace(/\\/g, '/');
    if (rel === 'lib/mail.js') continue; // definice, ne volání
    const zdroj = readFileSync(soubor, 'utf8');
    if (!zdroj.includes('sendPlanEmail(')) continue;

    for (const volani of volaniFunkce(zdroj, 'sendPlanEmail')) {
      if (maBodyMetrics(volani.args, zdroj)) continue;
      const radek = zdroj.slice(0, volani.index).split('\n').length;
      chybi.push(`${rel}:${radek}`);
    }
  }

  assert.deepEqual(
    chybi,
    [],
    `sendPlanEmail bez bodyMetrics — brána nemá podle čeho soudit:\n  ${chybi.join('\n  ')}`
  );
});

test('nouzová šablona se pro dietu nepoužije', () => {
  const zdroj = readFileSync(join(KOREN, 'lib', 'taskExecutors.js'), 'utf8');

  const iFunkce = zdroj.indexOf('export async function persistPublishableFallbackPlanForUser');
  assert.ok(iFunkce > 0, 'persistPublishableFallbackPlanForUser se nenašla');

  const iSablona = zdroj.indexOf('buildDeterministicFallbackPlanHtml(bm, targetStart)', iFunkce);
  assert.ok(iSablona > 0, 'volání šablony se v té funkci nenašlo');

  const telo = zdroj.slice(iFunkce, iSablona);
  assert.match(telo, /hasAnyDietaryRestriction\(/, 'před šablonou musí stát kontrola omezení');
  assert.match(
    telo,
    /return \{ plan_id: null, error: 'diet_requires_verified_plan' \}/,
    'při dietním omezení se musí vrátit chyba, ne šablona'
  );
  assert.match(telo, /plan_generation_failed/, 'blok musí být vidět v health alerts');
});

test('body-metrics vrací 503 s hasUserId, ne 200 s prázdným slibem', () => {
  const zdroj = readFileSync(join(KOREN, 'api', 'body-metrics.js'), 'utf8');

  assert.match(zdroj, /diet_requires_verified_plan/, 'API musí dietní blok rozpoznat');
  assert.match(zdroj, /res\.status\(503\)/, 'dietní blok musí skončit 503, ne 200');

  // 503 je v souboru víc (selhání auth). Hledá se ten, který patří dietnímu
  // bloku — proto se prochází všechny výskyty, ne jen první.
  const okoli = [];
  for (let i = zdroj.indexOf('res.status(503)'); i >= 0; i = zdroj.indexOf('res.status(503)', i + 1)) {
    okoli.push(zdroj.slice(Math.max(0, i - 700), i + 400));
  }
  const dietni = okoli.find((o) => o.includes('dietBlockActive'));
  assert.ok(dietni, '503 vázané na dietní blok se nenašlo');

  // hasUserId nastavuje buildRegistrationApiResponse, odpověď se rozprostírá.
  assert.match(dietni, /\.\.\.response/, 'odpověď musí nést hasUserId pro retry CTA');
  assert.match(dietni, /planPending: false/, 'blokovaný plán se nesmí tvářit jako „přijde“');
});

test('brána: strukturovaný plán je autoritativní, HTML je náhrada', () => {
  const bmBezLepku = { diet_type: 'gluten_free' };

  // Strukturovaný plán bez porušení projde, i kdyby HTML vypadalo podezřele.
  const cistyPlan = {
    days: [{ meals: [{ type: 'breakfast', name_cs: 'Omeleta se zeleninou' }] }],
  };
  const a = assertPlanPublishableForDiet({
    planJson: cistyPlan,
    planHtml: '<p>Snídaně: celozrnný chléb</p>',
    bm: bmBezLepku,
  });
  assert.equal(a.ok, true, 'rozhodovat má strukturovaný plán');
  assert.equal(a.checked, 'plan_json');

  // Bez strukturovaného plánu se kontroluje HTML — přesně případ šablony.
  const b = assertPlanPublishableForDiet({
    planJson: null,
    planHtml: '<h3>Pondělí</h3><p><b>Snídaně:</b> Ovesná kaše s ovocem</p>'
      + '<p><b>Oběd:</b> Těstoviny s kuřecím masem</p>',
    bm: bmBezLepku,
  });
  assert.equal(b.ok, false, 'šablona s lepkem se nesmí publikovat');
  assert.equal(b.checked, 'plan_html');
  assert.equal(b.reason, 'gluten_free');
});

test('brána: bez body_metrics se nepublikuje', () => {
  // Neznámá dieta se nesmí chovat jako žádná dieta — tak vznikla ta díra.
  const v = assertPlanPublishableForDiet({ planHtml: '<p>cokoli</p>', bm: null });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'no_body_metrics');
});

test('brána: uživatel bez omezení se nezdržuje', () => {
  const v = assertPlanPublishableForDiet({
    planJson: null,
    planHtml: '<p>Snídaně: celozrnný chléb s máslem</p>',
    bm: { diet_type: 'standard' },
  });
  assert.equal(v.ok, true);
  assert.equal(v.checked, 'no_restrictions');
});

test('brána: laktóza a vegetarián v holém HTML', () => {
  const bezLaktozy = assertPlanPublishableForDiet({
    planHtml: '<p><b>Svačina:</b> Jogurt s müsli</p>',
    bm: { diet_type: 'lactose_free' },
  });
  assert.equal(bezLaktozy.ok, false, 'jogurt nesmí projít bez laktózy');

  const vegetarian = assertPlanPublishableForDiet({
    planHtml: '<p><b>Oběd:</b> Kuřecí prsa s rýží</p>',
    bm: { diet_type: 'vegetarian' },
  });
  assert.equal(vegetarian.ok, false, 'kuřecí nesmí projít vegetariánovi');
  assert.equal(vegetarian.reason, 'vegetarian_meat_fish');
});

test('HTML se láme po segmentech, ne na jeden blob', () => {
  // Jedno „bezlepkový“ v patičce nesmí vybílit celý dokument.
  const segmenty = planHtmlToTextSegments(
    '<p>Bezlepkový program</p><p>Oběd: těstoviny s masem</p>'
  );
  assert.equal(segmenty.length, 2, `čekány 2 segmenty, přišlo ${segmenty.length}`);

  const v = assertPlanPublishableForDiet({
    planHtml: '<p>Bezlepkový program</p><p>Oběd: těstoviny s masem</p>',
    bm: { diet_type: 'gluten_free' },
  });
  assert.equal(v.ok, false, 'marketingová věta nesmí schválit lepkovou položku');
});

test('hasAnyDietaryRestriction pozná i omezení z volného textu', () => {
  assert.equal(hasAnyDietaryRestriction(buildDietaryPublishRules({ diet_type: 'standard' })), false);
  assert.equal(hasAnyDietaryRestriction(buildDietaryPublishRules({ diet_type: 'gluten_free' })), true);
  assert.equal(hasAnyDietaryRestriction(buildDietaryPublishRules({ diet_type: 'lactose_free' })), true);
  assert.equal(
    hasAnyDietaryRestriction(buildDietaryPublishRules({ diet_type: 'standard', foods_to_avoid: 'ořechy' })),
    true,
    'alergie z volného textu je taky omezení'
  );
});
