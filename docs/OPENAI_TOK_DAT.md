# Tok dat – OpenAI Asistent (Body & Mind ON)

Dokument popisuje tok dat od formuláře přes API až po Asistenta a zpět.

---

## Schéma toku

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ZDROJE DAT                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  /start, /on-club, /chci-vip  →  POST /api/body-metrics                      │
│  /profil (Upravit preference) →  PATCH /api/profile-preferences             │
│  assistant-intake (externí)    →  POST /api/assistant-intake                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ULOŽENÍ                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  body_metrics (Supabase)  – metriky, aktivita, cíl, strava, frekvence        │
│  registrations (Supabase) – jen assistant-intake                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  GENEROVÁNÍ PLÁNU                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  generatePlanForEmail(email)  nebo  generatePlanAndSendFromParams(params)    │
│  → načte body_metrics (nebo bmOverride)                                      │
│  → buildUserPrompt(bm) sestaví JSON pro Asistenta                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  VSTUP PRO ASISTENTA (buildUserPrompt)                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  {                                                                           │
│    name, gender, age, height_cm, weight_kg,                                  │
│    activity,      // sedavy | stredne | velmi                                │
│    stress,        // low | medium | high                                     │
│    occupation,    // office_it | manual | teacher_sales                      │
│    goal,          // redukce | nabirani_svaly | udrzovani                    │
│    weekly_sessions,  // 1 | 3 | 5 (počet tréninků týdně)                     │
│    diet_type,     // standard | vegetarian | vegan                          │
│    preferences    // Bez lepku, Co nejí, Potraviny k vynechání, poznámky     │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  OPENAI API                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  runAssistantWithPrompt(userMessage)                                         │
│  → threads.create / messages.create                                           │
│  → runs.create(assistant_id: OPENAI_ASSISTANT_ID)                             │
│  → poll do completion                                                         │
│  → vrací rawContent (JSON s ok, metrics, html)                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ASISTENT (platform.openai.com)                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Instrukce: docs/OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md                      │
│  File Search: analýzy, návody, specifikace                                   │
│  Vrací: { ok, metrics: { bmr, tdee, calories, protein_g, carbs_g, fat_g },   │
│          html: "<h2>...</h2>..." }                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ZPRACOVÁNÍ ODPOVĚDI                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  extractJsonFromAiOutput / extractHtmlFromAiOutput                           │
│  → sanitizeHtmlFromJson, enrichTrainingSection                                │
│  → kontrola diet_type a preferences (planViolatesDiet, planViolatesGlutenFree)│
│  → případný retry při porušení                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ULOŽENÍ A ODESLÁNÍ                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ai_generated_plans (INSERT) – user_id, email, plan_html, plan_type, ...     │
│  sendPlanEmail(email, planHtml) – Gmail (GMAIL_USER, GMAIL_APP_PASSWORD)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Mapování hodnot

| Pole | Formulář (česky) | DB / API (canonical) | Asistent |
|------|------------------|----------------------|----------|
| activity | Nízká, Střední, Vysoká | sedavy, stredne, velmi | sedavy/stredne/velmi |
| stress | Nízký, Střední, Vysoký | low, medium, high | low/medium/high |
| occupation | Sedavé, Aktivní, Kombinované | office_it, manual, teacher_sales | office_it/manual/teacher_sales |
| goal | Redukce, Nárůst, Zdravý | redukce, nabirani_svaly, udrzovani | redukce/nabirani_svaly/udrzovani |
| weekly_sessions | 1-2x, 2-3x, 4-5x týdně | freq_choice (text), weekly_sessions_user (1/3/5) | 1 / 3 / 5 |

---

## Související soubory

- `lib/generatePlan.js` – buildUserPrompt, runAssistantWithPrompt, generatePlanForEmail
- `lib/preferenceConstants.js` – normalizeActivity, normalizeGoal, normalizeOccupation, normalizeFrequency
- `pages/api/body-metrics.js` – registrace, volá generatePlanForEmail
- `pages/api/profile-preferences.js` – PATCH preferencí, volá generatePlanForEmail
- `pages/api/assistant-intake.js` – externí formulář, volá generatePlanAndSendFromParams
- `pages/api/generate-plan.js` – veřejný endpoint (rate limit 5/10 min)
- `docs/OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md` – instrukce pro Asistenta
