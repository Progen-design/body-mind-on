// /pages/api/generate-plan.js
// API endpoint – Body & Mind ON AI Assistant
// POST → vrátí personalizovaný plán jako HTML blok (unified pipeline)

import { runUnifiedPlanPipeline } from '../../lib/unifiedPlanPipeline'
import { enforcePublicEndpointRateLimit } from '../../lib/rateLimit'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Použij POST' })
  }

  try {
    const rateLimit = await enforcePublicEndpointRateLimit(req, {
      scope: 'generate-plan',
      email: req.body?.email,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    })
    if (rateLimit.limited) {
      if (rateLimit.retryAfterSec) res.setHeader('Retry-After', String(rateLimit.retryAfterSec))
      return res.status(429).json({ ok: false, error: rateLimit.message })
    }

    const {
      name,
      gender,
      age,
      height_cm,
      weight_kg,
      activity,
      stress,
      occupation,
      goal,
      weekly_sessions,
      diet_type,
      dietary_restrictions,
      foods_to_avoid,
      notes,
      preferences,
    } = req.body || {}

    const bm = {
      name,
      gender,
      age,
      height_cm: height_cm ?? null,
      weight_kg: weight_kg ?? null,
      activity,
      stress_level: stress ?? null,
      occupation,
      goal,
      freq_choice: weekly_sessions != null ? String(weekly_sessions) : null,
      weekly_sessions_user: weekly_sessions != null ? parseInt(weekly_sessions, 10) : null,
      diet_type: diet_type ?? null,
      dietary_restrictions: dietary_restrictions ?? preferences ?? null,
      foods_to_avoid: foods_to_avoid ?? null,
      notes,
    }

    const result = await runUnifiedPlanPipeline({ bm, useOpenAI: true })
    if (!result?.ok) {
      return res.status(500).json({ ok: false, error: result?.error ?? 'Chyba při generování plánu' })
    }

    const targets = result.targets ?? result.planJson?.targets ?? {}
    const metrics = {
      calories: Number(targets.calories_per_day) || 2200,
      protein_g: Number(targets.protein_g) || 120,
      carbs_g: Number(targets.carbs_g) || 220,
      fat_g: Number(targets.fat_g) || 65,
    }
    const days = result.planJson?.days ?? []
    const meals = days.flatMap((d) => (d.meals ?? []).map((m) => m.recipe ?? { title: m.display_name })).filter(Boolean)
    const exercises = days.flatMap((d) => (d.workout?.exercises ?? []))
    const enrichment = { meals, exercises }

    return res.status(200).json({
      ok: true,
      html: result.planHtml,
      metrics,
      enrichment,
    })
  } catch (err) {
    console.error('❌ /api/generate-plan error:', err)
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Chyba při generování plánu',
    })
  }
}
