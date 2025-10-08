// /pages/api/body-metrics.js
import { supabaseServer } from '../../lib/supabaseServer'
import { generatePlanForEmail } from '../../lib/generatePlan'

const MAPS = { /* … nech tak, jak to máš … */ }

const norm = (group, v) =>
  v == null ? null : (MAPS[group][String(v).trim().toLowerCase()] || v)
const toNum = (v) =>
  v === '' || v == null || typeof v === 'undefined' ? null : Number(v)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const b = req.body || {}

    const payload = {
      user_id: b.user_id || null,
      email: b.email || null,
      name: b.name || null,

      gender: norm('gender', b.gender),
      age: toNum(b.age),
      height_cm: toNum(b.height_cm),
      weight_kg: toNum(b.weight_kg),

      activity: norm('activity', b.activity),
      stress_level: norm('stress_level', b.stress_level),
      occupation: norm('occupation', b.occupation),
      goal: norm('goal', b.goal),
      freq_choice: norm('freq_choice', b.freq_choice),
      weekly_sessions_user: toNum(b.weekly_sessions_user),

      notes: b.notes || null
    }

    if (payload.age !== null && Number.isNaN(payload.age)) throw new Error('Věk musí být číslo')
    if (payload.height_cm !== null && Number.isNaN(payload.height_cm)) throw new Error('Výška musí být číslo')
    if (payload.weight_kg !== null && Number.isNaN(payload.weight_kg)) throw new Error('Váha musí být číslo')

    const { error: dbErr } = await supabaseServer.from('body_metrics').insert([payload])
    if (dbErr) {
      console.error('[body-metrics] DB error:', dbErr)
      throw new Error(`DB insert failed: ${dbErr.message}`)
    }

    // async ping do Make (pokud máš webhook)
    const MAKE_URL = process.env.MAKE_WEBHOOK_URL || process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL
    ;(async () => {
      if (!MAKE_URL) return
      try {
        const r = await fetch(MAKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!r.ok) console.error('[make] failed', r.status, await r.text())
      } catch (e) { console.error('[make] error', e) }
    })()

    // async: rovnou spustíme generování plánu (pokud je e-mail)
    ;(async () => {
      if (!payload.email) return
      try { await generatePlanForEmail(payload.email) } catch (e) { console.error('[plan-gen]', e) }
    })()

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[body-metrics] ERROR:', e)
    return res.status(400).json({ error: e.message || String(e) })
  }
}
