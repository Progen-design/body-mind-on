# Audit a optimalizace Spoonacular requestů – Body & Mind ON

**Datum:** 2026-03  
**Typ:** Senior full-stack product engineer  
**Cíl:** Snížit počet Spoonacular requestů, zlepšit relevanci jídel, zachovat pipeline.

---

## A. Root cause

### Proč je requestů tolik

1. **Více kandidátů na meal** – `buildMealSearchCandidates()` vrací až 6 query variant (enSimplified, enFull, beforeConnector, base, first 3 words, first word). Každý kandidát = 1 Spoonacular call. Bez `maxCandidates` = až 6 calls/meal.

2. **Žádná cache v planOrchestrator** – `resolveMeals()` volá `searchMealMetadata()` přímo, bez kontroly `meal_metadata_cache`. Každý plán = čerstvé volání pro všech 21 meal slotů.

3. **Fallback loop** – při miss až 5 dalších `searchMealMetadata()` volání s generickými dotazy. Každé fallback = znovu 1–6 Spoonacular calls (podle kandidátů).

4. **Žádná deduplikace v rámci plánu** – stejný search_query (např. "oatmeal banana") se může opakovat vícekrát v týdnu. Každý slot volá zvlášť.

5. **Retry** – `withRetry(..., 2)` = až 3 pokusy na meal při chybě.

6. **fastMode jen při initial_plan** – běžné přegenerování používá plný režim (6 kandidátů, 5 fallbacků).

### Proč relevance někdy neodpovídá realitě

1. **Volný search_query model** – OpenAI generuje volný text (max 5 slov). Spoonacular similarity je heuristická (word overlap, penalty pro burger/pizza). "chicken rice vegetables" může matchovat "Chicken Fried Rice" nebo "Chicken and Rice Casserole" – oba technicky správné, ale kontext (oběd vs. večeře) se nerozlišuje.

2. **Obecné fallbacky** – `getFallbackMealQueries()` vrací fixní tabulku (fish rice salad, white fish vegetables, oatmeal pancakes fruit). Tyto dotazy jsou příliš obecné → Spoonacular vrací první výsledky, které nemusí sedět na konkrétní den/kontext.

3. **Early exit až při 0.75** – slabší match (0.6–0.74) se zahodí, ale mohl by být použitelný. Na druhou stranu snížení prahu zhorší false positives.

4. **Žádný meal type context** – Spoonacular neví, že jde o snídani vs. oběd. Ráno by měly být spíš oatmeal, eggs; večer spíš lehčí jídla.

---

## B. Request budget analýza

### Worst case (7 dní × 3 jídla = 21 meals, normal mode)

| Fáze | Výpočet | Requesty |
|------|---------|----------|
| Primární query | 21 × 6 kandidátů (bez early exit) | 126 |
| Retry (při chybě) | 21 × 2 extra | +42 |
| Fallback (všech 21 miss) | 21 × 5 fallback × 6 kandidátů | 630 |
| **Celkem worst case** | | **~800** |

### Běžný případ (s early exit, 70 % primary hit)

| Fáze | Výpočet | Requesty |
|------|---------|----------|
| Primární | 21 × ~1.5 (early exit v polovině po 2. kandidátu) | ~32 |
| Fallback (30 % miss) | 6 × 2 fallback × 1 kandidát (fastMode fallback?) | ~12 |
| **Celkem typicky** | | **~45** |

### FastMode (initial_plan: maxCandidates 1, fallback 1)

| Fáze | Výpočet | Requesty |
|------|---------|----------|
| Primární | 21 × 1 | 21 |
| Fallback (řekněme 40 % miss) | 8 × 1 | 8 |
| **Celkem fastMode** | | **~29** |

### Hlavní žrouti

1. **Candidate expansion** – 6 kandidátů × 21 meals = 126 v worst case.
2. **Fallback loop** – 5 pokusů × 6 kandidátů × počet miss = až 630.
3. **Žádná deduplikace** – opakované "oatmeal banana" v týdnu = 3× stejný dotaz.

### Ostatní zdroje

| Zdroj | Requesty |
|-------|----------|
| replace-meal | 1 × searchMealMetadata (až 6 calls) = 1–6 |
| Popup receptu (Get Recipe Information) | 1 per otevření modalu |

---

## C. PASS / RISK / FAIL

| Oblast | Status | Poznámka |
|--------|--------|----------|
| Current request efficiency | FAIL | 45–800 requestů/plán; kvóta 1500/den |
| Current meal relevance | RISK | Volný search + obecné fallbacky; občas nesedí |
| Cache usage | FAIL | planOrchestrator cache nepoužívá |
| Fallback quality | RISK | Obecné dotazy; nízká kontextová relevance |
| Maintainability | PASS | Čitelný kód, oddělené vrstvy |

---

## D. Doporučený cílový model

### Co ponechat

- OpenAI structured output (search_query) – flexibilita, personalizace.
- Trust-safe image policy (image_trust_level === 'exact').
- Localized český výstup (batchTranslateRecipeTitlesToCzech).
- scoreMealMatch + MISMATCH rules – brání burger/pizza false positive.

### Co upravit

1. **maxCandidates = 2** jako výchozí (ne 6) – první anglický + full. Sníží primární requesty ~3×.
2. **MAX_FALLBACK_ATTEMPTS = 2** (ne 5) – méně zbytečných pokusů.
3. **Deduplikace search_query v rámci plánu** – stejný query = jeden searchMealMetadata, výsledek reuse.
4. **Cache v planOrchestrator** – před searchMealMetadata zkusit meal_metadata_cache (normalizovaný query). Po úspěchu zapsat.
5. **Lepší fallback tabulka** – místo "fish rice salad" použít kontextovější dotazy podle meal type (breakfast: oatmeal eggs, lunch: chicken rice, dinner: grilled fish vegetables).

### Co odstranit

- Kandidáty 3–6 (simplified Czech, full Czech, first 3 words, first word) v běžném režimu – přidávají requesty, málo přispívají (Spoonacular je anglický).

### Kompromis

- **Snížení prahu relevance** z 0.75 na 0.65 by zvýšilo počet "verified" meals, ale riziko false positive (špatný obrázek). **Nedoporučuji** – trust-safe policy má zůstat.
- **Canonical meal catalog** – velká změna, vyžaduje curatovanou tabulku. Pro teď **ponechat search model**, ale zoptimalizovat.

---

## E. Canonical catalog vs. search model

| Kritérium | A: Optimalizovaný search | B: Canonical catalog |
|-----------|--------------------------|------------------------|
| Přesnost | Střední (závisí na Spoonacular) | Vysoká (curatované) |
| Náklady | Nižší po optimalizaci | Velmi nízké (1:1 lookup) |
| Rychlost | Střední | Vysoká |
| Údržba | Nízká | Vysoká (tabulka meal keys) |

**Doporučení:** A – optimalizovat search model. Canonical catalog je lepší dlouhodobě, ale vyžaduje design tabulky, migraci a změnu OpenAI promptu. Pro rychlý win stačí optimalizace.

---

## F. Implementace (2026-03)

### Provedené změny

1. **maxCandidates = 2** v normálním režimu (fastMode zůstává 1).
2. **MAX_FALLBACK_ATTEMPTS = 2** (z 5) v normálním režimu.
3. **Deduplikace search_query** – stejný query v rámci plánu = jeden `searchMealMetadata`, výsledek se znovu použije.
4. **replace-meal** – `maxCandidates: 2` pro konzistenci.
5. **Instrumentace** – `_spoonacularCalls` v `searchMealMetadata`, diagnostika v `_diagnostics` a logu.

### Změněné soubory

| Soubor | Změny |
|--------|-------|
| `lib/services/planOrchestrator.js` | Deduplikace, maxCandidates 2, fallback 2, diagnostika, log |
| `lib/mealEnrichment.js` | `_spoonacularCalls` v návratové hodnotě `searchMealMetadata` |
| `pages/api/onboarding/replace-meal.js` | `maxCandidates: 2` |

### Očekávaný dopad

| Metrika | Před | Po (odhad) |
|---------|------|------------|
| Worst case / plán | ~800 | ~150–200 |
| Typický plán (21 meals) | ~45 | ~15–25 |
| FastMode | ~29 | ~15–20 (díky dedup) |

### Co otestovat po nasazení

1. **Registrace nového uživatele** – plán se vygeneruje, jídla mají obrázky a české názvy.
2. **Log `Plan generated`** – ověřit `spoonacular_requests`, `meals_resolved_primary`, `meals_resolved_fallback`, `meals_unverified`, `avg_confidence`.
3. **Replace meal** – nahrazení jídla funguje, vrací ověřený recept.
4. **Profil** – zobrazení plánu bez volání Spoonacular (data z HTML).
