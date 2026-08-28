/**
 * Naplanovane ulohy zije jen ve `vercel.json`, na jednom miste.
 *
 * PROC. AI scheduler mel rozvrh v GitHub Actions
 * (`.github/workflows/ai-scheduler.yml`), protoze projekt byl kdysi na Vercel
 * Hobby s limitem 1 cron denne. 21. 8. 2026 se `schedule` zakomentoval
 * s odvodnenim, ze "v repu nejsou secrets APP_URL a CRON_SECRET" — coz nebyla
 * pravda, oba tam byly od 11. 3. Scheduler prestal bezet na ctyri dny a nikdo
 * to nepoznal, protoze zadny alert na "neplanovana uloha se neplanuje" neni.
 *
 * Scheduler zpracovava i `initial_plan`, takze vypadek se tyka platicich
 * uzivatelu. Rozvrh je od 28. 8. 2026 ve `vercel.json` a tenhle test hlida,
 * ze tam zustane a ze se nevrati druhe misto, ktere plánuje totez.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/ai-scheduler.yml', 'utf8');

/** Radky workflow bez komentaru — historie se v nich popisuje, i ta zrusena. */
const workflowKod = workflow
  .split('\n')
  .filter((r) => !r.trim().startsWith('#'))
  .join('\n');

const SCHEDULER = '/api/ai/run-scheduler';

test('AI scheduler ma rozvrh ve vercel.json', () => {
  const zaznam = (vercel.crons || []).find((c) => c.path === SCHEDULER);
  assert.ok(zaznam, `${SCHEDULER} chybi ve vercel.json crons — scheduler by nebezel`);
  assert.match(zaznam.schedule, /^\S+ \S+ \S+ \S+ \S+$/, 'rozvrh neni platny cron vyraz');
});

test('scheduler bezi aspon jednou za pul hodiny', () => {
  // Je to zachranna sit pro initial_plan (primarne se generuje inline
  // v api/body-metrics.js) a zaroven jedina cesta, jak se sebere uloha,
  // ktera uvizla v `processing` — AI_TASK_PROCESSING_STALE_MINUTES je 15.
  // Delsi interval nez ten stale window znamena, ze uvizla uloha ceka dyl,
  // nez je nutne.
  const { schedule } = (vercel.crons || []).find((c) => c.path === SCHEDULER);
  const minuty = schedule.split(' ')[0];
  const shoda = /^\*\/(\d+)$/.exec(minuty);
  assert.ok(shoda, `rozvrh "${schedule}" neni ve tvaru */N minut`);
  assert.ok(Number(shoda[1]) <= 30, `interval ${shoda[1]} min je pro zachrannou sit prilis dlouhy`);
});

test('scheduler ma maxDuration — jeden trainer task jede celou pipeline', () => {
  const fn = (vercel.functions || {})['api/ai/run-scheduler.js'];
  assert.ok(fn?.maxDuration >= 300, 'run-scheduler nema maxDuration 300 s');
});

test('rozvrh neni na dvou mistech', () => {
  // Dve mista, ktera planuji totez, se zase rozejdou — a duplikace
  // CRON_SECRET mezi Vercelem a GitHubem byla prima pricina vypadku.
  assert.doesNotMatch(workflowKod, /^\s*schedule:/m, 'workflow ma zase vlastni rozvrh');
  assert.match(workflowKod, /workflow_dispatch/, 'rucni spusteni je zachrana, ma zustat');
});

test('kazdy cron ma existujici handler', () => {
  // Preklep v ceste znamena cron, ktery tise nikdy nebezi.
  for (const { path } of vercel.crons || []) {
    const soubor = `api${path.replace(/^\/api/, '')}.js`;
    assert.ok(fs.existsSync(soubor), `cron ${path} ukazuje na neexistujici ${soubor}`);
  }
});
