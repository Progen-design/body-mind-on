/**
 * ZÁPIS ODCVIČENÉHO TRÉNINKU pro START program.
 *
 * GET  ?from=ISO&to=ISO  — předpisy uživatele v rozsahu (co má odcvičit / co zbývá dopsat)
 * PATCH                  — zapíše výsledek jednoho cviku
 *
 * Bez tohohle endpointu je progrese jen teorie: předpisy by se generovaly,
 * nikdo by je nevyplnil a každý týden by se opakoval ten samý.
 *
 * Řádek se NEZAKLÁDÁ. Předpis vytváří generátor plánu (service_role) — kdyby ho
 * směl založit uživatel, mohl by si připsat cvik, který mu nikdo nepředepsal,
 * a progrese by se opírala o vymyšlená data.
 */
import { saveWorkoutResult } from '../../lib/workoutProgressionStore.js';
import { supabaseServer } from '../../lib/supabaseServer.js';
import { progressionRuleFor, prescriptionMet, progressionNoteCs } from '../../lib/workoutProgression.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Stejný postup jako api/workouts.js — Bearer token přes supabaseServer.auth. */
async function requireUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Authorization required', status: 401 };
  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) return { error: 'Invalid or expired token', status: 401 };
  return { user };
}

/** @param {unknown} v @returns {number[]|null} */
function parsePositiveIntArray(v) {
  if (!Array.isArray(v)) return null;
  if (v.length === 0 || v.length > 10) return null;
  const out = [];
  for (const item of v) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 0 || n > 600) return null;
    out.push(n);
  }
  return out;
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userResult = await requireUser(req);
  if (userResult.error) {
    return res.status(userResult.status).json({ error: userResult.error });
  }
  const { user } = userResult;

  try {
    if (req.method === 'GET') {
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
        return res.status(400).json({ error: 'from a to musí být ve formátu YYYY-MM-DD' });
      }

      const { data, error } = await supabaseServer
        .from('start_workout_progression')
        .select('canonical_key, performed_on, variant, target_sets, target_reps_min, target_reps_max, target_duration_sec, prescribed_weight_kg, reps_done, weight_done_kg, duration_done_sec, status, decision')
        .eq('user_id', user.id)
        .gte('performed_on', from)
        .lte('performed_on', to)
        .order('performed_on', { ascending: true })
        // Sekundární řazení podle `id`. Tabulka nemá sloupec pořadí a předpisy
        // se zakládají v pořadí cviků v plánu, takže vzestupné `id` to pořadí
        // vrací. Bez toho vracel Postgres cviky v pořadí, které se s plánem
        // neshodovalo — zápis měl obrácenou posloupnost než „Dnešní trénink“.
        .order('id', { ascending: true });

      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({
        items: (data || []).map((row) => ({
          ...row,
          progression_kind: progressionRuleFor(row.canonical_key).kind,
          met: row.status === 'done' ? prescriptionMet(row) : null,
          note_cs: progressionNoteCs(row.decision),
        })),
      });
    }

    // PATCH
    const { canonical_key: canonicalKey, performed_on: performedOn, reps_done, weight_kg, duration_sec, skipped } = req.body || {};

    if (!canonicalKey || typeof canonicalKey !== 'string') {
      return res.status(400).json({ error: 'canonical_key je povinný' });
    }
    if (!ISO_DATE.test(String(performedOn || ''))) {
      return res.status(400).json({ error: 'performed_on musí být ve formátu YYYY-MM-DD' });
    }

    const kind = progressionRuleFor(canonicalKey).kind;
    const isSkip = skipped === true;

    /** @type {{ reps_done?: number[]|null, weight_done_kg?: number|null, duration_done_sec?: number[]|null, skipped?: boolean }} */
    const result = { skipped: isSkip };

    if (!isSkip) {
      if (kind === 'timed') {
        const secs = parsePositiveIntArray(duration_sec);
        if (!secs) return res.status(400).json({ error: 'duration_sec musí být pole sekund (1–10 hodnot)' });
        result.duration_done_sec = secs;
      } else {
        const reps = parsePositiveIntArray(reps_done);
        if (!reps) return res.status(400).json({ error: 'reps_done musí být pole opakování (1–10 hodnot)' });
        result.reps_done = reps;

        // Váha je povinná jen u zatížených cviků — u kliků není co zadat.
        if (kind !== 'bodyweight_reps') {
          const w = Number(weight_kg);
          if (!Number.isFinite(w) || w < 0 || w > 500) {
            return res.status(400).json({ error: 'weight_kg musí být číslo 0–500' });
          }
          result.weight_done_kg = w;
        } else if (weight_kg != null) {
          const w = Number(weight_kg);
          if (Number.isFinite(w) && w >= 0 && w <= 500) result.weight_done_kg = w;
        }
      }
    }

    const saved = await saveWorkoutResult({
      userId: user.id,
      canonicalKey,
      performedOn: String(performedOn),
      result,
    });

    if (!saved.ok) {
      if (saved.error === 'prescription_not_found') {
        // 404, ne 500: uživatel poslal cvik nebo den, který mu nikdo nepředepsal.
        return res.status(404).json({ error: 'Pro tenhle den a cvik není předpis.' });
      }
      return res.status(500).json({ error: saved.error || 'Zápis selhal' });
    }

    return res.status(200).json({
      row: saved.row,
      met: prescriptionMet(saved.row),
    });
  } catch (e) {
    console.error('[workout/progression]', e);
    return res.status(500).json({ error: e?.message || 'Neočekávaná chyba' });
  }
}
