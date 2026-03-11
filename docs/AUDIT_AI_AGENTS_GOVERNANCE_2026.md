# Audit AI agentů a governance fix — Body & Mind ON (2026)

**Datum:** březen 2026  
**Rozsah:** Všechny agenty podle skutečného stavu repozitáře. Bezpečné governance opravy bez změny architektury.

---

## 1. Seznam všech nalezených agentů

| # | slug | role | model | context_profile_slug | executor_group | artifact_type | output contract |
|---|------|------|--------|----------------------|----------------|---------------|------------------|
| 1 | trainer | Hlavní planner (jediný generuje plán) | gpt-4.1 | trainer_coach | trainer_plan | plan | ok, metrics, html, mindset_tip?, shopping_list? |
| 2 | coach | Podpora adherence, regenerace, mindset | gpt-4.1-mini | trainer_coach | coach_message | message | ok, message, coaching_plan?, assumptions? |
| 3 | marketing | Draft engine pro kampaně | gpt-4.1-mini | marketing | content_draft | draft | ok, assumptions?, payload |
| 4 | social | Draft engine pro sociální sítě | gpt-4.1-mini | social | content_draft | draft | ok, assumptions?, payload |
| 5 | nutrition_validator | Kontrola jídelníčku | gpt-4.1-mini | validator | validator | validation | ok, errors[], suggestions[], corrected_html? |
| 6 | training_validator | Kontrola tréninku | gpt-4.1-mini | validator | validator | validation | ok, errors[], suggestions[], corrected_html? |

---

## 2. Status po agentovi

| Agent | Slug | Role | Model | Context profile | Executor group | Output contract | Status |
|-------|------|------|--------|-----------------|----------------|-----------------|--------|
| trainer | trainer | Hlavní planner | gpt-4.1 | trainer_coach | trainer_plan | plan JSON (html, metrics) | **OK** |
| coach | coach | Podpůrný kouč | gpt-4.1-mini | trainer_coach | coach_message | message JSON | **OK** |
| marketing | marketing | Draft engine | gpt-4.1-mini | marketing | content_draft | draft JSON | **OK** |
| social | social | Draft engine | gpt-4.1-mini | social | content_draft | draft JSON | **OK** |
| nutrition_validator | nutrition_validator | Validátor jídelníčku | gpt-4.1-mini | validator | validator | validation JSON | **OK** |
| training_validator | training_validator | Validátor tréninku | gpt-4.1-mini | validator | validator | validation JSON | **OK** |

Všech šest agentů je v docs, v SQL seedu (20260316), ve fallback configu (getAgentConfig.js), v aiTaskRegistry a v taskExecutors. Modely, prompty a context profily jsou sjednocené.

---

## 3. Nalezené rozporů (minimální)

- **Prázdný system_prompt z DB:** Pokud by `ai_agents.system_prompt` bylo prázdné nebo null, runtime by poslal prázdné instrukce do OpenAI. **Oprava:** V `normalizeAgentConfig` se při prázdném promptu použije governance fallback prompt.
- **Dokumentace executorů:** V docs bylo „executeContentTask (marketing/social)“ bez uvedení, že v kódu existují `executeMarketingTask` a `executeSocialTask`. **Oprava:** Upřesněno na „executeMarketingTask / executeSocialTask (oba delegují na executeContentTask)“.
- **Vysvětlení routing vs. executor_group:** V docs nebylo explicitně, že routing v taskExecutors jde přes `side_effect_type` a `ai_executor_bindings`, ne přes `ai_agents.executor_group`. **Oprava:** Do sekce 6 (Control plane) doplněna věta o tom.

Žádné další rozpory mezi docs, seedem, fallbackem a runtime logikou.

---

## 4. Provedené opravy

| # | Oprava | Soubor |
|---|--------|--------|
| 1 | Při prázdném nebo null `system_prompt` z DB se použije governance fallback prompt (nikdy prázdné instrukce do OpenAI). | lib/getAgentConfig.js |
| 2 | V dokumentaci upřesněno: executeMarketingTask / executeSocialTask (oba delegují na executeContentTask). | docs/AI_AGENT_GOVERNANCE.md |
| 3 | Doplněno: při prázdném promptu z DB se použije fallback; routing v taskExecutors používá side_effect_type a ai_executor_bindings, executor_group/artifact_type v ai_agents jsou pro konzistenci a audit. | docs/AI_AGENT_GOVERNANCE.md |

---

## 5. Upravené soubory

- `lib/getAgentConfig.js` — normalizeAgentConfig: fallback system_prompt když DB vrátí prázdný/null prompt.
- `docs/AI_AGENT_GOVERNANCE.md` — sekce 6 (control plane) a sekce 12 (kde je to implementované).

---

## 6. Nové soubory

- `docs/AUDIT_AI_AGENTS_GOVERNANCE_2026.md` — tento audit a výstup.

---

## 7. SQL změny

**Žádné.** Seed `20260316_ai_agents_governed_seed.sql` je v souladu s governance; všech šest agentů má správné model, system_prompt, context_profile_slug, executor_group, artifact_type. Migrace se neměnila.

---

## 8. Trainer je jediný hlavní planner

**Ano.**

- `generatePlan.js` volá pouze `runAgent('trainer', { input: { prompt: userMessage } })`.
- Žádný jiný soubor nevolá `runAgent('trainer', …)` pro generování plánu v konkurenci s generatePlan.
- taskExecutors: `executeTrainerTask` je jediný executor, který zapisuje plán do `ai_generated_plans` a volá `sendPlanEmail`.
- Docs i seed výslovně uvádějí, že trainer je jediný agent generující skutečný plán; coach negeneruje plán, marketing/social jsou draft enginy, validátoři jen kontrolují.

---

## 9. Ostatní agenti jsou správně omezeni

**Ano.**

- **Coach:** System prompt (DB i fallback): „ne planner“, „nepřepisuj celý plán“, „Vrať pouze platný JSON: message, volitelně coaching_plan“. Executor ukládá pouze zprávy (ai_messages), ne plán.
- **Marketing / Social:** System prompt: „draft engine“, „nejsi autonomní CMO / publisher“, „Nikdy nepiš, že něco bylo publikováno“. Executor ukládá do ai_content_drafts se status draft.
- **Nutrition / Training validator:** System prompt: „přísný validátor“, „Minimalizuj kreativitu“, temperature 0.1. Výstup pouze ok, errors, suggestions, corrected_html.

---

## 10. Planner flow a task executor architektura zůstaly kompatibilní

**Ano.**

- `runAgent` — beze změn.
- `generatePlan` — beze změn.
- `buildAgentContext` — beze změn.
- `taskExecutors` — beze změn (executeAITask, resolveExecutorSlug, executeTrainerTask, executeCoachTask, executeContentTask, executeValidatorTask).
- Scheduler, event pipeline, email flow, enrichment — beze změn.

Změněna byla pouze vrstva konfigurace: když DB vrátí prázdný system_prompt, použije se fallback prompt. Dokumentace byla upřesněna.

---

## Shrnutí

- **Agenti:** Všech 6 (trainer, coach, marketing, social, nutrition_validator, training_validator) je konzistentně v docs, DB seedu, getAgentConfig fallbacku, aiTaskRegistry a taskExecutors.
- **Trainer:** Jediný hlavní planner; flow není rozbité.
- **Governance:** Opravy byly malé a bezpečné (prázdný prompt guard, upřesnění docs). Žádný redesign, žádná změna architektury.
