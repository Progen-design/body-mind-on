# Audit a optimalizace Spoonacular requestů – Body & Mind ON

**Datum:** 2026-03  
**Typ:** Senior full-stack product engineer  
**Cíl:** Snížit počet Spoonacular requestů, zlepšit relevanci jídel, zachovat pipeline.

---

## A. Root cause

### Proč bylo requestů tolik (před optimalizací)

1. **Více kandidátů na meal** – `buildMealSearchCandidates()` vrací až 6 query variant. Každý kandidát = 1 Spoonacular call. Bez `maxCandidates` = až 6 calls/meal.

2. **Žádná cache v planOrchestrator** – `resolveMeals()` volal `searchMealMetadata()` přímo, bez kontroly `meal_metadata_cache`.

3. **Fallback loop** – při miss až 5 dalších `searchMealMetadata()` volání. Každé fallback = znovu 1–6 Spoonacular calls.

4. **Žádná deduplikace** – stejný search_query (např. "oatmeal banana") se volal vícekrát v týdnu zvlášť.

5. **Retry** – `withRetry(..., 2)` = až 3 pokusy na meal při chybě.

### Proč relevance někdy neodpovídá realitě

1. **Volný search_query model** – OpenAI generuje volný text (max 5 slov). Spoonacular similarity je heuristická. "chicken rice vegetables" může matchovat "Chicken Fried Rice" nebo "Chicken and Rice Casserole" – kontext (oběd vs. večeře) se nerozlišuje.

2. **Obecné fallbacky** – `getFallbackMealQueries()` vrací fixní tabulku (fish rice salad, white fish vegetables). Tyto dotazy jsou příliš obecné.

3. **Early exit až při 0.75** – slabší match (0.6–0.74) se zahodí. Snížení prahu by zhoršilo false positives (trust-safe policy).

4. **Žádný meal type context** – Spoonacular neví, že jde o snídani vs. oběd.

### Aktuální stav (po optimalizaci 2026-03)

- ✅ **Deduplikace** – stejný search_query = jeden request, výsledek reuse.
- ✅ **maxCandidates = 2** v normálním režimu (fastMode = 1).
- ✅ **MAX_FALLBACK_ATTEMPTS = 2** (z 5).
- ✅ **Instrumentace** – `_spoonacularCalls`, `_diagnostics`, log.
- **Cache** – záměrně nepoužívána. Žádná cache v planOrchestrator ani v pipeline.

---

## B. Request budget analýza

### Worst case (7 dní × 3 jídla = 21 meals, normal mode, PO optimalizaci)

| Fáze | Výpočet | Requesty |
|------|---------|----------|
| Primární (dedup) | ~12 unikátních query × 2 kandidáti (early exit) | ~15–24 |
| Fallback (30 % miss) | 6 × 2 fallback × 2 kandidáti | ~24 |
| **Celkem worst case** | | **~40–50** |

### Běžný případ (70 % primary hit, dedup)

| Fáze | Výpočet | Requesty |
|------|---------|----------|
| Primární | ~10 unikátních × ~1.5 (early exit) | ~15 |
| Fallback (30 % miss) | 6 × 1–2 fallback × 2 kandidáti | ~12–24 |
| **Celkem typicky** | | **~20–35** |

### FastMode (initial_plan)

| Fáze | Výpočet | Requesty |
|------|---------|----------|
| Primární | ~12 unikátních × 1 | ~12 |
| Fallback (40 % miss) | 8 × 1 | ~8 |
| **Celkem fastMode** | | **~15–20** |

### Hlavní žrouti (aktuálně)

1. **Primární query** – i s dedup zůstává ~10–15 unikátních dotazů.
2. **Fallback** – 2 pokusy × 2 kandidáti = až 4 requesty na miss.
3. **replace-meal** – 1 × 2 kandidáti = 2 requesty per akce.
4. **Popup receptu** (`/api/spoonacular-recipe?id=`) – 1 request per otevření modalu (Get Recipe Information).

### Ostatní zdroje

| Zdroj | Requesty |
|-------|----------|
| replace-meal | 1 × searchMealMetadata (2 calls) = 2 |
| Popup receptu | 1 per otevření modalu (Recipe Information API) |

---

## C. PASS / RISK / FAIL

| Oblast | Status | Poznámka |
|--------|--------|----------|
| Current request efficiency | PASS | 20–50 requestů/plán po optimalizaci; výrazné zlepšení |
| Current meal relevance | RISK | Volný search + obecné fallbacky; občas nesedí |
| Cache usage | N/A | Záměrně žádná cache v pipeline |
| Fallback quality | RISK | Obecné dotazy; nízká kontextová relevance |
| Maintainability | PASS | Čitelný kód, oddělené vrstvy |

---

## D. Doporučený cílový model

### Co ponechat

- OpenAI structured output (search_query) – flexibilita, personalizace.
- Trust-safe image policy (image_trust_level === 'exact').
- Localized český výstup (batchTranslateRecipeTitlesToCzech).
- scoreMealMatch + MISMATCH rules – brání burger/pizza false positive.
- Deduplikace, maxCandidates 2, fallback 2.

### Co upravit

1. **Lepší fallback tabulka** – kontextovější dotazy podle meal type (breakfast: oatmeal eggs, lunch: chicken rice, dinner: grilled fish vegetables).
2. **Request budget per plan** – hard cap 60 requestů; při překročení přestat s fallbacky (implementováno).

*(Cache záměrně nepoužívána – žádná cache v pipeline.)*

### Co odstranit

- Žádné další odstraňování – pipeline je již optimalizovaná.

### Kompromis

- **Snížení prahu relevance** z 0.75 na 0.65 – nedoporučuji (trust-safe policy).
- **Canonical meal catalog** – dlouhodobě lepší, ale vyžaduje design tabulky. Pro teď ponechat search model.

---

## E. Varianta A vs. B – relevance jídel

### Varianta A: Optimalizovaný search (aktuální)

- AI search_query → Spoonacular similarity score
- maxCandidates 2, dedup, fallback 2

| Kritérium | Hodnocení |
|-----------|-----------|
| Přesnost | Střední (závisí na Spoonacular) |
| Náklady | Nižší po optimalizaci |
| Rychlost | Střední |
| Údržba | Nízká |

### Varianta B: Canonical meal catalog

- AI vybírá meal_key z curatované tabulky
- Spoonacular jen dohledává variantu a obrázek

| Kritérium | Hodnocení |
|-----------|-----------|
| Přesnost | Vysoká (curatované) |
| Náklady | Velmi nízké (1:1 lookup) |
| Rychlost | Vysoká |
| Údržba | Vysoká (tabulka meal keys) |

### Doporučení

- **Krátkodobě:** A – optimalizovaný search. Již implementováno.
- **Dlouhodobě:** B – canonical catalog, pokud bude potřeba vyšší přesnost a nižší náklady. Vyžaduje design tabulky, migraci a změnu OpenAI promptu.

---

## F. Implementace (2026-03)

### Provedené změny

1. **maxCandidates = 2** v normálním režimu.
2. **MAX_FALLBACK_ATTEMPTS = 2** (z 5).
3. **Deduplikace search_query** – stejný query = jeden searchMealMetadata.
4. **replace-meal** – maxCandidates: 2.
5. **Instrumentace** – _spoonacularCalls, _diagnostics, log.

### Instrumentace (dostupné v _diagnostics a logu)

| Metrika | Popis |
|---------|-------|
| spoonacular_requests_total | Celkový počet Spoonacular requestů na plán |
| spoonacular_requests_per_plan | = spoonacular_requests_total |
| spoonacular_requests_per_meal | Průměr requestů na meal slot |
| meals_resolved_primary | Počet meal slotů vyřešených primárně |
| meals_resolved_fallback | Počet meal slotů vyřešených fallbackem |
| meals_unverified | Počet meal slotů bez ověřeného receptu |
| average_confidence_score | Průměrná confidence napříč sloty |
| cache_hit_rate | null (záměrně žádná cache) |
| cache_miss_rate | null (záměrně žádná cache) |

### Změněné soubory

| Soubor | Změny |
|--------|-------|
| lib/services/planOrchestrator.js | Deduplikace, maxCandidates 2, fallback 2, diagnostika |
| lib/mealEnrichment.js | _spoonacularCalls v searchMealMetadata |
| pages/api/onboarding/replace-meal.js | maxCandidates: 2 |

### Co otestovat po nasazení

1. Registrace – plán se vygeneruje, jídla mají obrázky a české názvy.
2. Log `Plan generated` – ověřit spoonacular_requests, meals_resolved_primary, meals_resolved_fallback, meals_unverified, avg_confidence.
3. Replace meal – nahrazení jídla funguje.
4. Profil – zobrazení plánu bez volání Spoonacular (data z HTML).
