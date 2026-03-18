# Kompletní analýza: Jméno, jídelníček, týdny, API

## 1. Proč se zobrazuje jméno „Smoke“ místo zadaného jména z registrace

### Zjištění

Priorita zobrazení jména v profilu (`pages/profil.js`, ř. 1278–1279):

1. `registrationMetric?.name` – jméno z nejstaršího záznamu `body_metrics`
2. `profile?.user?.name` – z `user_metadata` v Supabase Auth
3. `profile?.user?.email?.split('@')[0]` – část před `@` (např. `smoke@...` → „Smoke“)
4. `'Sportovče'` – výchozí fallback

### Příčina

V `lib/authHelpers.js` funkce `createAuthUserIfNew` **nikdy neukládá jméno do `user_metadata`**:

```javascript
// Ř. 31–36 – chybí user_metadata
const { data, error } = await supabaseServer.auth.admin.createUser({
  email: normalizedEmail,
  password,
  email_confirm: true,
  // CHYBÍ: user_metadata: { name }
});
```

- Při nové registraci se jméno neuloží do Auth.
- Při existujícím účtu se `user_metadata` neaktualizuje.
- Pokud `body_metrics` nemají `name` (nebo je nejstarší záznam jiný), použije se fallback na část e‑mailu před `@` → např. „Smoke“ pro `smoke@example.com`.

### Doporučená oprava

1. V `createAuthUserIfNew` přidat `user_metadata: { name: name?.trim() || null }` do `createUser`.
2. Při existujícím účtu volitelně aktualizovat `user_metadata.name` z `body_metrics`, pokud je k dispozici nové jméno.

---

## 2. Jídelníček má začínat dnem registrace, ne pondělím

### Aktuální logika

V `lib/taskExecutors.js` (ř. 181–196) pro `initial_plan`:

```javascript
const registrationDateIso = bm?.created_at
  ? new Date(bm.created_at).toISOString().split('T')[0]
  : nowIso.split('T')[0];
// ...
from: latestPlan?.valid_from || registrationDateIso,
until: latestPlan?.valid_until || addDays(registrationDateIso, 6),
```

- `bm` pochází z `loadLatestBodyMetrics` – tedy **nejnovější** záznam `body_metrics`.
- Pro nového uživatele je jen jeden záznam, takže `bm.created_at` = datum registrace.
- Pro uživatele s více záznamy by `bm.created_at` byl datum poslední aktualizace, ne registrace.

### Možné problémy

1. **`loadLatestBodyMetrics`** vrací nejnovější záznam. Pro `registrationDateIso` by měl být použit nejstarší záznam (datum registrace).
2. **`getNextWeekRange()`** vrací příští pondělí – používá se pro `weekly_plan_update`, ne pro `initial_plan`.
3. **PlanOrchestrator** (`lib/services/planOrchestrator.js`) generuje dny od `validFrom`; pokud je `validFrom` správně předán, pořadí dnů by mělo odpovídat dni registrace.

### Doporučené úpravy

1. Pro `initial_plan` brát datum registrace z **nejstaršího** záznamu `body_metrics` (např. nová funkce `loadFirstBodyMetrics` nebo parametr v `loadLatestBodyMetrics`).
2. Ověřit, že `runUnifiedPlanPipeline` dostává `validFrom` = datum registrace a že se předává do `planOrchestrator`.

---

## 3. „Tento týden“ a „Příští týden“ – jen po vyžádání klienta

### Aktuální chování

V `pages/profil.js` (ř. 2246–2250):

- Tlačítka „Tento týden“ a „Příští týden“ se zobrazují jen když `currentPlan && nextPlan`.
- `nextPlan` = plán s `valid_from > today` (budoucí plán).
- Pokud existuje plán na příští týden (ruční generování nebo `weekly_plan_update`), tab se zobrazí.

### Požadavek

Taby mají být viditelné **jen tehdy, když klient explicitně požádal o generování jídel na příští týden**.

### Možné řešení

1. Přidat do `ai_generated_plans` nebo jiné tabulky flag např. `user_requested_next_week`.
2. Zobrazovat tab „Příští týden“ jen pokud tento flag je `true` pro daný plán.
3. Nastavovat flag při volání `/api/generate-plan-next-week` nebo tlačítka „Vygenerovat příští týden“.

---

## 4. Jídla neodpovídají realitě – napojení na API

### Rozlišení API

| API | Účel | Projekt |
|-----|------|---------|
| **wger.de** (https://wger.de/api/v2/) | Cviky, tréninky, obrázky/videa cviků | ✅ `lib/services/wgerService.js` |
| **Spoonacular** (https://spoonacular.com/food-api/console#Dashboard) | Recepty, jídla, nutriční hodnoty, obrázky jídel | ✅ `lib/services/spoonacularService.js`, `lib/mealEnrichment.js` |

**wger.de se nepoužívá pro jídla.** Pro jídelníček je relevantní **Spoonacular**.

### Aktuální integrace

1. **Spoonacular** – `lib/services/spoonacularService.js`, `lib/mealEnrichment.js`
   - `searchRecipe()` pro vyhledávání receptů
   - `planOrchestrator.resolveMeals()` volá Spoonacular pro každé jídlo
   - Nutriční hodnoty, obrázky, recepty

2. **Registrace** – `body_metrics` ukládá:
   - `diet_type`, `dietary_restrictions`, `foods_to_avoid`, `notes`
   - Tyto údaje se předávají do pipeline: OpenAI → Spoonacular → wger

3. **Fallback** – pokud Spoonacular nevrátí výsledek nebo není nakonfigurován:
   - Pexels (ilustrační obrázky podle klíčových slov)
   - Často nesedí k popisu (např. omeleta vs. rýže/nudle)

### Proč jídla nesedí

1. **Chybí nebo neplatný `SPOONACULAR_API_KEY`** – obrázky jídel budou prázdné.
2. **Nízká confidence** – Spoonacular vrací slabý match → placeholder.
3. **Špatný překlad dotazu** – `mealNormalization.js` překládá češtinu do angličtiny; chyby zhoršují match.

### Ověření konfigurace

- Endpoint `/api/verify-media-apis` kontroluje Spoonacular.
- V `.env` (nebo `.env.production.local`) musí být:
  - `SPOONACULAR_API_KEY=...` (klíč ze spoonacular.com/food-api/console#Dashboard)

### Doporučení

1. Nastavit `SPOONACULAR_API_KEY` v produkci (klíč z obrázku profilu).
2. Zkontrolovat `/api/verify-media-apis` – `spoonacular.working === true`.
3. Pokud `spoonacular.working === false`, obrázky jídel budou prázdné.

---

## 5. Shrnutí priorit

| # | Problém | Příčina | Priorita |
|---|---------|---------|----------|
| 1 | Jméno „Smoke“ | `createAuthUserIfNew` neukládá `user_metadata.name` | Vysoká |
| 2 | Plán od pondělí | Možné použití špatného data (nejnovější vs. nejstarší `body_metrics`) | Vysoká |
| 3 | Tabs „Tento/Příští týden“ | Zobrazují se vždy při `nextPlan`; požadováno jen po vyžádání | Střední |
| 4 | Jídla nesedí | Spoonacular nefunguje | Kritická |

---

## 6. Technické reference

- Jméno: `pages/profil.js` ř. 1278–1279, `lib/authHelpers.js` ř. 26–51
- Valid_from: `lib/taskExecutors.js` ř. 181–196, 296–319
- Tabs: `pages/profil.js` ř. 2246–2250, 1570–1606
- Spoonacular: `lib/mealEnrichment.js`, `lib/services/spoonacularService.js`, `lib/services/planOrchestrator.js`
- wger: `lib/services/wgerService.js` (pouze cviky)
