// GET/POST /api/cron/translate-recipes — every 5 min while untranslated rows exist
import { isCronAuthorized } from '../../lib/adminAuth.js';
import { runCatalogRecipeTranslation } from '../../lib/spoonacular/catalogTranslate.js';
import { runExerciseInstructionTranslation } from '../../lib/prekladPostupuCviku.js';

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
    // ŽÁDNÁ VELIKOST DÁVKY TADY. Bylo tu natvrdo `{ batch: 20 }`, které
    // přebilo výchozí hodnotu v `runCatalogRecipeTranslation` — dvacet
    // receptů i s postupy je jeden request na 8000 tokenů a do maxDuration
    // 120 s se nevejde spolehlivě (23. 8. skončily na 504 dva z šesti běhů).
    // Dávka patří k překladači, ne ke cronu; ať je na jednom místě.
    const result = await runCatalogRecipeTranslation();

    if (result.remaining <= 0) {
      console.log('[cron/translate-recipes] nothing remaining', startedAt);
    } else {
      console.log('[cron/translate-recipes] batch done', {
        translated: result.translated,
        remaining: result.remaining,
      });
    }

    // POSTUPY CVIKŮ JEDOU STEJNOU LINKOU — docs/DALSI_KROK.md 9.9.
    // Recepty mají přednost: cviky přijdou na řadu, jen když receptová dávka
    // nic nepřeložila. Jeden běh cronu tak platí nejvýš jedno velké OpenAI
    // volání a drží se v maxDuration 120 s (viz proč dávka 10 u receptů).
    let cviky = null;
    if (result.translated === 0) {
      cviky = await runExerciseInstructionTranslation();
      if (cviky.translated > 0 || cviky.remaining > 0 || cviky.errors) {
        console.log('[cron/translate-recipes] exercise instructions', {
          translated: cviky.translated,
          remaining: cviky.remaining,
          errors: cviky.errors,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
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
