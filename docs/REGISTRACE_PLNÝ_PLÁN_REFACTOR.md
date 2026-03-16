# Registrační flow a plný plán – refaktor

## 1. Root cause

**Kde přesně se registrační flow rozbíjelo:**

1. **Profile API vracel „missing“ i když task běžel**  
   Kontroloval se jen `initial_plan` task se statusem `pending`. Když scheduler task převzal a nastavil status `processing`, profil už task jako „běžící“ neviděl a mohl vrátit `plan_state = 'missing'` nebo špatný stav. Uživatel pak viděl „Plán zatím nebyl vytvořen“ i při běžící pipeline.

2. **Stav „missing“ i po dokončeném tasku**  
   Když task měl status `completed` ale v odpovědi nebyly ještě plány (teoretický okraj), nebo když byl completed bez validního plánu, profil mohl vrátit `missing` místo `invalid`.

3. **Slabá minimální délka plánu**  
   Validace akceptovala plán už od 1000 znaků, takže mohly projít i velmi krátké / generické výstupy.

4. **Chybějící diagnostika**  
   V profilu chyběly `initialPlanTaskStatus`, `saved_plan_exists`, `rendered_plan_exists`, takže nebylo na první pohled jasné, co se reálně stalo.

## 2. Co bylo špatně v generování po registraci

- **Stav „processing“** se v profilu nebral v potaz – pouze `pending`. Během běhu scheduleru je task v `processing`, takže profil nesprávně vyhodnotil stav.
- **Deterministic fallback** byl už nastavený tak, aby dával plný 7denní plán (3 jídla, Trénink tento den, sekce navíc) – tady se nic neměnilo.
- **Retry a truth gate** (hard/soft) v `generatePlan.js` už byly – problém byl hlavně ve stavu v profilu a v minimální délce plánu.

## 3. Co se změnilo

### body-metrics
- Beze změn. Po registraci se dál volá `createInitialAITasks`, pak direct execute nebo scheduler, v odpovědi je `plan_state`, `initialPlanTaskStatus` atd.

### ai task flow
- Beze změn. `createInitialAITasks` vytváří trainer/initial_plan a coach/onboarding_message. Scheduler nebo direct execute je spouští.

### orchestrator
- Beze změn. `runPlanPipeline` volá `generatePlan`.

### generatePlan
- Beze změn v logice. Prompt a retry/fallback už vyžadují plný plán.

### validators
- **validatePlanHtml.js**: Minimální délka platného HTML plánu zvýšena z 1000 na **3500** znaků, aby neprošly příliš krátké výstupy.

### profile API
- **plan_state „processing“**:  
  `initialPlanPending` je nyní `status === 'pending' || status === 'processing'`, takže i běžící task se bere jako „plán se dokončuje“.
- **plan_state když task completed ale plán chybí**:  
  Přidána věta `else if (initialPlanCompleted) plan_state = 'invalid'`, takže uživatel nevidí „Plán zatím nebyl vytvořen“, ale stav odpovídající neplatnému/neúplnému výsledku.
- **Diagnostika**:  
  Do `_diagnostics` doplněno: `initialPlanTaskStatus`, `saved_plan_exists`, `rendered_plan_exists`.

### frontend profil
- Beze změn. `useProfileData` už při `plan_state === 'processing'` polluje každé 3 s (max 40×). Po změně na backendu dostane správně `processing` i při běžícím tasku a po dokončení přepne na `ready` a zobrazí plán.

## 4. Proč teď po registraci vznikne plný plán

1. **Task se vždy vytvoří** – `createInitialAITasks` v body-metrics vytvoří trainer/initial_plan (a coach/onboarding_message).
2. **Task se spustí** – buď direct execute v body-metrics, nebo scheduler; při běhu je task `processing`, profil to správně vyhodnotí.
3. **Generování je plné** – prompt (buildUserPrompt + TRAINER_SYSTEM_PROMPT) vyžaduje 7 dní, 3 jídla denně, „Trénink tento den“ u každého dne, makra, suplementaci, regeneraci, mindset, nákupní seznam. Validace (včetně struktury 7 dní a bloků) a minimální délka 3500 znaků odmítnou slabý výstup.
4. **Retry a fallback** – při neplatném výstupu 1× retry s důvodem, pak deterministic fallback, který je sám plný (MEAL_ROTATION, TRAINING_BLOCKS, všechny sekce).
5. **Persist** – do DB se ukládá až plán prošlý `validatePublishedPlanHtml` (včetně délky a struktury).
6. **Profil** – vrací `ready` jen při validním plánu; při běžícím tasku `processing` a frontend polluje, dokud není `ready` nebo `failed`/`invalid`.

## 5. Jak to otestovat krok za krokem

1. **Registrace s účtem**  
   - Odeslat POST na `/api/body-metrics` s platným e-mailem, heslem, výška/váha, cílem, tréninkovými dny.  
   - Očekávání: `plan_state` v odpovědi je `ready` (pokud stihne generování), nebo `processing` (při timeoutu). Při `processing` by neměl uživatel vidět „Plán zatím nebyl vytvořen“.

2. **Profil po registraci**  
   - Přihlásit se a otevřít `/profil`.  
   - Pokud plán ještě běží: zobrazí se „Plán se dokončuje – automaticky se obnoví“ a během cca 2 minut by se měl plán sám objevit (poll každé 3 s).  
   - Po dokončení: v sekci „Můj plán“ je 7 dní, jídelníček (Snídaně/Oběd/Večeře) a u každého dne blok „Trénink tento den“.

3. **Diagnostika**  
   - V odpovědi GET `/api/profile` v `_diagnostics` zkontrolovat:  
     `plan_state`, `initialPlanTaskStatus`, `saved_plan_exists`, `rendered_plan_exists`, `last_task_status`, `generation_source`, `final_html_length`.

4. **Debug endpoint**  
   - GET `/api/debug/latest-plan-status?email=...` s ADMIN_TOKEN – ověřit, že po registraci je task completed a že result obsahuje `plan_id`, `html_length`, `generation_source`.

5. **Build**  
   - `npm run build` musí projít.

## 6. Je to safe pustit na main?

**Ano.**

- **Profile API**: Rozšíření podmínky pro `processing` a přidání `initialPlanCompleted` a diagnostiky jsou zpětně kompatibilní; klienti jen dostanou přesnější stav a víc polí v `_diagnostics`.
- **validatePlanHtml**: Zvýšení minimální délky z 1000 na 3500 znaků jen více filtruje slabé výstupy; deterministic fallback je dostatečně dlouhý a dál projde.
- Žádné změny v body-metrics flow, createInitialAITasks, scheduleru ani v executeTrainerTask – jen oprava vyhodnocení stavu a diagnostika.
