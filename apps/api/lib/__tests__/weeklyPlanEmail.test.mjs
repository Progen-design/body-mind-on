/**
 * TÝDENNÍ PLÁN SE MUSÍ POSLAT E-MAILEM.
 *
 * PROČ TENHLE TEST EXISTUJE
 * Do 14. 8. 2026 byl celý blok odesílání v `executeTrainerTask` zavřený za
 * podmínkou `task.task_type === 'initial_plan'`. `weekly_plan_update` plán
 * vygeneroval, uložil a označil za aktivní — a nikomu ho neposlal. V produkci
 * to bylo vidět na číslech: initial_plan 39 plánů / 39 s e-mailem,
 * weekly_plan_update 2 plány / 0 s e-mailem.
 *
 * Testuje se zdroj, ne běh: `executeTrainerTask` sahá na DB, OpenAI i SMTP,
 * takže ho v unit testu spustit nejde. Hlídá se ta jedna podmínka, kvůli které
 * to spadlo, a to, že weekly jde přes stejnou branou jako initial.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = join(import.meta.dirname, '..', '..');
const executors = readFileSync(join(KOREN, 'lib', 'taskExecutors.js'), 'utf8');
const mail = readFileSync(join(KOREN, 'lib', 'mail.js'), 'utf8');

/** Tělo bloku, který rozhoduje o odeslání. */
function blokEmailu() {
  const i = executors.indexOf('const posilatEmail');
  assert.ok(i > 0, 'rozhodnutí o odeslání se nenašlo');
  return executors.slice(i, i + 5200);
}

test('weekly_plan_update je mezi typy, které dostanou e-mail', () => {
  const blok = blokEmailu();

  assert.match(
    blok,
    /posilatEmail\s*=\s*task\.task_type === 'initial_plan' \|\| task\.task_type === 'weekly_plan_update'/,
    'weekly_plan_update musí být v podmínce — přesně tohle chybělo'
  );
  assert.match(blok, /if \(posilatEmail && bm\?\.email && finalGenerated\?\.html\)/,
    'blok odesílání musí viset na posilatEmail, ne na typu úlohy');
});

test('odesílá se přes sendPlanEmail, tedy přes dietní bránu', () => {
  const blok = blokEmailu();
  assert.match(blok, /await sendPlanEmail\(/, 'jiná cesta k člověku by obešla dietní bránu');

  // Kontrola, že v repu nevznikla druhá cesta na odeslání plánu mimo bránu.
  assert.ok(
    mail.includes('DIETNÍ BRÁNA NA HRANICI PUBLIKACE'),
    'sendPlanEmail musí dietní bránu pořád obsahovat'
  );
});

test('navazující týden má vlastní předmět', () => {
  assert.match(blokEmailu(), /followUpWeek: jeNavazujiciTyden/,
    'executor musí příznak předat');

  assert.match(
    mail,
    /options\.followUpWeek === true[\s\S]{0,120}Plán na další týden/,
    'mail.js musí mít pro navazující týden jiný předmět než pro první plán'
  );
  // Uvítací předmět zůstává prvnímu plánu.
  assert.match(mail, /'Tvůj týdenní plán · Body & Mind ON'/);
});

test('email_sent se zapisuje i u týdenní obnovy', () => {
  const blok = blokEmailu();
  assert.match(
    blok,
    /if \(emailSent && sideEffect\?\.plan_id\)[\s\S]{0,220}update\(\{ email_sent: true \}\)/,
    'bez zápisu by se plán posílal každý běh znovu'
  );
});

test('selhání e-mailu nesmí shodit úlohu', () => {
  const blok = blokEmailu();

  // Výjimka z odesílání se musí zachytit — jinak by úloha skončila jako failed
  // a scheduler by ji přehrál, tedy vyrobil plán znovu.
  assert.match(
    blok,
    /try \{[\s\S]{0,900}await sendPlanEmail\([\s\S]{0,900}\} catch \(mailErr\) \{/,
    'volání sendPlanEmail musí být v try/catch'
  );
  assert.match(blok, /sendResult = \{ ok: false/, 'chyba se má převést na neúspěch, ne probublat');

  // A po neúspěchu se musí uvolnit claim, jinak by email_sent navždy tvrdilo,
  // že e-mail odešel, a druhý pokus by se už nikdy nekonal.
  assert.match(blok, /await releasePlanEmailSendClaim\(planId\)/);
});

test('dolepšování plánu zůstává jen u prvního plánu', () => {
  // schedulePlanEnhancementAsync bylo uvnitř bloku pro initial_plan. Rozšíření
  // e-mailu na weekly ho nesmí rozjet i tam — je to placené volání navíc.
  assert.match(
    executors,
    /task\.task_type === 'initial_plan' && sideEffect\?\.plan_id && finalGenerated\?\.planJson/,
    'enhancement musí zůstat gated na initial_plan'
  );
});
