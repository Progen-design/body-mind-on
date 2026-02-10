# Tok: formulář START → e-mail s plánem

Tento dokument popisuje **funkční tok** od odeslání dotazníku na [app.bodyandmindon.cz/start](https://app.bodyandmindon.cz/start) až po doručení e-mailu s AI plánem. Při úpravách kódu je nutné tento tok **zachovat beze změny chování**.

---

## 1. Přehled kroků

```
[Stránka /start]  →  POST /api/body-metrics  →  Supabase body_metrics
                          ↓
                    generatePlanForEmail(email)
                          ↓
                    Supabase body_metrics (SELECT)  →  OpenAI  →  ai_generated_plans (INSERT)
                          ↓
                    sendPlanEmail(email, planHtml)  →  Nodemailer (Gmail)  →  e-mail uživateli
```

- **Frontend:** pouze `pages/start.js` (formulář) → volá **jen** `POST /api/body-metrics`.
- **E-mail s plánem** zajišťuje výhradně `lib/mail.js` (Nodemailer + GMAIL_USER / GMAIL_APP_PASSWORD). Endpoint `assistant-intake` a tabulka `registrations` tento tok **nepoužívají**.

---

## 2. Co frontend posílá (`pages/start.js`)

Formulář odešle na `/api/body-metrics` JSON s těmito poli (názvy musí zůstat kvůli mapování v API):

| Pole z formuláře | Typ   | Příklad / hodnoty |
|------------------|--------|---------------------|
| `name`           | string | „Jan Novák“ |
| `email`          | string | „jan@example.com“ |
| `gender`         | string | `male` \| `female` |
| `age`            | number/string | 30 |
| `height`         | number/string | 180 |
| `weight`         | number/string | 80 |
| `activity`       | string | `sedavy` \| `stredne` \| `velmi` |
| `stress`         | string | `low` \| `medium` \| `high` |
| `worktype`       | string | `office_it` \| `manual` \| `kombinovana` |
| `goal`           | string | `redukce` \| `nabirani_svaly` \| `udrzovani` |
| `frequency`      | string | `1-2x týdně` \| `2-3x týdně` \| `4-5x týdně` |
| `notes`          | string | volitelné |
| `program`        | string | vždy `START` |

Před odesláním se volá `normalizeData()`: pomlčka v `frequency` se nahradí (např. `–` → `-`), u `activity`/`stress`/`goal` se volá `.toLowerCase().trim()`.

---

## 3. API `POST /api/body-metrics` (`pages/api/body-metrics.js`)

- **Povinné:** `email`, `height`, `weight`. Při chybějícím e-mailu nebo výšce/váze API vrací 400 a frontend zobrazí chybu.
- **Mapování do DB:**  
  `height` → `height_cm`, `weight` → `weight_kg`, `stress` → `stress_level`, `worktype` → `occupation`, `frequency` → `freq_choice`.  
  Hodnoty pro aktivitu, stres, práci, cíl a frekvenci procházejí **normalizačními funkcemi** (viz níže). Ty musí podporovat jak kódy z `/start` (např. `male`, `sedavy`, `low`, `office_it`), tak české popisy z jiných formulářů.
- **Po úspěšném INSERT do `body_metrics`** se vždy zavolá `generatePlanForEmail(payload.email)`. Pokud tato funkce selže (OpenAI, mail), chyba se zaloguje, ale API **stále vrací 200** a hlášku o úspěchu. Data v DB tedy zůstanou uložena i když e-mail neodejde.

**Důležité:** Neměnit pořadí kroků (validace → insert → generatePlanForEmail) ani podmínku odpovědi 200, aby se nezměnilo chování pro uživatele na `/start`.

---

## 4. Normalizace hodnot (body-metrics.js)

Tyto funkce musí **zachovat** stávající chování:

- **normalizeGender** – přijímá `male` / `female` (z `/start`) a české varianty (muž/žena); vrací `male` \| `female` \| null.
- **normalizeActivity** – přijímá kódy `sedavy`, `lehce`, `stredne`, `velmi`, `extra` beze změny; z českého textu mapuje na tyto kódy; default `stredne`.
- **normalizeStress** – přijímá `low`, `medium`, `high` beze změny; z českého textu mapuje na tyto kódy; default `medium`.
- **normalizeOccupation** – přijímá kódy včetně `office_it`, `manual`, `kombinovana` atd. beze změny; z textu mapuje (např. „kombin“ → `teacher_sales`); default `other`.
- **normalizeGoal** – přijímá `redukce`, `nabirani_svaly`, `udrzovani` beze změny; z textu mapuje; default `udrzovani`.
- **normalizeFrequency** – vstup např. `1-2x týdně`; vrací řetězce s pomlčkou ve tvaru `1–2x týdně`, `2–3x týdně`, `4–5x týdně`.

Přidávání nových hodnot do výčtů je v pořádku; **neměnit** logiku tak, aby hodnoty z `/start` (viz tabulku výše) přestaly být rozpoznány nebo se ukládaly jinak.

---

## 5. Generování plánu (`lib/generatePlan.js`)

- **generatePlanForEmail(email)**  
  - Načte z `body_metrics` **poslední záznam** pro daný `email` (`order('created_at', { ascending: false })`, `limit(1)`).  
  - Z tohoto záznamu sestaví prompt a zavolá OpenAI (model `gpt-4o-mini`).  
  - Výsledné HTML uloží do tabulky **`ai_generated_plans`** (pole `email`, `plan_html`, `generated_by`, …).  
  - Zavolá **sendPlanEmail(email, planHtml)** z `lib/mail.js`.

Změny, které by mohly rozbít tok:

- Změna dotazu (např. jiný řádek než „poslední podle `created_at`“).
- Vynechání volání `sendPlanEmail` nebo změna pořadí (uložení plánu vs. odeslání mailu).
- Změna očekávaných sloupců v `body_metrics` používaných v `buildUserPrompt` (jméno, pohlaví, věk, výška, váha, aktivita, stres, práce, cíl, frekvence).

---

## 6. Odeslání e-mailu (`lib/mail.js`)

- **sendPlanEmail(email, planHtml)**  
  - Používá **Nodemailer** a Gmail (proměnné **GMAIL_USER**, **GMAIL_APP_PASSWORD**).  
  - Od řádku „from“ se použije **EMAIL_FROM** nebo GMAIL_USER.  
  - Šablona je HTML; do ní se vloží `planHtml` z AI.  
  - Předmět a text jsou v češtině.

Pro zachování funkce:

- Neměnit název funkce ani signaturu `(email, planHtml)`.
- Neměnit použití env proměnných GMAIL_USER a GMAIL_APP_PASSWORD (pokud se nepřechází na jiný způsob odesílání).
- Při úpravách šablony zachovat vložení `planHtml` do těla mailu (bez escapování do plain textu).

---

## 7. Závislosti (env, Supabase)

- **API route** používají **supabaseServer** z `lib/supabaseServer.js` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
- **body_metrics** a **ai_generated_plans** musí existovat v Supabase se sloupci, které kód používá.
- **OpenAI:** OPENAI_API_KEY v env.
- **E-mail:** GMAIL_USER, GMAIL_APP_PASSWORD (a volitelně EMAIL_FROM).

Bez těchto proměnných a tabulek tok nebude fungovat.

---

## 8. Co tento tok nepoužívá

- **Tabulka `registrations`** a endpoint **`/api/assistant-intake`** – jiný tok (jiný formulář / jiný e-mail). Úpravy tam neovlivní odeslání plánu z `/start`.
- **`/api/generate-plan`** – vrací plán jako JSON; neposílá e-mail a neukládá do `body_metrics`. Pro dotazník na `/start` se nepoužívá.

---

## 9. Shrnutí: co neměnit

1. **start.js** – endpoint zůstane `POST /api/body-metrics`; názvy polí formuláře neměnit bez úpravy mapování v API.
2. **body-metrics.js** – po úspěšném INSERT vždy volat `generatePlanForEmail(payload.email)`; normalizéry musí dál rozpoznávat hodnoty z `/start`.
3. **generatePlan.js** – načítat poslední záznam z `body_metrics` podle `email`, uložit plán do `ai_generated_plans`, pak zavolat `sendPlanEmail`.
4. **mail.js** – odesílání přes Nodemailer s `planHtml` v těle; env GMAIL_USER a GMAIL_APP_PASSWORD.

Úpravy stylů, textů nebo přidávání polí (s úpravou mapování a DB) jsou v pořádku, pokud se dodrží výše popsané kontrakty mezi stránkou `/start`, API, generováním plánu a odesláním e-mailu.
