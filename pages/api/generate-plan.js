// /pages/api/generate-plan.js
// API endpoint – Body & Mind ON AI Assistant
// POST → vrátí personalizovaný plán jako HTML blok

import { generatePlan } from '../../lib/generatePlan'
import { getClientIp, isRateLimited } from '../../lib/rateLimit'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Použij POST' })
  }

  try {
    const ip = getClientIp(req)
    if (isRateLimited(`generate-plan:${ip}`, 5, 10 * 60 * 1000)) {
      res.setHeader('Retry-After', '600')
      return res.status(429).json({ ok: false, error: 'Příliš mnoho požadavků. Zkus to prosím za chvíli znovu.' })
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

    const { html, metrics, enrichment } = await generatePlan({
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
      diet_type: diet_type ?? null,
      dietary_restrictions: dietary_restrictions ?? preferences ?? null,
      foods_to_avoid: foods_to_avoid ?? null,
      notes,
    })

    return res.status(200).json({ ok: true, html, metrics, enrichment: enrichment || { meals: [], exercises: [] } })
  } catch (err) {
    console.error('❌ /api/generate-plan error:', err)
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Chyba při generování plánu',
    })
  }
}
