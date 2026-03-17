# Jak má fungovat registrace, plán a e-mail – Body & Mind ON

**Cílový flow a požadavky na kvalitu.**

---

## 1. Po registraci: aktivace AI asistenta a dalších dle potřeby

### Jak to má fungovat

1. **Registrace** (body-metrics API) → uložení `body_metrics` + vytvoření uživatele
2. **Aktivace AI asistenta** → vytvoření tasků v `ai_tasks`:
   - `trainer / initial_plan` – první plán (jídelníček + trénink)
   - `coach / onboarding_message` – uvítací zpráva
3. **Další asistenti dle potřeby** – scheduler spouští další tasky podle rozhodovací logiky (např. `adjust_plan`, `weekly_plan_update`, `recovery_message`)

### Jak to dnes funguje

| Krok | Implementace |
|------|--------------|
| Registrace | `pages/api/body-metrics.js` → insert `body_metrics` |
| Vytvoření tasků | `createInitialAITasks(userId)` → insert `trainer/initial_plan`, `coach/onboarding_message` |
| Spuštění | `runAIScheduler` / `triggerImmediateDecision` → `executeAITask` |
| Další tasky | `aiDecisionEngine`, `createAITasksFromDecisions` – podle progress, stresu, adherence |

---

## 2. Vygenerovat plán: jídelníček + cviky na týden

### Jak to má fungovat

- **Jídelníček:** 7 dní × 3 jídla = 21 konkrétních jídel
- **Trénink:** 7 dní, u každého dne blok „Trénink tento den“ (cviky nebo Odpočinek/Lehká procházka)
- Plán musí být **ověřený** – jídla i cviky musí odpovídat povoleným zdrojům

### Jak to dnes funguje

| Komponenta | Implementace |
|------------|--------------|
| Generování | `runPlanPipeline` → `generatePlan` → `runAgent('trainer')` |
| Struktura | `buildUserPrompt` – VSTUP JSON, pořadí dnů, workout_days, pinned meals |
| Validace struktury | `validatePublishedPlanHtml` – Jídelníček, Trénink, 7 dní, Snídaně/Oběd/Večeře, „Trénink tento den“ |
| Truth check | `validatePlanTruth` – publish-safe jídla a cviky |
| Fallback | `buildDeterministicFallbackPlanHtml` / `getMinimalValidPlanHtml` při selhání AI |

---

## 3. Poslat plán do e-mailu

### Jak to má fungovat

- Po úspěšném vygenerování a uložení plánu → odeslat e-mail s plánem
- E-mail musí obsahovat jídelníček i trénink

### Jak to dnes funguje

| Krok | Implementace |
|------|--------------|
| Persist | `persistTrainerPlan` → insert do `ai_generated_plans` |
| E-mail | `sendPlanEmail(bm.email, planHtml, options)` v `executeTrainerTask` |
| Podmínka | `task_type === 'initial_plan' && bm?.email && finalGenerated?.html` |

---

## 4. Kvalita: ověřená jídla a cviky, žádné opakování

### Požadavky

1. **Všechna jídla a cviky ověřené** – mapovatelné na Spoonacular (jídla) a canonical seznam (cviky)
2. **Žádné opakování** – jídla i tréninkové dny musí být různé
3. **Odpovídají textům** – název = skutečné jídlo/cvik, ne vymyšlené
4. **U jídel: povolena náhrada** – možnost alternativy („Místo X: Y“)
5. **Možnost zahrnout do dalšího týdne** – uživatel může označit jídlo pro příští plán

### Jak to dnes funguje

| Požadavek | Implementace |
|-----------|--------------|
| Ověřená jídla | `validatePlanTruth` → `isMealPublishable` (normalizeMealQueryCs, meal_key) |
| Ověřené cviky | `validatePlanTruth` → `isExercisePublishable` (resolveToCanonicalKey) |
| Žádné opakování jídel | `repetitive_meals` – stejné jídlo 3+× v týdnu ve stejném slotu → soft gate retry |
| Žádné opakování tréninku | `repetitive_training_days` – identické bloky cviků mezi dny → soft gate retry |
| Náhrada u jídel | Prompt: „Náhrady (doporučeno): u vybraných jídel uveď 1–2 konkrétní alternativy“ |
| Zahrnout do dalšího týdne | `user_meal_pins` + `pinnedMeals` v `buildUserPrompt` + UI „Zahrnout do dalšího týdne“ |

### Hard gate vs. soft gate

- **Hard gate** (`truth_check_passed`): `unpublishable_meals` nebo `unpublishable_exercises` → plán se neuloží, retry nebo fallback
- **Soft gate** (`soft_gate_passed`): `repetitive_meals`, `repetitive_training_days`, `unjustified_supplements` → jeden retry s důvodem v promptu, pak fallback pokud stále neprojde

---

## 5. Povolené cviky (canonical seznam)

Cviky musí mapovat na: Dřepy, Kliky, Přítahy v předklonu, Výpady, Prkno, Superman, Mrtvý tah, Rumunský mrtvý tah, Tlaky na hrudník, Tlaky nad hlavu, Rozcvička, Závěr, Strečink, Odpočinek, Lehká procházka.

`exerciseCanonicalMap` + `resolveToCanonicalKey` zajišťují mapování.

---

## 6. Shrnutí flow

```
Registrace (body-metrics)
    ↓
createInitialAITasks → ai_tasks: trainer/initial_plan, coach/onboarding_message
    ↓
runAIScheduler / triggerImmediateDecision
    ↓
executeTrainerTask
    ↓
runPlanPipeline → generatePlan
    ├─ buildUserPrompt (body_metrics, pinnedMeals, workout_days)
    ├─ runAgent('trainer') → OpenAI Responses API
    ├─ validatePublishedPlanHtml (struktura)
    ├─ validatePlanTruth (publish-safe, repetitive)
    ├─ soft gate retry pokud repetitive
    └─ fallback pokud AI selže
    ↓
persistTrainerPlan → ai_generated_plans
    ↓
sendPlanEmail → e-mail s plánem
```

---

## 7. Co je třeba dodržet

1. **Po registraci vždy** vytvořit `trainer/initial_plan` a spustit ho (scheduler nebo direct execution)
2. **Plán musí projít** validací struktury i truth checkem
3. **E-mail se posílá** jen když je plán uložen a validní
4. **Jídla** – max 2× stejné ve stejném slotu za týden; náhrady povoleny
5. **Trénink** – každý tréninkový den jiný (full body / dolní / horní / kardio-mobilita)
6. **Zahrnout do dalšího týdne** – `user_meal_pins` → `pinnedMeals` v dalším generování
