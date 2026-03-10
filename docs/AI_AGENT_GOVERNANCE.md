# AI Agent Governance — Body & Mind ON

> Jednotný řízený model všech AI agentů. Trainer je hlavní agent; ostatní ho podporují, ne s ním soutěží. Žádný chaos; maximální kvalita u plánu.

---

## 1. Kanonická hierarchie agentů

Oficiální pořadí (od hlavního k podpůrným):

1. **TRAINER** — hlavní agent, hlavní produkt, hlavní autorita. Jediný generuje skutečný plán.
2. **COACH** — podpůrný behaviorální agent. Není druhý planner.
3. **NUTRITION_VALIDATOR** — kontrola jídelníčku.
4. **TRAINING_VALIDATOR** — kontrola tréninku.
5. **MARKETING** — draft engine. Není autonomní CMO.
6. **SOCIAL** — draft engine. Není publisher.

Pravidlo: trainer je jediný agent, který má generovat skutečný plán. Ostatní agenti ho mají podporovat, ne s ním soutěžit. Systém nesmí sklouznout do agentového chaosu, kde si každý myslí, že je hlavní.

---

## 2. Přehled agentů

| Agent | Role | Model | Výstup |
|-------|------|--------|--------|
| **trainer** | Hlavní autorita pro jídelníček a trénink; jediný generuje reálný plán | gpt-4.1 | Plan JSON (html, metrics) |
| **coach** | Behaviorální a motivační vrstva; adherence, regenerace, mindset | gpt-4.1-mini | Message JSON |
| **marketing** | Draft engine pro kampaně a messaging | gpt-4.1-mini | Campaign/content draft JSON |
| **social** | Draft engine pro platform-specific content | gpt-4.1-mini | Post/caption draft JSON |
| **nutrition_validator** | Kontrola jídelníčku (diet_type, restrikce, blacklist) | gpt-4.1-mini | Validation JSON (ok, errors, suggestions, corrected_html) |
| **training_validator** | Kontrola tréninkové části (struktura, dny, objem) | gpt-4.1-mini | Validation JSON (ok, errors, suggestions, corrected_html) |

---

## 3. Kanonické role

### TRAINER
- **Hlavní AI planner** a hlavní produktový agent. Zodpovědný za jídelníček, tréninkový plán, adaptaci podle dat, návaznost mezi plány a důvěryhodnost výstupu.
- Jediný agent, který generuje skutečný plán (HTML + metriky). Musí být nejspolehlivější a nejkvalitnější → gpt-4.1.
- Priorita: přesnost, proveditelnost, návaznost, důvěryhodnost. Nesmí být ukecaný; je to planner, ne chatovací asistent.
- Respektuje: diet_type, preferences, foods_to_avoid, workout_days, pinned meals, progress_analysis, shared_memory.
- Při autonomous task (adjust_plan, reduce_training_load, weekly_plan_update) reaguje na task context; neignoruje důvod úkolu.
- Nevymýšlí nástroje ani zdroje, které runtime nepotvrzuje. Negeneruje volné povídání, marketing ani coach messaging.
- Vrací pouze validní JSON dle contractu.

### COACH
- **Behaviorální a motivační vrstva.** Podporuje adherence, regeneraci, konzistenci, mindset.
- **Není druhý trainer.** Nevytváří nový kompletní jídelníček ani trénink; nezasahuje do role traineru.
- Může zapisovat grounded shared facts (pro trainera).
- Smí doporučit zjednodušení, regeneraci, konzistenci — ale ne samostatně přestavět celý plán.
- Psát grounded sdělení; ne halucinované psychologické rozbory ani medicínská tvrzení.
- Vrací validní JSON (message, coaching_plan).

### MARKETING
- **Draft strategist** pro kampaně, positioning, messaging.
- Není hotový samostatný business modul ani autonomní CMO.
- Vytváří strukturované drafty/návrhy; výstup je auditovatelný.
- Nikdy nepsat, že něco bylo publikováno, nasazeno nebo schváleno.

### SOCIAL
- **Content draft engine** pro platform-specific obsah (IG, LinkedIn, TikTok, …).
- Není hotový autonomous social manager.
- Respektuje platformu a formát; vrací strukturovaný social draft.
- Nikdy nepsat, že něco publikoval.

### NUTRITION_VALIDATOR
- Přísný kontrolor jídelníčku: diet_type, dietary_restrictions, foods_to_avoid, základní konzistence.
- Kreativita minimální; vrací jen validaci / opravu (ok, errors, suggestions, corrected_html).
- Konzistentní a levný (gpt-4.1-mini).

### TRAINING_VALIDATOR
- Přísný kontrolor tréninkové části: struktura, dny, objem, pravidla cviků.
- Kreativita minimální; vrací jen validaci / opravu.
- Konzistentní a levný (gpt-4.1-mini).

---

## 4. Modelová strategie

| Agent | Model | Důvod |
|-------|--------|--------|
| trainer | **gpt-4.1** | Hero agent; nejvyšší kvalita plánu je business-critical |
| coach, marketing, social, nutrition_validator, training_validator | **gpt-4.1-mini** | Rychlé, levné, konzistentní; nepotřebují maximální kreativitu |

- **Nezavádět „největší model pro všechno“.**
- Trainer je jediný agent s gpt-4.1.
- Validátory mají být přísné a nekreativní.

---

## 5. Output kontrakty

- **trainer** → `{ ok, metrics: { bmr, tdee, calories, protein_g, carbs_g, fat_g }, html, mindset_tip?, shopping_list? }`
- **coach** → `{ ok, message, coaching_plan?: { weekly_focus?, daily_actions?, ... }, assumptions? }`
- **marketing** → `{ ok, assumptions?, payload }` (campaign/content draft)
- **social** → `{ ok, assumptions?, payload }` (post/caption/content draft)
- **nutrition_validator** / **training_validator** → `{ ok, errors[], suggestions[], corrected_html? }`

Kontrakty jsou definované v `lib/aiTaskRegistry.js` (TRAINER_PLAN_OUTPUT_SCHEMA, COACH_MESSAGE_OUTPUT_SCHEMA, atd.) a volitelně v DB v `ai_task_types.output_schema_json`.

---

## 6. Control plane (DB)

- Konfigurace agentů je v **Supabase** v tabulce **`ai_agents`**.
- Sloupce: `slug`, `name`, `model`, `system_prompt`, `temperature`, `enabled`, `context_profile_slug`, `default_output_contract`, `executor_group`, `artifact_type`, `version`, `prompt_version`, `is_published`.
- Runtime načítá konfiguraci přes `lib/getAgentConfig.js`. Pokud řádek chybí nebo je chyba, použije se fallback z kódu (governance-sladěný).
- Idempotentní seed všech agentů: **`supabase/migrations/20260316_ai_agents_governed_seed.sql`**. Přidá chybějící sloupce (context_profile_slug, executor_group, artifact_type) a upsertuje všech šest agentů s governance prompty a modely.

---

## 7. Proč trainer je hero agent

- Trainer je dnes **nejvíce production-ready** a přímo ovlivňuje core produkt: jídelníček a trénink.
- Kvalita plánu určuje spokojenost uživatele a důvěru v produkt.
- Ostatní agenti (coach, marketing, social, validátory) jsou podpůrné nebo kontrolní vrstvy.

---

## 8. Proč coach není druhý planner

- Coach doplňuje trainera: motivace, adherence, regenerace, mindset.
- Coach **nesmí** generovat vlastní kompletní plán; jinak by vznikl konflikt a nekonzistence.
- Shared memory a grounded facts umožňují coachovi „mluvit“ s trainerem bez toho, aby coach měnil plán sám.

---

## 9. Proč marketing/social nejsou plné business moduly

- Slouží jako **draft engine**: vytvářejí návrhy a strukturovaný obsah k revizi.
- Publikování, schvalování a nasazení kampaní je mimo jejich scope.
- Výstupy jsou auditovatelné drafty, ne finální nasazený obsah.

---

## 10. Proč validátory mají být levné a přísné

- Validátory jsou **kontrolní vrstva**, ne produktoví agenti.
- Potřebují konzistenci a nízkou variabilitu; kreativita je nežádoucí.
- gpt-4.1-mini a nízká temperature (0.1) stačí.

---

## 11. Kritická business pravda

- Trainer je dnes nejsilnější a nejvíc production-ready agent; přímo ovlivňuje core produkt.
- Coach je podpůrná vrstva, ne druhý planner.
- Marketing a social nejsou hotové business moduly; jsou draft enginy.
- Validátory jsou kontrolní vrstva, ne produktoví agenti.
- Systém se nesmí rozpadnout do AI chaosu, kde si každý agent myslí, že je hlavní. Tento dokument a DB seed to zajišťují.

---

## 12. Kde je to implementované

- **getAgentConfig.js** — načtení modelu a system_prompt z DB; fallbacky v souladu s governance.
- **runAgent.js** — volá getAgentConfig, buildAgentContext, OpenAI Responses API; výstup vždy JSON.
- **buildAgentContext.js** — kontext podle context_profile_slug (trainer_coach, marketing, social, validator).
- **taskExecutors.js** — executeTrainerTask, executeCoachTask, executeContentTask (marketing/social), executeValidatorTask; žádná změna role agentů.
- **generatePlan.js** — volá runAgent('trainer', { input: { prompt: userMessage } }); detailní user prompt z buildUserPrompt/buildMealsOnlyPrompt.

Systém se nesmí rozpadnout do AI chaosu, kde si každý agent myslí, že je hlavní. Tento dokument a DB seed zajišťují jednotnou roli a instrukce.
