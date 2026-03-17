# Expertní analýza AI asistentů – Body & Mind ON

**Datum:** 2025-03-10  
**Účel:** Ověřit, zda AI asistenti (trainer, coach) řeší to, co mají, a zda jsou správně napojeni na produktové jádro.

---

## 1. Architektura AI asistentů

### 1.1 Zdrojová pravda pro prompty

| Komponenta | Zdroj | Poznámka |
|-----------|-------|----------|
| **System prompt** | `lib/assistantInstructions.js` → `TRAINER_SYSTEM_PROMPT` | Jedna zdrojová pravda |
| **Agent config** | `lib/agentPromptsForSync.js` → `AGENT_PROMPTS`, `AGENT_MODELS` | DB (`ai_agents`) se **nepoužívá** pro prompty – pouze `enabled` flag |
| **Kontext** | `lib/buildAgentContext.js` | Načítá body_metrics, shared_memory, supporting_documents |

### 1.2 Tok dat pro trainer (initial_plan)

```
Registrace (body-metrics API)
  → createInitialAITasks(userId)  → ai_tasks: trainer/initial_plan, coach/onboarding_message
  → aiScheduler zpracuje task
  → executeTrainerTask(task)
    → loadLatestBodyMetrics(userId)  → bm z DB (activity, goal, workout_days už normalizované)
    → runPlanPipeline({ ...bm, user_id, task_context })
      → generatePlan(params)
        → buildUserPrompt(bm, pinnedMeals, null, taskContext)  → userPrompt
        → runAssistantWithPrompt(userPrompt, null, userId)
          → runAgent('trainer', { userId, input: { prompt: userPrompt } })
            → getAgentConfig('trainer')  → system_prompt z kódu
            → buildAgentContext('trainer_coach', userId, input)  → context
            → userContent = { request: { prompt }, context, instructions, integration_rules }
            → openai.responses.create({ instructions: system_prompt, input: [{ role: 'user', content: userContent }] })
```

### 1.3 Co trainer skutečně dostává

| Zdroj | Obsah |
|-------|-------|
| **request.prompt** | Výstup `buildUserPrompt`: VSTUP (JSON) s name, gender, age, height_cm, weight_kg, activity, stress, occupation, goal, weekly_sessions, diet_type, preferences + workout_days blok + TASK_TYPE blok |
| **context.user_context** | body_metrics (celý řádek z DB), latest_plan, previous_plans, user_ai_memory, shared_memory, progress_analysis |
| **context.supporting_documents** | Z `ai_supporting_documents` (agent_slug=trainer, enabled=true) |
| **context.runtime_capabilities** | ai.file_search_runtime=false, enrichment zdroje |
| **instructions** | "Pouzij request.prompt jako hlavni zadani, zachovej personalizaci podle context. Vrat platny JSON." |

---

## 2. Soulad promptu a dat

### 2.1 Očekávání TRAINER_SYSTEM_PROMPT vs. skutečný vstup

| Očekává | buildUserPrompt posílá | buildAgentContext posílá | Stav |
|---------|------------------------|-------------------------|------|
| name, gender, age, height_cm, weight_kg | ✅ V input JSON | ✅ v body_metrics | OK |
| activity (sedavy\|stredne\|velmi) | ✅ bm.activity | ✅ body_metrics.activity | OK – body-metrics API normalizuje před insertem |
| stress (low\|medium\|high) | ✅ bm.stress_level | ✅ body_metrics.stress_level | OK |
| occupation (office_it\|manual\|teacher_sales) | ✅ bm.occupation | ✅ body_metrics.occupation | OK |
| goal (redukce\|nabirani_svaly\|udrzovani) | ✅ bm.goal | ✅ body_metrics.goal | OK |
| weekly_sessions (1\|3\|5) | ✅ weeklySessionsNum | ❌ ne v body_metrics přímo | OK – odvozeno z freq_choice |
| diet_type (standard\|vegetarian\|vegan) | ✅ | ✅ | OK |
| preferences | ✅ buildPreferencesForGpt | ✅ v body_metrics (dietary_restrictions, foods_to_avoid, notes) | OK |
| workout_days | ✅ workoutDaysBlock (text) | ✅ body_metrics.workout_days | OK |
| pinned meals | ✅ pinnedMeals z user_meal_pins | ❌ ne v context | OK – v promptu |
| progress_analysis | ❌ ne v promptu | ✅ v context | OK |
| shared_memory | ❌ ne v promptu | ✅ v context | OK |
| supporting_documents | ❌ ne v promptu | ✅ v context | OK |

### 2.2 Zjištění

- **Trainer dostává kompletní kontext** potřebný pro generování plánu.
- **Normalizace** (activity, stress, goal, occupation) probíhá v `body-metrics` API před uložením do DB.
- **workout_days** jsou v promptu jako text (workoutDaysBlock) i v context jako body_metrics.workout_days.

---

## 3. Rozdíly mezi dokumentací a implementací

### 3.1 docs/OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md

| Dokument říká | Skutečnost |
|---------------|------------|
| "Při generování plánu vždy využij File Search" | **Nepoužíváme** – runtime je OpenAI Responses API, file_search_runtime=false. Dokumenty jdou jako `supporting_documents` v contextu. |
| HTML struktura s <h4> pro dny | Validátor akceptuje <h3> i <h4> (`buildDayHeadingPattern`). Kód používá <h3>. |
| Cviky: "Bench press, Tlaky" | TRAINER_SYSTEM_PROMPT: "Tlaky na hrudník, Tlaky nad hlavu". Oba seznamy jsou kompatibilní. |

**Doporučení:** Aktualizovat dokumentaci – odstranit zmínku o File Search, uvést, že se používá Responses API s `supporting_documents` v contextu.

### 3.2 Jednotný zdroj pravdy

- **Kód:** `lib/assistantInstructions.js` je zdroj pravdy pro trainer.
- **Dokumentace:** `OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md` je určena pro ruční vložení do platform.openai.com – projekt ale používá Responses API, ne Assistants API. Dokument je tedy spíše referenční.

---

## 4. Coach asistent

### 4.1 Konfigurace

- **Prompt:** "Jsi Body & Mind ON kouč. Podporuj adherence, regeneraci, mindset. Negeneruj plán. Piš česky, vracej pouze platný JSON (message, coaching_plan)."
- **Model:** gpt-4.1-mini
- **Context:** Stejný jako trainer (trainer_coach branch) – body_metrics, shared_memory, progress_analysis.

### 4.2 json_object format

- Coach volá `runAgent` se `text: { format: { type: 'json_object' } }`.
- OpenAI vyžaduje slovo "json" v user message – v `runAgent` je to splněno přes `instructions: '... Vrat platny JSON (json_object format).'`.

---

## 5. Doporučení odborníků (syntéza)

### 5.1 AI architect (LLM orchestrace)

1. **Kontext je kompletní** – trainer dostává body_metrics, preferences, workout_days, supporting_documents, shared_memory.
2. **Struktura user message** – `request.prompt` + `context` + `instructions` je vhodná pro Responses API.
3. **Jedna zdrojová pravda** – prompty v kódu (`assistantInstructions.js`, `agentPromptsForSync.js`) jsou správný přístup; DB by měla sloužit jen pro feature flags.

### 5.2 Senior backend engineer

1. **Normalizace vstupů** – body-metrics API normalizuje před insertem; `loadLatestBodyMetrics` vrací již normalizovaná data. OK.
2. **workout_days** – ukládají se jako comma-separated string; `buildUserPrompt` je parsuje a převádí na názvy dnů. OK.
3. **Možné vylepšení:** Přidat `workout_days` do input JSON v `buildUserPrompt` pro explicitní soulad s promptem (nyní jen v workoutDaysBlock).

### 5.3 Expert na spolehlivost

1. **Fallback řetězec** – `buildDeterministicFallbackPlanHtml` → `getMinimalValidPlanHtml` → `persistFallbackPlanForUser` je správně navržen.
2. **Validace** – `validatePublishedPlanHtml` kontroluje core sekce a strukturu; trainer výstup musí projít před persistem.
3. **Diagnostika** – `_diagnostics` v body-metrics response umožňuje trace root cause.

### 5.4 Produktový manažer

1. **Hlavní hodnota** – trainer generuje jídelníček (7×3 jídla) + trénink (7 dní s „Trénink tento den“) + regenerace, suplementace, nákupní seznam, mindset. To odpovídá produktovému jádru.
2. **Kvalita promptu** – TRAINER_SYSTEM_PROMPT explicitně zakazuje „pouze Regenerace/Suplementace/Mindset bez Jídelníčku a Tréninku“ – správně.
3. **Riziko:** Když OpenAI vrací 429 (quota), AI plán nevznikne; fallback musí fungovat konzistentně.

---

## 6. Shrnutí: Řeší asistenti to, co mají?

| Asistent | Úkol | Dostává správný kontext? | Generuje očekávaný výstup? |
|----------|------|--------------------------|----------------------------|
| **Trainer** | Jídelníček + tréninkový plán (7 dní, 3 jídla, trénink u každého dne) | Ano – body_metrics, preferences, workout_days, supporting_documents, shared_memory | Ano – JSON s html, metrics; validátor kontroluje strukturu |
| **Coach** | Onboarding/motivační zpráva | Ano – stejný context jako trainer | Ano – JSON s message/coaching_plan |

**Závěr:** AI asistenti jsou uvnitř programu správně napojeni a mají k dispozici potřebná data. Problém s „nic v profilu, nic v e-mailu“ vznikal kvůli **OpenAI 429 (quota)** a případnému selhání fallback persistu, ne kvůli chybějícímu nebo špatnému kontextu pro asistenta.

---

## 7. Doporučené úpravy (nízká priorita)

1. **Dokumentace** – Upravit `OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md`: odstranit File Search, uvést Responses API + supporting_documents.
2. **workout_days v input JSON** – Volitelně přidat `workout_days` do input objektu v `buildUserPrompt` pro explicitní soulad s promptem (aktuálně jen v workoutDaysBlock).
3. **Synchronizace cviků** – Ověřit, že seznam cviků v `assistantInstructions.js` a `exerciseCanonicalMap` jsou v souladu.
