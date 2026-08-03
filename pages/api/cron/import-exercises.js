// GET/POST /api/cron/import-exercises — denní doplňování katalogu cviků (CRON_SECRET)
//
// Uzavírá smyčku, která do teď neexistovala vůbec:
//
//   skladači dojde nabídka  →  objednejChybejiciCviky  →  řádek v
//   exercise_import_queue  →  TENHLE CRON  →  nový cvik v registry
//
// Fronta se plní sama ze dvou stran: z reálné poptávky (uživatel dostal stejný
// cvik v týdnu dvakrát, protože nebylo čím ho nahradit) a z denní kontroly
// pokrytí, která díru zavře dřív, než na ni někdo narazí.
//
// Člověk v tom nefiguruje. Kontrolu obsahu dělají brány pod tímhle endpointem:
// vybavení a partie ze slovníku, český název ze slovníku v lib/exerciseNameCs.js
// a nakonec trigger enforce_exercise_registry_rules, který jediný rozhoduje,
// co se smí dostat do plánu.
//
// Náklad běhu je nula — cviky se přebírají z hotového datasetu (Unlicense),
// nic se negeneruje modelem. Strop drží IMPORT_MAX_PER_RUN.
import { isCronAuthorized } from '../../../lib/adminAuth';
import { runExerciseImport } from '../../../lib/exerciseImportRun';
import { objednejChybejiciPokryti } from '../../../lib/exerciseImportQueue';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const startedAt = new Date().toISOString();
  const dryRun = String(req.query?.dry_run || '') === '1';

  try {
    // Nejdřív doplnit frontu o díry v pokrytí, pak ji celou vybrat — jinak by
    // se na nově zjištěnou díru čekalo do zítřka.
    const objednano = dryRun ? [] : await objednejChybejiciPokryti();
    const vysledek = await runExerciseImport({ dryRun });

    console.log(JSON.stringify({
      source: 'cron/import-exercises',
      event: vysledek.skipped ? 'skipped' : 'done',
      started_at: startedAt,
      dry_run: dryRun,
      reason: vysledek.reason ?? null,
      novych_objednavek: objednano.length,
      objednavek_zpracovano: vysledek.objednavek ?? 0,
      zapsano: vysledek.zapsano ?? 0,
      duvody_zahozeni: vysledek.zahozeno ?? [],
      chyby: vysledek.chyby ?? [],
    }));

    return res.status(200).json({
      ok: true, started_at: startedAt, novych_objednavek: objednano.length, ...vysledek,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      source: 'cron/import-exercises', event: 'error', started_at: startedAt, error: msg,
    }));
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
