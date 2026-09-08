// GET/POST /api/cron/translate-recipes — every 5 min while untranslated rows exist
import { isCronAuthorized } from '../../lib/adminAuth.js';
import { supabaseServer } from '../../lib/supabaseServer.js';
import { runCatalogRecipeTranslation, countRemainingUntranslated } from '../../lib/spoonacular/catalogTranslate.js';
import { runExerciseInstructionTranslation, zbyvaPrelozitPostupu } from '../../lib/prekladPostupuCviku.js';
import { provedJedenTahPrekladu } from '../../lib/translateQueueOrchestrator.js';
import { nactiPosledniFrontu, ulozPosledniFrontu } from '../../lib/translateQueueTurn.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = isCronAuthorized(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const startedAt = new Date().toISOString();

  try {
    // DVĚ FRONTY, NEJVÝŠ JEDNO VELKÉ OPENAI VOLÁNÍ ZA BĚH.
    // Dřív měly recepty absolutní přednost (cviky jely, jen když
    // `result.translated === 0`) — jenže recepty nikdy nedojdou na nulu,
    // protože /api/cron/import-spoonacular frontu denně doplňuje. Cviky tak
    // 183 anglických postupů přeložily přesně nula krát.
    //
    // Řešení je kolotočové střídání přes perzistovaný ukazatel "kdo byl na
    // řadě naposled" (lib/translateQueueTurn.js) — úvaha proč zrovna tohle
    // a ne bezstavová alternativa je v lib/translateQueueOrchestrator.js.
    // Rozhodnutí i spuštění je přesunuté tam, tenhle handler jen dodá
    // skutečné počty/funkce a zaloguje výsledek.
    const [recipesRemaining, cvikyRemaining] = await Promise.all([
      countRemainingUntranslated(),
      zbyvaPrelozitPostupu(),
    ]);

    // Tabulka translate_queue_turn je zatím jen návrh (migrace neaplikovaná
    // — viz supabase/migrations/20260908110000_translate_queue_turn.sql).
    // Dokud neexistuje, čtení spadne — bereme to jako "bez historie", ne
    // jako chybu běhu; střídání se tím degraduje na "recepty vyhrávají
    // remízu", dokud migrace nepřistane, ale cron dál běží.
    let posledniFronta = null;
    try {
      posledniFronta = await nactiPosledniFrontu(supabaseServer);
    } catch (err) {
      console.error('[cron/translate-recipes] nelze načíst poslední frontu, pokračuji bez historie', err?.message || err);
    }

    const { queuePicked, recipes: result, exercises: cvikyRaw } = await provedJedenTahPrekladu({
      recipesRemaining,
      cvikyRemaining,
      posledniFronta,
      // ŽÁDNÁ VELIKOST DÁVKY TADY. Bylo tu natvrdo `{ batch: 20 }`, které
      // přebilo výchozí hodnotu v `runCatalogRecipeTranslation` — dvacet
      // receptů i s postupy je jeden request na 8000 tokenů a do maxDuration
      // 120 s se nevejde spolehlivě (23. 8. skončily na 504 dva z šesti běhů).
      // Dávka patří k překladači, ne ke cronu; ať je na jednom místě.
      runRecipes: () => runCatalogRecipeTranslation(),
      runExercises: () => runExerciseInstructionTranslation(),
    });
    const cviky = queuePicked === 'exercises' ? cvikyRaw : null;

    if (queuePicked) {
      try {
        await ulozPosledniFrontu(supabaseServer, queuePicked);
      } catch (err) {
        console.error('[cron/translate-recipes] nelze uložit poslední frontu', err?.message || err);
      }
    }

    if (!queuePicked) {
      console.log('[cron/translate-recipes] nothing remaining', startedAt);
    } else if (queuePicked === 'recipes') {
      console.log('[cron/translate-recipes] batch done', {
        queue: 'recipes',
        translated: result.translated,
        remaining: result.remaining,
      });
    } else {
      console.log('[cron/translate-recipes] exercise instructions', {
        queue: 'exercises',
        translated: cviky.translated,
        remaining: cviky.remaining,
        errors: cviky.errors,
      });
    }

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
      queue_picked: queuePicked,
      translated: result.translated,
      remaining: result.remaining,
      errors: result.errors,
      exercise_instructions: cviky
        ? { translated: cviky.translated, remaining: cviky.remaining, errors: cviky.errors }
        : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/translate-recipes] error', msg);
    return res.status(500).json({ ok: false, error: msg, started_at: startedAt });
  }
}
