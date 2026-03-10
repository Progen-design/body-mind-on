# Shrnutí refaktoru AI architektury (DB-first, AI-governed)

## Co bylo provedeno

### 1. Analýza a dokumentace
- **docs/AI_ARCHITECTURE_REFACTOR_ANALYSIS.md** – současný stav, legacy flow, co je DB vs hardcoded, cílová architektura.
- **docs/CORE_FLOW_REGISTRACE_AI_PLAN.md** – již existoval; core flow registrace → AI plán zůstal nedotčen.

### 2. SQL migrace (20260315_ai_governance_db_first.sql)
- **ai_agents:** rozšíření o `context_profile_slug`, `default_output_contract`, `executor_group`, `artifact_type`, `is_published` (sloupce version/prompt_version z předchozí migrace).
- **ai_task_types:** definice typů úloh (agent_slug, task_type, side_effect_type, output_schema_json, …), seed pro trainer, coach, marketing, social, nutrition_validator, training_validator.
- **ai_trigger_rules:** pravidla kdy vytvořit jaký task (trigger_type, trigger_value, agent_slug, task_type, priority), seed pro missing_plan, user_registered, weight_stagnation, low_adherence, high_stress, progress_good.
- **ai_context_profiles:** slug, sources_json, include_progress/checkins/plans/memory, seed trainer_coach, marketing, social, validator.
- **ai_executor_bindings:** side_effect_type → executor_slug, artifact_table, artifact_kind.
- **ai_agent_versions:** historie verzí agentů (volitelné).
- **ai_tasks:** nové sloupce `idempotency_key`, `source_event_id`, `processing_started_at`, `artifact_id`.
- Seed agentů **nutrition_validator** a **training_validator**.

### 3. getAgentConfig.js
- **Production:** při chybě nebo chybějícím záznamu v DB vrací konfiguraci s **enabled: false** (žádný permissive fallback).
- **Development:** fallback s enabled: true, aby agenti fungovali před migrací.
- Čte pouze sloupce, které existují v základní migraci (slug, name, model, system_prompt, temperature, enabled); context_profile_slug se odvozuje z agent slug v kódu (kompatibilita bez nových sloupců).

### 4. aiOps.js
- **buildAgentCacheKey:** přidány parametry `taskType` a `contractVersion`, aby změna task typu nebo kontraktu invalidovala cache.

### 5. runAgent.js
- Volá **buildAgentContext(config.context_profile_slug || agentSlug, …)** a předává **taskType** a **contractVersion** do cache key.
- Podpora parametrů **taskType** a **contractVersion** z volajícího.

### 6. buildAgentContext.js
- První parametr může být **context_profile_slug** (z DB) nebo agent slug.
- Přidána větev **validator** pro nutrition_validator a training_validator (body_metrics + plán k validaci).
- **resolveContextBranch** sjednocuje trainer_coach, marketing, social, validator.

### 7. aiTaskRegistry.js
- **getTaskSpecFromDb(agentSlug, taskType)** – načtení z `ai_task_types`.
- **getTaskSpecAsync** / **getTaskSchemaHintAsync** – DB first, pak JS fallback.
- Sync **getTaskSpec** a **getTaskSchemaHint** zachovány pro zpětnou kompatibilitu.
- Přidány typy pro **nutrition_validator** a **training_validator** (validate_plan).

### 8. aiDecisionEngine.js
- **loadTriggerRules()** – načtení pravidel z **ai_trigger_rules**.
- Když jsou v DB pravidla, rozhodnutí se staví z nich (ruleMatches podle trigger_type a trigger_value).
- Když tabulka chybí nebo je prázdná, použijí se **hardcoded** pravidla (původní chování).
- Zachován stejný výstup (userId, goal, has_plan, progress_analysis, decisions).

### 9. aiTaskExecutors.js
- Použití **getTaskSchemaHintAsync** a **getTaskSpecAsync** místo sync verzí.
- **resolveExecutorSlug(agentSlug, side_effect_type)** – volitelně z **ai_executor_bindings**, jinak legacy mapping.
- Nový **executeValidatorTask** pro nutrition_validator a training_validator (vrací validation_result).
- Do **runAgent** se předává **taskType** v options.

### 10. aiScheduler.js
- Při claimu tasku se nastavuje **processing_started_at** (s fallbackem, pokud sloupec neexistuje).
- **recoverStaleProcessingTasks()** – na začátku běhu scheduleru reset tasků ve stavu `processing` starších než AI_TASK_PROCESSING_STALE_MINUTES (default 15) zpět na `pending`.

### 11. profile-preferences.js
- Přidán komentář, že přegenerování plánu je orchestration-compatible a že v budoucnu lze použít event + task adjust_plan.
- Chování beze změny: stále volá **generatePlanForEmail** po uložení preferencí.

## Co nebylo měněno (core flow)

- **pages/api/body-metrics.js** – pořadí: insert body_metrics → createInitialAITasks → enqueueAIEvent → triggerImmediateDecision → runAIScheduler.
- **lib/createInitialAITasks.js** – vytváří trainer/initial_plan a coach/onboarding_message.
- **lib/aiTaskExecutors.executeTrainerTask** – generatePlan → persistTrainerPlan → sendPlanEmail; plán se ukládá do **ai_generated_plans**.
- **pages/api/profile.js** – vrací **plans** z ai_generated_plans.
- Zobrazení plánu na **profil.js** z **profile.plans** a **currentPlan.plan_html**.

## Validátory a pipeline

- **nutrition_validator** a **training_validator** jsou v DB (ai_agents, ai_task_types) a mají executor **executeValidatorTask**.
- **Publish jde až po validaci:** v **executeTrainerTask** se po **generatePlan()** volá **runPlanValidators()** (nutrition_validator a training_validator, pokud jsou v DB a enabled). Do **persistTrainerPlan** jde až výsledek této validace (případně corrected_html z validátorů). Pokud validátory neprojdou, plán se stejně publikuje (s **validation_warning** v result), aby nevznikl stav „registrace hotová, plán nikde“.

## Definition of Done – stav

- Registrace stále vede k reálnému AI plánu (body_metrics → createInitialAITasks → scheduler → executeTrainerTask → generatePlan → runPlanValidators → persistTrainerPlan → sendPlanEmail).
- Plán se ukládá do **ai_generated_plans** a je dostupný v profilu.
- **getAgentConfig** v production nespustí agenta bez platného záznamu v DB (enabled: false při chybě/chybějícím záznamu).
- Task typy a trigger rules jsou v DB (ai_task_types, ai_trigger_rules) s JS fallbackem.
- **nutrition_validator** a **training_validator** existují v DB a v executoru; validace proběhne před publish (při selhání validace se plán stejně publikuje s validation_warning).
- Systém nevytváří stav „registrace hotová, plán nikde“ – plán se vždy uloží po kroku validace.
- Migrace **20260315** seeduje i **trainer** a **coach** (on conflict do update), takže core flow funguje i při použití pouze této migrace.
