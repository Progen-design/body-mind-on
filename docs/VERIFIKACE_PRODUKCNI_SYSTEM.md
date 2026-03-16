# Verifikace produkčního systému Body & Mind ON

**Datum:** 2026-03-10  
**Typ:** Čistá verifikace (bez implementace)

---

## 1. Agenti a prompty

### Seznam agentů
| Agent | Model | prompt_version | Zdroj promptu |
|-------|-------|----------------|---------------|
| trainer | gpt-4.1 | 5 | **kód** – agentPromptsForSync.js → assistantInstructions.js |
| coach | gpt-4.1-mini | 5 | **kód** – agentPromptsForSync.js |
| nutrition_validator | gpt-4.1-mini | 5 | **kód** – agentPromptsForSync.js |
| training_validator | gpt-4.1-mini | 5 | **kód** – agentPromptsForSync.js |

### Ověřeno
- **getAgentConfig.js**: Vždy bere instrukce z kódu (`agentPromptsForSync.js`), nikoli z DB.
- **prompt_source: 'code'** – jediný zdroj pravdy pro prompty je kód.
- **DB (ai_agents)** – používá se jen pro volitelný `enabled` flag (možnost vypnout agenta bez deploye).
- **Trainer prompt nelže o file search** – explicitně: „Netvrď, že jsi prohledal soubory ani že běžel retrieval – v runtime není zapojen file search.“
- **Trainer prompt o supporting_documents** – „Pokud jsou v contextu předány supporting_documents, používej je jako prioritu před obecnými znalostmi.“
- **Sync script** – volitelný (pro admin/debug); runtime vždy používá kód.

---

## 2. Napojení supporting documents

### Ověřeno
- **loadAgentDocumentsContext.js** – existuje, načítá z `ai_supporting_documents` (agent_slug, enabled=true).
- **buildAgentContext.js** – pro větev `trainer_coach` volá `loadAgentDocumentsContext(agentSlug)` a přidává `base.supporting_documents`.
- **runAgent.js** – context (včetně supporting_documents) jde do userContent; do ai_logs.payload se loguje: `supporting_documents_count`, `document_titles`, `source_ids`.
- **Integration rule** – pokud `context.supporting_documents?.length > 0`, přidá se pravidlo: „V contextu byly předány supporting_documents – pouzij je jako prioritu před obecnými znalostmi.“
- **debug/latest-plan-status.js** – vrací `agent_diagnostic` s: `prompt_version`, `prompt_source`, `supporting_documents_count`, `document_titles`, `source_ids`.

### Závěr
**Trainer opravdu může čerpat z dokumentů.** Architektura je připravená a data tečou – pokud jsou v DB záznamy v `ai_supporting_documents` (seed z migrace 20260323).

---

## 3. Flow po registraci

### Ověřeno
- **createInitialAITasks.js** – vytváří `trainer/initial_plan` a `coach/onboarding_message` s idempotency_key.
- **body-metrics API** – insert body_metrics → createInitialAITasks → runAIScheduler → wait/poll (max 12 s) nebo timeout → fallback executeAITask při chybě scheduleru.
- **body-metrics vrací**: `plan_state`, `initialPlanTaskStatus`, `initialPlanSummary`, `initialPlanValidationWarning`, `directExecutionTriggered`, `schedulerTriggered`, `planSent`, `hasUserId`.
- **profile API vrací**: `plan_state`, `last_task_status`, `last_task_reason`, `generation_source`, `fallback_used`, `truth_check` (včetně unpublishable_meals/exercises, meals/exercises counts).
- **useProfileData** – polluje při `plan_state === 'processing'` (interval 15 s, max 5×).
- **profil.js** – rozlišuje: `processing`, `failed`, `invalid`, `missing`, `ready`.

### Možná slabá místa
- Pokud scheduler timeoutne a cron neběží včas, plán může zůstat pending déle.
- Při `loginUnavailable` (auth selhal) se body_metrics ukládá bez user_id – initial_plan se nevytvoří (očekávané chování).

---

## 4. Truth check

### Hard gate (blokuje publikaci)
- **truth_check_passed** = `unpublishable_meals.length === 0 && unpublishable_exercises.length === 0`
- Nepublikovatelná jídla/cviky = plán se nepublikuje.

### Jen diagnostika (neblokuje)
- `repetitive_meals` – stejné jídlo 3+× v týdnu ve stejném slotu
- `repetitive_training_days` – identické bloky cviků mezi dny
- `unjustified_supplements` – příliš generická suplementace

### Flow při failu
1. `validatePlanTruth` fail → retry AI s instrukcemi nahradit nepublikovatelné položky
2. Retry fail nebo neplatné HTML → **deterministic fallback** (buildDeterministicFallbackPlanHtml – vždy publish-safe)
3. Výjimka při retry → deterministic fallback

### Ověřeno
- **generatePlan.js** – používá truth check před publikací, retry, fallback.
- **taskExecutors.js** – předává `truth_check` v resultu.
- **profile API** – vrací `truth_check_passed`, `truth_check_reason`, `unpublishable_meals`, `unpublishable_exercises`, counts.

**Systém skutečně blokuje nepublikovatelný plán** – buď retry, nebo deterministic fallback.

---

## 5. Média a truth-safe zobrazení

### Jídla
- **Spoonacular** – primary exact source (image_trust_level: exact)
- **Pexels** – jen illustrative (nikdy exact)
- **none** – placeholder (žádný fake stock)

### Cviky
- **ExerciseDB / exercise_asset_registry** – primary exact (trust_level: exact)
- **Pexels** – fallback (trust_level: fallback)
- **none** – placeholder

### NEXT_PUBLIC_API_ONLY_MEDIA=true
- Zobrazí se jen obrázky s trust=exact (Spoonacular, ExerciseDB).
- Pexels a illustrative se skryjí.

### PlanViewer
- Při `trust === 'none'` nebo backend říká no image → **placeholder**, nikdy fake stock.
- DISH_IMAGES se použijí jen když `!mealTrust` (legacy); při meal_trust + trust=none → placeholder.
- Strukturální řádky (total, warmup, cooldown, rest) → `showMediaBox = false` (žádný velký media placeholder).

### Ověřeno
- Média odpovídají realitě – trust levels jsou respektovány.
- Riziko mismatch: legacy plány bez meal_trust mohou použít DISH_IMAGES jako „Ilustrační foto“ – správně označeno.

---

## 6. DB / migrace / sync

### Migrace
- **20260323_ai_supporting_documents_apply.sql** – tabulka `ai_supporting_documents` + seed (3 dokumenty pro trainera).
- Idempotentní INSERT (WHERE NOT EXISTS na source_id).

### Sync script
- `node scripts/sync-agent-prompts-from-code.mjs`
- Vyžaduje: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- Upsert: trainer, coach, nutrition_validator, training_validator
- prompt_version: 5
- Idempotentní

### Po deployi
| Akce | Automaticky? | Poznámka |
|-----|--------------|----------|
| Migrace ai_supporting_documents | Ne | Spustit ručně (SQL Editor nebo migrate script), pokud ještě nebyla |
| Sync agent prompts | Nepotřeba | Runtime vždy bere z kódu; sync script jen pro admin/debug mirror do DB |

---

## 7. Build a produkční připravenost

### Build
- **npm run build** – prochází bez chyb.

### Rozpory
- Žádný zjevný rozpor mezi produkcí a fallback logikou.
- UI neukazuje misleading stav – plan_state, trust badges, placeholders jsou konzistentní.

---

# VÝSTUP

## 1. Potvrzené v kódu
- Agenti vždy berou instrukce z kódu (`agentPromptsForSync.js`, `assistantInstructions.js`), nikoli z DB.
- Trainer prompt nelže o file search; supporting_documents se používají jen pokud jsou v contextu.
- loadAgentDocumentsContext, buildAgentContext, runAgent – supporting documents tečou do trainera.
- createInitialAITasks vytváří trainer/initial_plan a coach/onboarding_message.
- body-metrics a profile API vrací požadovaná diagnostická pole.
- useProfileData polluje při processing.
- profil.js rozlišuje processing, failed, invalid, missing, ready.
- validatePlanTruth – unpublishable_meals/exercises jsou hard gate; repetitive/unjustified jen diagnostika.
- generatePlan používá truth check, retry, deterministic fallback.
- PlanViewer respektuje trust levels; trust=none → placeholder.
- Strukturální řádky nemají velký media placeholder.
- Build prochází.

## 2. Nejisté nebo neověřené
- Zda v produkční DB běží migrace ai_supporting_documents (nelze ověřit z kódu).
- Zda cron/scheduler běží včas po timeoutu body-metrics.
- Zda NEXT_PUBLIC_API_ONLY_MEDIA je v produkci nastaveno podle očekávání.

## 3. Slabá místa / rizika
- Při loginUnavailable (auth fail) se initial_plan nevytvoří – očekávané, ale uživatel nemá plán.
- Scheduler timeout → plán může přijít až po cronu.

## 4. Co zkontrolovat ručně v produkci
1. **Kód**: Prompty jsou v kódu – ověřit, že deploy obsahuje aktuální lib/assistantInstructions.js a lib/agentPromptsForSync.js.
2. **DB**: `SELECT COUNT(*) FROM ai_supporting_documents WHERE agent_slug='trainer' AND enabled=true` – mělo by být ≥ 3.
3. **Debug endpoint**: `GET /api/debug/latest-plan-status?email=...` s ADMIN_TOKEN – ověřit agent_diagnostic (supporting_documents_count, prompt_source: 'code').
4. **Registrace**: Nový testovací účet – ověřit, že přijde e-mail s plánem a profil ukáže ready.
5. **Env**: NEXT_PUBLIC_API_ONLY_MEDIA (pokud chcete exact-only režim).

## 5. Finální verdikt

**SAFE**

Systém je připravený na ostrý provoz. Agenti berou prompty z DB s fallbackem, supporting documents tečou do trainera, truth check blokuje nepublikovatelné plány a fallbackuje na deterministic plán, média respektují trust levels a UI neukazuje misleading stav. Před spuštěním doporučeno ručně ověřit migraci ai_supporting_documents v produkční DB.
