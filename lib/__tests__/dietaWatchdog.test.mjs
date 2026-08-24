/**
 * Watchdog vetev "dieta_pod_kritickym_poctem".
 *
 * PROC. Klient si pri registraci vybere dietu, kterou system nedokaze dodat.
 * Do 24. 8. 2026 se to poznalo az tak, ze se jidelnicek opakoval nebo se slot
 * nevyresil vubec — watchdog mel osmnact vetvi na katalog, import a preklad,
 * ale zadnou na dodatelnost diety.
 *
 * Detekce je v SQL pohledu, takze tenhle test hlida to, co se z JS overit da
 * a co se snadno tise rozejde: PRAH. Zije v JS jako MIN_RECEPTU_NA_SLOT
 * a v pohledu jako literal. Kdyby se rozesly, fronta by objednavala jiny
 * pocet, nez jaky watchdog povazuje za dostatecny.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { MIN_RECEPTU_NA_SLOT } from '../dietOptions.js';

const MIGRACE = 'supabase/migrations/20260824110000_watchdog_dieta_pod_kritickym_poctem.sql';
const sql = fs.readFileSync(MIGRACE, 'utf8');

test('prah v pohledu se rovna MIN_RECEPTU_NA_SLOT', () => {
  const shody = [...sql.matchAll(/coalesce\(c\.pocet,\s*0\)\s*<\s*(\d+)/g)].map((m) => Number(m[1]));

  assert.equal(shody.length, 1, `v pohledu ma byt prave jeden prah, nalezeno ${shody.length}`);
  assert.equal(shody[0], MIN_RECEPTU_NA_SLOT, 'SQL a lib/dietOptions.js se rozesly');
});

test('fronta objednava tolik receptu, kolik watchdog povazuje za dost', () => {
  // Kdyby se lisily, objednavka by diru nikdy nezaplnila na uroven,
  // kterou watchdog prestane hlasit — nebo naopak objednavala zbytecne.
  const fronta = fs.readFileSync('lib/recipeGenerationQueue.js', 'utf8');

  assert.match(
    fronta,
    /pozadovano:\s*MIN_RECEPTU_NA_SLOT/,
    'objednejZNevyresenehoSlotu ma brat pocet z MIN_RECEPTU_NA_SLOT, ne natvrdo',
  );
  assert.doesNotMatch(fronta, /pozadovano:\s*7\b/, 'v objednavce zustalo natvrdo psane 7');
});

test('pohled sleduje diety, ktere katalog opravdu tagem popisuje', () => {
  // lactose_free tu byt NESMI: neresi se tagem, ale vyloucenim mlecnych
  // vyrobku v dietaryPublishGate.js, takze nulovy pocet tagu je u ni v poradku.
  const seznam = sql.match(/unnest\(array\[([^\]]+)\]\) as tag/);
  assert.ok(seznam, 'v pohledu nenalezen seznam sledovanych diet');

  const diety = seznam[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));

  for (const ocekavana of ['vegan', 'vegetarian', 'gluten_free', 'low_carb', 'paleolithic']) {
    assert.ok(diety.includes(ocekavana), `pohled nesleduje ${ocekavana}`);
  }
  assert.ok(!diety.includes('lactose_free'), 'lactose_free se tagem neresi, nema tu co delat');
});

test('sleduji se vsechny ctyri sloty', () => {
  const seznam = sql.match(/unnest\(array\[([^\]]+)\]\) as slot/);
  assert.ok(seznam, 'v pohledu nenalezen seznam slotu');

  const sloty = seznam[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(sloty.sort(), ['obed', 'snidane', 'svacina', 'vecere']);
});

test('puvodni telo watchdogu se prejmenovava, ne prepisuje', () => {
  // Pohled ma pres dvacet vetvi. Rucni prepis celeho tela je nejlepsi zpusob,
  // jak nekterou tise ztratit.
  assert.match(sql, /alter view public\.system_health_alerts rename to system_health_alerts_zaklad/);
  assert.match(sql, /from public\.system_health_alerts_zaklad/);
  assert.doesNotMatch(sql, /uzivatel_bez_planu/, 'puvodni vetve se nemaji prepisovat rucne');
});

test('vetev je samostatny pohled, ne telo uvnitr sjednoceni', () => {
  // Aby sla dalsi vetev pridat jednim radkem a nesla pritom ztratit.
  assert.match(sql, /create or replace view public\.system_health_alerts_dieta_pod_kritickym_poctem as/);
});

// --------------------------------------------------- zadna vetev se neztrati

/**
 * Tenky pohled `system_health_alerts` musi sjednocovat VSECHNY vetve, ktere
 * kdy nejaka migrace zalozila. Kdyby v nem nektera chybela, watchdog by ji
 * tise prestal hlasit — a nikdo by se to nedozvedel, protoze chybejici alert
 * vypada uplne stejne jako "vsechno je v poradku".
 */
const MIGRACE_DIR = 'supabase/migrations';

function nactiVetveASjednoceni() {
  const soubory = fs.readdirSync(MIGRACE_DIR).filter((f) => f.endsWith('.sql')).sort();

  // `_zaklad` nevznika pres CREATE VIEW, ale prejmenovanim — proto rovnou.
  const vetve = new Set(['system_health_alerts_zaklad']);
  let sjednoceni = null;

  for (const soubor of soubory) {
    const telo = fs.readFileSync(`${MIGRACE_DIR}/${soubor}`, 'utf8');

    for (const m of telo.matchAll(/create or replace view public\.(system_health_alerts_[a-z0-9_]+)/gi)) {
      vetve.add(m[1]);
    }

    // Posledni migrace, ktera tenky pohled definuje, je ta platna.
    const union = [...telo.matchAll(/create or replace view public\.system_health_alerts as([\s\S]*?);/gi)];
    if (union.length > 0) sjednoceni = { soubor, telo: union[union.length - 1][1] };
  }

  return { vetve, sjednoceni };
}

test('tenky pohled sjednocuje vsechny vetve, ktere migrace zalozily', () => {
  const { vetve, sjednoceni } = nactiVetveASjednoceni();

  assert.ok(sjednoceni, 'zadna migrace nedefinuje system_health_alerts');
  assert.ok(vetve.size >= 3, `ocekavaji se aspon tri vetve, nalezeno ${vetve.size}`);

  for (const vetev of vetve) {
    assert.ok(
      sjednoceni.telo.includes(`public.${vetev}`),
      `vetev ${vetev} chybi ve sjednoceni (${sjednoceni.soubor}) — watchdog ji prestal hlasit`,
    );
  }
});

test('tenky pohled je opravdu tenky — detekce patri do vetve', () => {
  const { sjednoceni } = nactiVetveASjednoceni();

  assert.doesNotMatch(
    sjednoceni.telo,
    /\bwhere\b|\bhaving\b|\bgroup by\b/i,
    've sjednoceni je logika — patri do samostatne vetve',
  );
});

test('cron cte porad tentyz pohled', () => {
  // Kdyby migrace prejmenovala i cilovy pohled, watchdog by prestal chodit.
  const cron = fs.readFileSync('api/cron/system-health-alert.js', 'utf8');

  assert.match(cron, /from\('system_health_alerts'\)/);
  assert.match(sql, /create or replace view public\.system_health_alerts as/);
});
