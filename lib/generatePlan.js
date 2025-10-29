// /lib/generatePlan.js
// ------------------------------------------------------
// Body & Mind ON – AI trenér výživy, cvičení a mindsetu
// Autor: Honza / ProGenix
// ------------------------------------------------------

import OpenAI from 'openai'

// ========== Pomocné funkce ==========

function asNum(n, def = 0) {
  const num = Number(n)
  return Number.isFinite(num) ? num : def
}

// Mifflin–St Jeor BMR výpočet
function calcBMR({ gender = 'male', weight_kg, height_cm, age }) {
  const w = asNum(weight_kg)
  const h = asNum(height_cm)
  const a = asNum(age)
  if (gender?.toLowerCase() === 'female') {
    return 10 * w + 6.25 * h - 5 * a - 161
  }
  return 10 * w + 6.25 * h - 5 * a + 5
}

// Faktory aktivity, stresu a práce
const ACTIVITY_FACTOR = {
  sedavy: 1.2,
  lehce: 1.375,
  stredne: 1.55,
  velmi: 1.725,
  extra: 1.9,
}

const OCCUPATION_FACTOR = {
  office_it: 0.98,
  driver: 1.0,
  warehouse: 1.06,
  manual: 1.08,
  healthcare: 1.05,
  teacher_sales: 1.03,
  gastronomy: 1.05,
}

const STRESS_FACTOR = {
  low: 1.00,
  medium: 0.98,
  high: 0.96,
}

// Tréninkový koeficient
function trainingFactor(weeklySessions) {
  const s = asNum(weeklySessions)
  if (s >= 5) return 1.10
  if (s >= 3) return 1.05
  if (s >= 1) return 1.02
  return 1.0
}

// Cílová úprava kalorií
function applyGoal(tdee, goal) {
  const g = (goal || '').toLowerCase()
  if (g.includes('reduk')) return Math.round(tdee * 0.80)
  if (g.includes('nab') || g.includes('sval')) return Math.round(tdee * 1.15)
  return Math.round(tdee)
}

function round50(x) {
  return Math.round(x / 50) * 50
}

// Výpočet makroživin
function splitMacros({ calories, weight_kg, gender = 'male', stress = 'medium', weeklySessions = 3 }) {
  const w = Math.max(1, asNum(weight_kg))
  const g = (gender || 'male').toLowerCase()
  const s = (stress || 'medium').toLowerCase()
  const sessions = asNum(weeklySessions, 3)

  let proteinPerKg = 1.8
  if (sessions >= 4) proteinPerKg = 2.0
  if (s === 'high') proteinPerKg = 2.1
  if (g === 'female') proteinPerKg = Math.min(proteinPerKg, 2.0)

  const protein_g = Math.round(proteinPerKg * w)

  let fatPerKg = g === 'female' ? 1.0 : 0.9
  if (s === 'high') fatPerKg = 1.0
  const fat_g = Math.round(fatPerKg * w)

  const kcalFromProtein = protein_g * 4
  const kcalFromFat = fat_g * 9
  const carbs_g = Math.max(0, Math.round((calories - kcalFromProtein - kcalFromFat) / 4))

  return { protein_g, fat_g, carbs_g }
}

// Bezpečný text
function safe(v, fallback = '—') {
  if (v === 0) return '0'
  return (v === undefined || v === null || v === '') ? fallback : String(v)
}

// ========== PROMPT ==========

function buildSystemPrompt() {
  return `
Jsi Body & Mind ON – empatický AI trenér výživy, cvičení a mindsetu.
Piš česky, lidsky, přirozeně. Motivuj: "Zvládneš to!", "Tělo ti poděkuje."
Vrať JEN 1 HTML BLOK (bez <html>/<body>), strukturovaný, s ikonami (emoji).
`
}

function buildUserPromptHTML(vars) {
  const {
    age, height_cm, weight_kg, activityLabel, stressLabel, jobLabel,
    goalLabel, weeklySessions, calories, protein_g, carbs_g, fat_g
  } = vars

  return `
<h2 style="text-align:center; color:#00BFFF;">💙 Tvůj osobní plán Body & Mind ON</h2>

<p style="text-align:center; color:#444;">
Díky, že ses svěřil do rukou našeho AI trenéra.  
Tenhle plán je vytvořen přesně pro tebe — s respektem k tvému tělu, hlavě i energii.  
<b>Tohle už je parádní start!</b>
</p>

<div style="background:#f5f9ff; padding:20px; border-radius:10px;">
  <h3 style="color:#0077cc;">👤 Osobní údaje & cíle</h3>
  <ul style="list-style:none; padding:0;">
    <li><b>Věk:</b> ${safe(age)} let</li>
    <li><b>Výška:</b> ${safe(height_cm)} cm</li>
    <li><b>Váha:</b> ${safe(weight_kg)} kg</li>
    <li><b>Aktivita:</b> ${safe(activityLabel)}</li>
    <li><b>Stres:</b> ${safe(stressLabel)}</li>
    <li><b>Práce:</b> ${safe(jobLabel)}</li>
    <li><b>Cíl:</b> ${safe(goalLabel)}</li>
    <li><b>Tréninky týdně:</b> ${safe(weeklySessions)}</li>
  </ul>
</div>

<div style="background:#e6f9f5; padding:20px; border-radius:10px;">
  <h3 style="color:#009688;">🥗 Denní cíle</h3>
  <ul style="list-style:none; padding:0;">
    <li><b>Kalorie:</b> ${safe(calories)} kcal</li>
    <li><b>Bílkoviny:</b> ${safe(protein_g)} g</li>
    <li><b>Sacharidy:</b> ${safe(carbs_g)} g</li>
    <li><b>Tuky:</b> ${safe(fat_g)} g</li>
  </ul>
</div>

<div style="background:#fff; padding:20px; border-radius:10px; border:1px solid #ddd;">
  <h3>🍽️ Jídelníček na 7 dní</h3>
  {{weekly_meal_plan}}
</div>

<div style="background:#f7f7ff; padding:20px; border-radius:10px;">
  <h3>💪 Tréninkový plán</h3>
  {{workout_plan}}
</div>

<div style="background:#fff7f0; padding:20px; border-radius:10px;">
  <h3>🧘 Regenerace & Mindfulness</h3>
  <ul style="list-style:none; padding:0;">
    <li>😴 Spánek: 7–9 hodin denně</li>
    <li>💧 Hydratace: 2–3 litry vody</li>
    <li>🧠 Mindset: krátká meditace nebo dechové cvičení</li>
    <li>🤸‍♀️ Protahování po tréninku</li>
  </ul>
</div>

<p style="text-align:center; color:#666;">🔥 Každý krok se počítá. <br> Tým Body & Mind ON 💙</p>
`
}

// ========== HLAVNÍ FUNKCE ==========

export async function generatePlan(inputs) {
  const {
    name = '',
    gender = 'male',
    age,
    height_cm,
    weight_kg,
    activity = 'stredne',
    stress = 'medium',
    occupation = 'office_it',
    goal = 'udrzovani',
    weekly_sessions = 3,
    preferences = '',
    openaiApiKey = process.env.OPENAI_API_KEY,
  } = inputs

  if (!openaiApiKey) throw new Error('Chybí OPENAI_API_KEY')

  // Výpočet BMR → TDEE → makra
  const bmr = calcBMR({ gender, weight_kg, height_cm, age })
  const tdee = bmr *
    (ACTIVITY_FACTOR[activity] || 1.55) *
    (OCCUPATION_FACTOR[occupation] || 1) *
    (STRESS_FACTOR[stress] || 1) *
    trainingFactor(weekly_sessions)
  const calories = round50(applyGoal(tdee, goal))

  const { protein_g, fat_g, carbs_g } = splitMacros({
    calories,
    weight_kg,
    gender,
    stress,
    weeklySessions: weekly_sessions,
  })

  // Přehledné labely
  const labels = {
    activityLabel: { sedavy: 'Sedavý', lehce: 'Mírně aktivní', stredne: 'Středně aktivní', velmi: 'Velmi aktivní', extra: 'Extrémně aktivní' }[activity],
    stressLabel: { low: 'Nízká', medium: 'Střední', high: 'Vysoká' }[stress],
    jobLabel: { office_it: 'Kancelář / IT', driver: 'Řidič', warehouse: 'Sklad', manual: 'Manuální', healthcare: 'Zdravotnictví', teacher_sales: 'Učitel / Obchod', gastronomy: 'Gastronomie' }[occupation],
    goalLabel: { redukce: 'Redukce', udrzovani: 'Udržení', nabirani_svaly: 'Nárůst svalů' }[goal],
  }

  const system = buildSystemPrompt()
  const userHtml = buildUserPromptHTML({
    ...labels,
    age,
    height_cm,
    weight_kg,
    weeklySessions: weekly_sessions,
    calories,
    protein_g,
    carbs_g,
    fat_g,
  })

  const openai = new OpenAI({ apiKey: openaiApiKey })
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userHtml },
      {
        role: 'user',
        content: `
Doplň do HTML tabulku jídelníčku (Po–Ne, 3–5 jídel denně) a krátký tréninkový plán (45–60 min).
Zohledni preference: ${preferences || '—'}.
Piš česky, přirozeně, bez technických komentářů.`,
      },
    ],
  })

  let html = (completion.choices?.[0]?.message?.content || '').trim()
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim()
  }

  return {
    html,
    metrics: {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      calories,
      protein_g,
      fat_g,
      carbs_g,
    },
  }
}
