// /pages/api/generate-plan.js
// API endpoint – Body & Mind ON AI Assistant
// POST → vrátí personalizovaný plán jako HTML blok

import { generatePlan } from '../../lib/generatePlan'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Použij POST' })
  }

  try {
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
      notes,
      preferences,
    } = req.body || {}

    const { html, metrics } = await generatePlan({
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
      notes,
    })

    return res.status(200).json({ ok: true, html, metrics })
  } catch (err) {
    console.error('❌ /api/generate-plan error:', err)
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Chyba při generování plánu',
    })
  }
}
