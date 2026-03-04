// PATCH /api/profile-preferences – uloží preference (aktivita, cíl, strava, návyky) a přegeneruje plán
// Workouty zůstávají nedotčeny – mění se jen body_metrics a user_habits
import { supabaseServer } from '../../lib/supabaseServer';
import { generatePlanForEmail } from '../../lib/generatePlan';
import { isValidHabitId, POSITIVE_HABITS } from '../../lib/habits';
import { normalizeOccupation } from '../../lib/preferenceConstants';

function normalizeActivity(v) {
  if (!v) return null;
  const t = String(v).toLowerCase().trim();
  if (['sedavy', 'lehce', 'stredne', 'velmi', 'extra'].includes(t)) return t;
  if (t === 'nízká' || (t.includes('nízk') && !t.includes('střed'))) return 'sedavy';
  if (t.includes('lehce') || t.includes('lehk')) return 'sedavy';
  if (t.includes('střed')) return 'stredne';
  if (t.includes('vysok') || t.includes('extra')) return 'velmi';
  return 'stredne';
}

function normalizeStress(v) {
  if (!v) return null;
  const t = String(v).toLowerCase().trim();
  if (['low', 'medium', 'high'].includes(t)) return t;
  if (t.includes('nízk')) return 'low';
  if (t.includes('střed')) return 'medium';
  if (t.includes('vysok')) return 'high';
  return 'medium';
}

function normalizeGoal(v) {
  if (!v) return null;
  const t = String(v).toLowerCase().trim();
  if (['redukce', 'nabirani_svaly', 'udrzovani'].includes(t)) return t;
  if (t.includes('reduk') || t.includes('hmotnosti')) return 'redukce';
  if (t.includes('sval') || t.includes('nárůst')) return 'nabirani_svaly';
  if (t.includes('zdrav') || t.includes('udrž') || t.includes('životní')) return 'udrzovani';
  return 'udrzovani';
}

/** Canonical hodnoty (shodné s option value ve formulářích): 1-2x týdně | 2-3x týdně | 4-5x týdně */
function normalizeFrequency(v) {
  if (!v) return null;
  const t = String(v).toLowerCase();
  if (t.includes('1') && (t.includes('2') || t.includes('-') || t.includes('–'))) return '1-2x týdně';
  if (t.includes('2') && t.includes('3')) return '2-3x týdně';
  if (t.includes('4') || t.includes('5')) return '4-5x týdně';
  return '2-3x týdně';
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Nejste přihlášen' });

    const { data: { user }, error: userErr } = await supabaseServer.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'Neplatná session' });

    const userId = user.id;
    const email = user.email?.toLowerCase();
    if (!email) return res.status(400).json({ error: 'Chybí e-mail.' });

    const b = req.body || {};

    // Načíst nejnovější body_metrics
    const { data: metricsRows, error: metricsErr } = await supabaseServer
      .from('body_metrics')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (metricsErr || !metricsRows?.length) {
      return res.status(400).json({ error: 'Žádné metriky pro tohoto uživatele. Nejprve dokonči registraci.' });
    }

    const latest = metricsRows[0];
    const updates = {};

    if (b.activity !== undefined) updates.activity = normalizeActivity(b.activity) ?? latest.activity;
    if (b.stress_level !== undefined) updates.stress_level = normalizeStress(b.stress_level) ?? latest.stress_level;
    if (b.occupation !== undefined || b.worktype !== undefined) {
      updates.occupation = normalizeOccupation(b.occupation ?? b.worktype) ?? normalizeOccupation(latest.occupation) ?? null;
    }
    if (b.goal !== undefined) updates.goal = normalizeGoal(b.goal) ?? latest.goal;
    if (b.freq_choice !== undefined || b.frequency !== undefined) {
      const canonicalFreq = normalizeFrequency(b.freq_choice ?? b.frequency) ?? latest.freq_choice;
      if (canonicalFreq) {
        updates.freq_choice = canonicalFreq;
        updates.weekly_sessions_user = canonicalFreq.includes('1') ? 1 : canonicalFreq.includes('4') ? 5 : 3;
      }
    }
    if (b.diet_type !== undefined) updates.diet_type = (b.diet_type || '').trim() || null;
    if (b.dietary_restrictions !== undefined) updates.dietary_restrictions = (b.dietary_restrictions || '').trim() || null;
    if (b.foods_to_avoid !== undefined) updates.foods_to_avoid = (b.foods_to_avoid || '').trim() || null;

    if (Object.keys(updates).length > 0) {
      let toUpdate = { ...updates };
      let updateErr = null;
      let result = await supabaseServer.from('body_metrics').update(toUpdate).eq('id', latest.id);
      updateErr = result.error;

      // Retry bez volitelných sloupců, pokud DB nemá novější migraci
      const columnMissing = updateErr?.message && (
        /does not exist|neexistuje|column.*not found/i.test(updateErr.message)
      );
      if (updateErr && columnMissing) {
        const optionalCols = ['foods_to_avoid', 'dietary_restrictions'];
        for (const col of optionalCols) {
          if (col in toUpdate) {
            delete toUpdate[col];
            if (Object.keys(toUpdate).length > 0) {
              result = await supabaseServer.from('body_metrics').update(toUpdate).eq('id', latest.id);
              updateErr = result.error;
              if (!updateErr) break;
            }
          }
        }
      }

      if (updateErr) {
        console.error('[profile-preferences] body_metrics update:', updateErr);
        const msg = updateErr.message || '';
        const friendly =
          /foods_to_avoid|dietary_restrictions/i.test(msg) && /does not exist|neexistuje/i.test(msg)
            ? 'Databáze ještě nemá sloupec – spusť migraci 20260320_body_metrics_foods_to_avoid.sql v Supabase.'
            : /violates check constraint|check constraint/i.test(msg)
            ? 'Neplatná hodnota v jednom z polí (aktivita, typ práce, cíl). Zkus znovu vybrat z nabídky.'
            : null;
        return res.status(500).json({
          error: friendly || 'Nepodařilo se uložit preference.',
          detail: process.env.NODE_ENV === 'development' ? msg : undefined,
        });
      }
    }

    // Aktualizovat user_habits
    if (Array.isArray(b.selected_habits)) {
      const validHabits = b.selected_habits
        .filter((id) => typeof id === 'string' && isValidHabitId(id.trim()))
        .map((id, i) => ({
          user_id: userId,
          habit_id: String(id).trim(),
          is_positive: POSITIVE_HABITS.some((p) => p.id === String(id).trim()),
          sort_order: i,
        }));

      const { error: delErr } = await supabaseServer
        .from('user_habits')
        .delete()
        .eq('user_id', userId);

      if (delErr) console.warn('[profile-preferences] user_habits delete:', delErr.message);

      if (validHabits.length > 0) {
        const { error: insErr } = await supabaseServer.from('user_habits').insert(validHabits);
        if (insErr) console.warn('[profile-preferences] user_habits insert:', insErr.message);
      }
    }

    // Přegenerovat plán a odeslat e-mail s novým plánem – workouty zůstávají nedotčeny
    const bmOverride = { ...latest, ...updates, email };
    let planRegenerated = false;
    try {
      const result = await generatePlanForEmail(email, {
        bmOverride,
        planChangeContext: true,
      });
      planRegenerated = result?.ok === true;
    } catch (e) {
      console.error('[profile-preferences] generatePlanForEmail:', e);
      return res.status(200).json({
        ok: true,
        message: 'Preference byly uloženy. Přegenerování plánu se nepodařilo – zkus to znovu nebo nás kontaktuj.',
        planRegenerated: false,
      });
    }

    return res.status(200).json({
      ok: true,
      message: planRegenerated ? 'Preference uloženy, plán přegenerován a odeslán na e-mail.' : 'Preference uloženy.',
      planRegenerated,
    });
  } catch (err) {
    console.error('[profile-preferences] ERROR:', err);
    return res.status(500).json({ error: err.message || 'Chyba serveru' });
  }
}
