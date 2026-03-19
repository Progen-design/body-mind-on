# Analýza Spoonacular API – příčiny vysokého počtu požadavků

**Datum:** 2026-03-19  
**Kontext:** Graf ukazuje ~5 500 requestů a ~7 200 bodů denně (kvóta 1 500), body > requests = drahé endpointy.

---

## 1. Zdroje Spoonacular volání

| Zdroj | Endpoint | Bodové náklady | Kdy se volá |
|-------|----------|----------------|--------------|
| **planOrchestrator** | complexSearch (addRecipeInformation, addRecipeNutrition) | **3 + 1/result** ≈ 6 bodů/call | Při generování plánu (registrace, přegenerování) |
| **plan-enrichment** | complexSearch (přes enrichMeal → searchMealMetadata) | **≈ 6 bodů/call** | Při každém načtení profilu s plánem |
| **spoonacular-recipe** | Get Recipe Information | **1 bod/call** | Při otevření popup receptu v PlanViewer |
| **replace-meal** | complexSearch | **≈ 6 bodů/call** | Při nahrazení jídla v plánu |
| **verify-media-apis** | complexSearch (1× chicken breast) | **≈ 6 bodů** | Při manuální kontrole API |

---

## 2. Odhad na jednu registraci + první zobrazení profilu

| Krok | Volání | Body |
|------|--------|------|
| **Generování plánu** (planOrchestrator) | 21 jídel × 1 searchMealMetadata | 21 × 6 ≈ **126** |
| Fallback (neověřená jídla) | až 21 × 1 fallback | +126 ≈ **252** |
| **Zobrazení profilu** (plan-enrichment) | 21 jídel × enrichMeal | 21 × 6 ≈ **126** |
| **Celkem** | | **~250–380 bodů** |

**Problém:** planOrchestrator **nepoužívá ani nezapisuje** `meal_metadata_cache`. plan-enrichment tedy vždy dostane cache miss a znovu volá Spoonacular pro stejná jídla.

---

## 3. Hlavní příčiny vysokého počtu požadavků

### A. Duplicita: plán vs. profil

- **planOrchestrator** volá `searchMealMetadata` přímo (bez cache).
- **plan-enrichment** volá `enrichMeal` → cache → `searchMealMetadata`.
- Cache v `meal_metadata_cache` se plní jen z `enrichMeal`, ne z `planOrchestrator`.
- Klíč cache: `name_key` = normalizovaný název. planOrchestrator hledá anglický `search_query`, plan-enrichment parsuje český `display_name_cs` z HTML → jiný klíč → cache miss.

### B. plan-enrichment při každém načtení profilu

- PlanViewer volá `POST /api/plan-enrichment` při každém zobrazení plánu.
- In-memory cache (5 min) pomáhá jen při opakovaném načtení stejného plánu v krátkém čase.
- Nový plán = cache miss = 21 Spoonacular volání.

### C. complexSearch s addRecipeInformation + addRecipeNutrition

- Každé volání: **3 request points + 1 per result** (number=3) ≈ **6 bodů**.
- Zdroj: `lib/mealEnrichment.js` → `callSpoonacular` s `addRecipeInformation=true&addRecipeNutrition=true`.

### D. Popup receptu (Get Recipe Information)

- Každé otevření receptu v modalu = 1 bod.
- Při prohlížení více receptů se body sčítají.

---

## 4. Kritická místa v kódu

| Soubor | Funkce / flow | Problém |
|--------|----------------|---------|
| `lib/services/planOrchestrator.js` | `resolveMeals` | Volá `searchMealMetadata` přímo, **nezapisuje do meal_metadata_cache** |
| `lib/mealEnrichment.js` | `searchMealMetadata` | Používá se bez cache v planOrchestrator |
| `lib/mealEnrichment.js` | `enrichMeal` | Cache hit jen při `getCachedMeal` / `getCachedMealByRecipeId` – planOrchestrator cache neplní |
| `lib/enrichPlanContent.js` | `enrichPlanContent` | Pro každé jídlo volá `enrichMeal` → při cache miss Spoonacular |
| `components/PlanViewer.js` | `useEffect` na `plan.plan_html` | Při každém načtení plánu volá `/api/plan-enrichment` |
| `pages/api/spoonacular-recipe.js` | GET handler | Get Recipe Information – 1 bod za každé otevření receptu |

---

## 5. Doporučené úpravy (priorita)

### P1 – Zápis do cache z planOrchestrator ❌ ZRUŠENO

- Uživatel nechce žádnou cache – data se vždy berou čerstvě ze Spoonacular.

### P2 – Sdílený cache klíč ❌ ZRUŠENO

- Viz P1.

### P3 – Omezení plan-enrichment při structured plánu

- `enrichMeal` volá `getCachedMealByRecipeId` a `getCachedMeal` – tyto cache zůstávají v mealEnrichment (Supabase meal_metadata_cache) pro konzistenci v rámci enrichMeal flow. Bez zápisu z planOrchestrator se při zobrazení profilu vždy volá Spoonacular (cache miss na recipe_id).

### P4 – Client-side cache pro spoonacular-recipe

- PlanViewer má `recipeCacheRef` (Map) s TTL 5 min – viz poznámka uživatele o žádné cache.

---

## 6. Rychlý odhad denního objemu

- 1 registrace ≈ 250–380 bodů (plán + profil).
- 1 přegenerování plánu ≈ 250 bodů.
- 1 zobrazení profilu (cache miss) ≈ 126 bodů.
- 10 otevření receptů ≈ 10 bodů.

Při ~20 registracích + ~30 zobrazeních profilu + přegenerováních ≈ **7 000+ bodů/den** → překročení kvóty 1 500.
