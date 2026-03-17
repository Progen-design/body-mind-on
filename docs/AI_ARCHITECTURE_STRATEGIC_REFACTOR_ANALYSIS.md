# Strategická refaktoringová analýza AI architektury – Body & Mind ON

**Datum:** 2025-03-10  
**Cíl:** Ověřit finální architekturu bez OpenAI Assistants UI a navrhnout čisté řešení pro produkční provoz.

---

## 1. Jak dnes architektura funguje

### 1.1 Tok volání (runtime)

```
ai_tasks (DB) → aiScheduler → executeAITask → [executeTrainerTask | executeCoachTask | …]
                                                      ↓
                                              runPlanPipeline / runAgent
                                                      ↓
getAgentConfig(slug) ────────────────────────────────┘
    │
    ├─ AGENT_PROMPTS[slug] z agentPromptsForSync.js (→ assistantInstructions.js pro trainer)
    ├─ AGENT_MODELS[slug]
    ├─ CONTEXT_PROFILE_SLUG[slug]
    └─ ai_agents.enabled (pouze flag – prompty z DB se NEPOUŽÍVAJÍ)

buildAgentContext(profileSlug, userId, input, agentSlug)
    │
    ├─ loadAgentDocumentsContext(agentSlug) → ai_supporting_documents (Supabase)
    ├─ body_metrics, ai_generated_plans, user_ai_memory, shared_memory, progress_analysis
    └─ runtime_capabilities (aiRuntimeCapabilities.js)

runAgent(agentSlug, { userId, input })
    │
    ├─ config = getAgentConfig(agentSlug)  // prompty z kódu
    ├─ context = buildAgentContext(...)
    ├─ userContent = { request, context, instructions, integration_rules }
    └─ openai.responses.create({ model, instructions: config.system_prompt, input: [userContent], text: { format: 'json_object' }, tools?: [web_search] })
```

### 1.2 Zdrojová pravda pro prompty

| Komponenta | Zdroj | Použití v runtime |
|------------|-------|-------------------|
| **System prompt** | `lib/assistantInstructions.js` (trainer), `lib/agentPromptsForSync.js` (ostatní) | ✅ `getAgentConfig` → `config.system_prompt` |
| **Model** | `agentPromptsForSync.js` → AGENT_MODELS | ✅ `getAgentConfig` → `config.model` |
| **ai_agents (DB)** | Tabulka Supabase | ❌ Pouze `enabled` – `system_prompt`, `model` z DB se **ignorují** |

### 1.3 Knowledge / dokumenty

| Zdroj | Tabulka | Použití |
|-------|---------|---------|
| **Supporting documents** | `ai_supporting_documents` | `loadAgentDocumentsContext('trainer')` → `context.supporting_documents` |
| **Kontext** | `body_metrics`, `ai_generated_plans`, `user_ai_memory`, `shared_memory` | `buildAgentContext` → `context.user_context` |

### 1.4 OpenAI Assistants UI

- **V kódu:** Žádné volání Assistants API, žádný `assistant_id`, žádný `threads` / `runs`.
- **Runtime:** Pouze `openai.responses.create()` – čisté Responses API.
- **Dokumentace:** `docs/OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md` stále odkazuje na „vlož do platform.openai.com“ – to je **referenční text**, ne součást runtime.

---

## 2. Co je správně

1. **Responses API jako jediný runtime** – žádná závislost na Assistants UI, threads ani runs.
2. **Prompty v kódu** – `assistantInstructions.js` + `agentPromptsForSync.js` jsou jedna zdrojová pravda; verzování přes git.
3. **Context pipeline** – `buildAgentContext` s `loadAgentDocumentsContext`; dokumenty z `ai_supporting_documents` jdou do contextu.
4. **Strukturovaný výstup** – `text: { format: 'json_object' }` zajišťuje stabilní parsování.
5. **Budget a cache** – `aiOps` (budget, cache) chrání před přetížením a zbytečnými voláními.
6. **Task-based flow** – `ai_tasks` → scheduler → executor; jasná separace odpovědností.

---

## 3. Co je ještě technický dluh

### 3.1 Rozpor: ai_agents vs. kód

- **Admin UI** (`/admin`) tvrdí: „Instrukce a nastavení se berou z tabulky ai_agents“.
- **Skutečnost:** `getAgentConfig` bere prompty z kódu; z `ai_agents` čte jen `enabled`.
- **Důsledek:** Úpravy v adminu (system_prompt, model) se **neprojeví** v runtime. Uživatel může být zmatený.

### 3.2 Sync script vs. runtime

- `scripts/sync-agent-prompts-from-code.mjs` zapisuje prompty z kódu do `ai_agents`.
- Runtime tyto hodnoty **nečte** – slouží jen pro zobrazení v adminu a případnou budoucí migraci.
- Duplicita: stejná data v kódu i v DB bez jednotného zdroje pravdy pro runtime.

### 3.3 loadAgentDocumentsContext jen pro trainer

- `loadAgentDocumentsContext('trainer')` vrací dokumenty; pro coach, validátory vrací `[]`.
- Pokud coach/validátoři mají mít vlastní dokumenty, pipeline to dnes nepodporuje.

### 3.4 ai_context_profiles není použit

- Migrace `20260315_ai_governance_db_first.sql` vytváří `ai_context_profiles`.
- `buildAgentContext` ji **nepoužívá** – používá hardcoded `resolveContextBranch(slug)`.
- Tabulka může v DB existovat, ale není součástí runtime.

### 3.5 Dokumentace odkazuje na OpenAI Assistants UI

- `OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md` – „vlož do platform.openai.com“.
- `OPENAI_ASSISTANT_TRENINK_INSTRUKCE.md` – odkaz na platformu.
- `NAVRHY_UPRAVY_KODU.md` – zmínka o OPENAI_ASSISTANT_ID.
- `OPENAI_TOK_DAT.md` – runs.create(assistant_id).
- Pro runtime jsou tyto dokumenty **irelevantní** – mohou mást.

---

## 4. Cílová architektura bez OpenAI Assistants UI

### 4.1 Principy

1. **Kód je zdrojová pravda** pro prompty a modely.
2. **Žádná závislost** na platform.openai.com / Assistants UI.
3. **Knowledge pipeline** plně v našem vlastním kódu (Supabase + `loadAgentDocumentsContext`).
4. **ai_agents** slouží jen pro: `enabled`, volitelně metadata (název, popis) pro admin.

### 4.2 Cílový diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BODY & MIND ON AI RUNTIME                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ZDROJOVÁ PRAVDA (kód)                                                   │
│  ├─ lib/assistantInstructions.js    → TRAINER_SYSTEM_PROMPT              │
│  ├─ lib/agentPromptsForSync.js      → AGENT_PROMPTS, AGENT_MODELS        │
│  └─ lib/aiRuntimeCapabilities.js    → runtime flags (web_search, …)    │
├─────────────────────────────────────────────────────────────────────────┤
│  CONTEXT PIPELINE                                                         │
│  ├─ buildAgentContext(profileSlug, userId, input)                        │
│  │   ├─ user_context: body_metrics, plans, memory, progress               │
│  │   └─ supporting_documents ← loadAgentDocumentsContext(agentSlug)      │
│  └─ loadAgentDocumentsContext → ai_supporting_documents (Supabase)       │
├─────────────────────────────────────────────────────────────────────────┤
│  RUNTIME                                                                  │
│  └─ runAgent(agentSlug, { userId, input })                                │
│      ├─ config = getAgentConfig(agentSlug)  // z kódu                    │
│      ├─ context = buildAgentContext(...)                                  │
│      └─ openai.responses.create({ instructions: config.system_prompt })  │
├─────────────────────────────────────────────────────────────────────────┤
│  DB (Supabase)                                                            │
│  ├─ ai_agents          → enabled (pouze), metadata pro admin              │
│  ├─ ai_supporting_documents → knowledge pro agenty                        │
│  ├─ ai_tasks           → fronta úkolů                                     │
│  └─ ai_logs            → diagnostika                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Role ai_agents v cílovém stavu

| Sloupec | Dnes | Cíl |
|---------|------|-----|
| `slug` | PK, identifikace | Beze změny |
| `enabled` | Pouze tento se čte v runtime | Beze změny |
| `name` | Pro admin | Beze změny |
| `model` | Zapisuje sync, runtime ignoruje | **Odstranit z runtime** nebo **použít z DB jako override** (volitelné) |
| `system_prompt` | Zapisuje sync, runtime ignoruje | **Deprecovat pro runtime** – zobrazovat v adminu jako „z kódu (read-only)“ |
| `temperature` | Stejně | Volitelně číst z DB jako override |

**Doporučení:** Zachovat `ai_agents` pro `enabled` a metadata. Sloupce `system_prompt`, `model` ponechat pro zobrazení v adminu (sync z kódu), ale **explicitně zdokumentovat**, že runtime bere prompty z kódu.

---

## 5. Konkrétní kroky

### Fáze A: Vyčištění dokumentace (nízké riziko)

1. **OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md** – Přidat úvod: „Tento dokument je referenční. Runtime používá Responses API a prompty z `lib/assistantInstructions.js`. Pro platform.openai.com Assistants UI již není určen.“
2. **OPENAI_ASSISTANT_TRENINK_INSTRUKCE.md** – Stejný disclaimer.
3. **NAVRHY_UPRAVY_KODU.md** – Odstranit/upravit zmínky o OPENAI_ASSISTANT_ID.
4. **SERVICES_A_WEBY_PROJEKTU.md** – Upravit sekci OpenAI: „Responses API, prompty v kódu. Assistants UI se nepoužívá.“

### Fáze B: Sjednocení ai_agents a adminu (střední riziko)

5. **Admin UI** – Upravit text: „Instrukce se berou z kódu (`lib/assistantInstructions.js`). Tabulka `ai_agents` slouží pro zapnutí/vypnutí agentů a zobrazení aktuálního stavu (sync z kódu).“
6. **Admin PATCH** – Buď zakázat editaci `system_prompt` a `model` (read-only), nebo přidat „Override z DB“ – pokud je v `ai_agents` vyplněn `system_prompt`, použít ho místo kódu. (Druhá varianta zvyšuje složitost.)

### Fáze C: Rozšíření knowledge pipeline (volitelné)

7. **loadAgentDocumentsContext** – Přidat podporu pro `coach`, `nutrition_validator`, `training_validator` (čtení z `ai_supporting_documents` podle `agent_slug`).
8. **ai_context_profiles** – Buď zapojit do `buildAgentContext` (DB-driven kontext), nebo odstranit z migrací a dokumentace, pokud se nepoužívá.

### Fáze D: Odstranění mrtvého kódu (nízké riziko)

9. **sync-agent-prompts-from-code.mjs** – Ponechat pro konzistenci DB s kódem (admin zobrazení), ale v README/komentáři uvést: „Sync slouží pro zobrazení v adminu. Runtime čte prompty z kódu.“

---

## 6. Co je safe udělat hned

| Akce | Riziko | Dopad |
|------|--------|-------|
| Přidat disclaimer do `OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md` | Žádné | Jasnost pro vývojáře |
| Upravit text v adminu o zdroji instrukcí | Žádné | Uživatel nebude očekávat, že editace v DB změní runtime |
| Přidat komentář do `getAgentConfig`: „Prompty vždy z kódu, ai_agents jen enabled“ | Žádné | Dokumentace v kódu |
| Vytvořit `docs/AI_RUNTIME_ARCHITECTURE.md` s aktuálním diagramem | Žádné | Jedna referenční stránka |

**Nedoporučeno hned bez testování:**

- Měnit `getAgentConfig` tak, aby bral `system_prompt` z DB – rozbije single source of truth.
- Odstraňovat `ai_agents.system_prompt` – admin by neměl co zobrazovat.
- Zapojovat `ai_context_profiles` bez důkladného testování – mění chování context pipeline.

---

## Shrnutí

| Oblast | Stav | Cíl |
|--------|------|-----|
| **OpenAI API** | ✅ Responses API pouze | Beze změny |
| **Prompty** | ✅ V kódu | Beze změny |
| **Context** | ✅ buildAgentContext + loadAgentDocumentsContext | Rozšířit dokumenty pro další agenty (volitelně) |
| **Knowledge** | ✅ ai_supporting_documents | Beze změny |
| **ai_agents** | ⚠️ Částečný rozpor (admin vs. runtime) | Sjednotit dokumentaci, admin zobrazuje „z kódu“ |
| **Dokumentace** | ⚠️ Odkazy na Assistants UI | Přidat disclaimer, upravit zastaralé odkazy |

**Závěr:** Současná architektura je pro produkci vhodná. Trenéři a validátoři běží výhradně přes vlastní runtime (Responses API + kód). OpenAI Assistants UI není součástí kritické logiky. Hlavní dluh je v dokumentaci a v nejasné roli `ai_agents` – ty lze vyřešit bez změny runtime logiky.
