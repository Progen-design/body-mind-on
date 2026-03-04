# Návrhy úprav kódu – Body & Mind ON

Dokument obsahuje konkrétní návrhy s jednoduchými pokyny. Stačí napsat číslo nebo klíčové slovo a změny budou provedeny.

---

## 1. Propojení s OpenAI Asistentem

### Jak to funguje

```
body_metrics / profile-preferences / assistant-intake
        ↓
generatePlanForEmail(email) nebo generatePlan(params)
        ↓
buildUserPrompt(bm) → JSON s: name, gender, age, height_cm, weight_kg, activity, stress, occupation, goal, weekly_sessions, diet_type, preferences
        ↓
runAssistantWithPrompt(userMessage) → OpenAI API (threads, runs)
        ↓
Asistent (OPENAI_ASSISTANT_ID) – instrukce z docs/OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md
        ↓
Vrací JSON: { ok, metrics, html } nebo raw HTML
        ↓
ai_generated_plans (INSERT) + sendPlanEmail()
```

### Mapování hodnot pro Asistenta

| Pole | body_metrics (DB) | Formulář profil | Co Asistent očekává |
|------|-------------------|-----------------|---------------------|
| activity | sedavy, lehce, stredne, velmi, extra | Nízká, Střední, Vysoká | sedavy/stredne/velmi (pro trénink) |
| stress | low, medium, high | low, medium, high | low/medium/high |
| occupation | office_it, manual, teacher_sales | Sedavé/Aktivní/Kombinované | office_it/manual/teacher_sales |
| goal | redukce, nabirani_svaly, udrzovani | Redukce/Nárůst/Zdravý | redukce/nabirani_svaly/udrzovani |
| weekly_sessions | 1, 3, 5 (z freq_choice) | 1-2x, 2-3x, 4-5x | 1 / 3 / 5 |

**Důležité:** `buildUserPrompt` v `lib/generatePlan.js` bere data přímo z `body_metrics` (nebo `bmOverride`). Hodnoty `activity`, `goal`, `occupation` musí být v canonical formátu (sedavy, redukce, office_it), protože Asistent podle nich přizpůsobuje trénink (viz OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md – sekce „Přizpůsobení podle aktivity a stresu“).

---

## 2. Návrhy úprav – pokyny k provedení

### Návrh A: Sjednotit normalizaci do lib/preferenceConstants.js

**Problém:** `normalizeActivity`, `normalizeStress`, `normalizeGoal`, `normalizeFrequency` jsou duplicitně v `body-metrics.js` a `profile-preferences.js`. Aktuální nekonzistence: v body-metrics „nízká“ → `lehce`, v profile-preferences „nízká“ → `sedavy`. Asistent očekává canonical hodnoty (sedavy/stredne/velmi).

**Pokyn:** „Proveď návrh A“ nebo „Sjednoť normalizaci“

**Změny:**
- Přidat do `lib/preferenceConstants.js`: `normalizeActivity`, `normalizeStress`, `normalizeGoal`, `normalizeFrequency`
- V `pages/api/body-metrics.js` a `pages/api/profile-preferences.js` importovat z preferenceConstants a odstranit lokální definice

---

### Návrh B: Přidat rate limit na /api/generate-plan

**Problém:** Endpoint je veřejný, bez auth i rate limitu – riziko zneužití OpenAI API.

**Pokyn:** „Proveď návrh B“ nebo „Přidej rate limit na generate-plan“

**Změny:**
- V `pages/api/generate-plan.js` přidat `isRateLimited('generate-plan:' + ip, 5, 10 * 60 * 1000)` na začátek handleru
- Importovat `getClientIp`, `isRateLimited` z `lib/rateLimit`

---

### Návrh C: Fallback v send-plan-again podle e-mailu

**Problém:** Plány s `user_id = null` (vytvořené před účtem) se při dotazu podle `user_id` nenajdou.

**Pokyn:** „Proveď návrh C“ nebo „Fallback send-plan-again podle email“

**Změny:**
- V API `send-plan-again`: pokud dotaz podle `user_id` vrátí 0 řádků, zkusit dotaz podle `email` (z profiles nebo session)

---

### Návrh D: Explicitní ošetření 0 záznamů v quick-weight

**Problém:** Při 0 záznamech v `body_metrics` `.single()` vrací `{ data: null, error }`; kód používá `latest?.height_cm ?? 170` a pokusí se vložit řádek s výchozími hodnotami – uživatel ale nemusí mít výšku 170 cm.

**Pokyn:** „Proveď návrh D“ nebo „Oprav quick-weight při 0 záznamech“

**Změny:**
- V `pages/api/quick-weight.js`: pokud `latest` je null (0 záznamů), vrátit 400 s hláškou „Nejprve dokonči registraci (zadej výšku a váhu).“

---

### Návrh E: Migrace CREATE TABLE pro body_metrics a ai_generated_plans

**Problém:** V migracích chybí definice tabulek; používají se jen ALTER/UPDATE.

**Pokyn:** „Proveď návrh E“ nebo „Přidej migraci CREATE TABLE“

**Změny:**
- Vytvořit `supabase/migrations/20260324_create_body_metrics.sql` s CREATE TABLE IF NOT EXISTS (podle aktuálního schématu z kódu)
- Vytvořit `supabase/migrations/20260324_create_ai_generated_plans.sql` (nebo sloučit do jednoho souboru)

---

### Návrh F: Doplnit assistant-intake o foods_to_avoid

**Problém:** `assistant-intake` už předává `diet_type` a `dietary_restrictions` do `generatePlanAndSendFromParams`, ale chybí `foods_to_avoid` – Asistent pak nemá kompletní preferences.

**Pokyn:** „Proveď návrh F“ nebo „Doplň assistant-intake o foods_to_avoid“

**Změny:**
- V `assistant-intake.js` přidat do volání `generatePlanAndSendFromParams`: `foods_to_avoid: data.foods_to_avoid ?? null`

---

### Návrh G: Sjednotit weekly_sessions v buildUserPrompt

**Problém:** `buildUserPrompt` používá `weekly_sessions: bm.freq_choice ?? bm.frequency ?? bm.weekly_sessions`. Asistent očekává číslo 1/3/5, ale `freq_choice` je text „1-2x týdně“.

**Pokyn:** „Proveď návrh G“ nebo „Sjednoť weekly_sessions pro Asistenta“

**Změny:**
- V `lib/generatePlan.js` v `buildUserPrompt`: převést `freq_choice` na číslo (1, 3, 5) před odesláním do promptu, aby Asistent dostal konzistentní formát

---

### Návrh H: Dokumentace toku OpenAI

**Problém:** Chybí jeden dokument, který popisuje celý tok od formuláře po Asistenta.

**Pokyn:** „Proveď návrh H“ nebo „Dokumentuj tok OpenAI“

**Změny:**
- Vytvořit `docs/OPENAI_TOK_DAT.md` s diagramem a popisem: formulář → API → body_metrics → buildUserPrompt → runAssistantWithPrompt → ai_generated_plans → e-mail

---

## 3. Přehled pokynů (zkráceně)

| # | Pokyn | Popis |
|---|-------|-------|
| A | „Proveď návrh A“ | Sjednotit normalizaci |
| B | „Proveď návrh B“ | Rate limit na generate-plan |
| C | „Proveď návrh C“ | Fallback send-plan-again |
| D | „Proveď návrh D“ | Oprava quick-weight |
| E | „Proveď návrh E“ | Migrace CREATE TABLE |
| F | „Proveď návrh F“ | assistant-intake strava |
| G | „Proveď návrh G“ | weekly_sessions pro Asistenta |
| H | „Proveď návrh H“ | Dokumentace toku |

---

## 4. Hromadné provedení

**Pokyn:** „Proveď návrhy A, B, C, D“ – provedou se vybrané návrhy najednou.
