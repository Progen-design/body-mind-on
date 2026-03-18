# Audit: Úplné odstranění RapidAPI z aplikace

**Datum:** 2025-03-18  
**Cíl:** Spoonacular (jídla) + wger.de (cviky) jako jediné zdroje. Žádný RapidAPI, ExerciseDB ani fallbacky.

---

## Co bylo odstraněno

| Oblast | Položka |
|--------|---------|
| **Kód** | `registerSecondaryProvider()`, `useSecondary` parametr v `resolveExercise()` |
| **Kód** | Secondary provider hook (exercisedb.dev, Pexels) v `exerciseProviderRegistry.js` |
| **Kód** | `EXERCISE_USE_SECONDARY_PROVIDERS` env check |
| **Env** | `RAPIDAPI_KEY`, `EXERCISEDB_API_KEY`, `EXERCISEDB_API_HOST`, `EXERCISEDB_USE_DEV_ONLY` |
| **Dokumentace** | Zmínky o RapidAPI, ExerciseDB, exercisedb.dev v docs |

---

## Co bylo upraveno

| Soubor | Změna |
|--------|-------|
| `lib/services/exerciseProviderRegistry.js` | Pouze wger, odstraněn secondary provider |
| `lib/exerciseCanonicalMap.js` | `exercisedb_name` → `wger_search_name`, aktualizace komentářů |
| `lib/exerciseEnrichment.js` | Použití `wger_search_name`, komentáře |
| `scripts/check-trusted-assets.mjs` | Komentář "ExerciseDB" → "wger" |
| `docs/ANALYZA_JIDELNICEK_A_REGISTRACE.md` | Odstraněn RAPIDAPI_KEY, Pexels fallback |
| `docs/WGER_API_INTEGRACE.md` | Aktualizace na wger-only stav |
| `docs/ONBOARDING_API_FLOW_DESIGN.md` | exercisedb.dev fallback → placeholder |
| `docs/ONBOARDING_PRODUCTION_SPEC.md` | exerciseProviderRegistry bez secondary |
| `docs/INSTRUKCE_PRODUKCE.md` | Nepoužívané env proměnné |

---

## Co zůstalo (záměrně)

| Položka | Důvod |
|---------|-------|
| Sloupec `exercisedb_name` v `exercise_asset_registry` | DB schema – backward compatibility, obsahuje anglický search term pro wger |
| `exercisedb_name` v `setRegistryEntry` upsert | Mapování na DB sloupec (hodnota z `wger_search_name`) |
| Komentáře "Pexels" v `mealEnrichment.js`, `plan-enrichment.js` | Historické – Pexels byl odstraněn dříve, komentáře popisují strukturu |

---

## Fallback chain (aktuální)

### Jídla
1. Spoonacular (`SPOONACULAR_API_KEY`) → exact
2. Žádný fallback → placeholder

### Cviky
1. `exercise_asset_registry` (DB) → exact
2. wger.de → exact
3. Žádný fallback → placeholder

---

## Capability checks

| Soubor | Stav |
|--------|------|
| `lib/aiRuntimeCapabilities.js` | `spoonacular` (SPOONACULAR_API_KEY), `wger` (enabled: true) – žádný exercisedb |
| `pages/api/verify-media-apis.js` | Spoonacular + wger – žádný ExerciseDB |
| `pages/api/plan-enrichment.js` | Žádná kontrola hasExerciseDb |

---

## API endpointy

| Endpoint | Stav |
|----------|------|
| `/api/verify-media-apis` | Spoonacular + wger |
| `/api/plan-enrichment` | enrichPlanContent → enrichMeal (Spoonacular), enrichExercise (wger) |
| `/api/spoonacular-recipe` | Přímý Spoonacular |
| `/api/onboarding/replace-workout` | resolveExercise (wger) |

---

## Co otestovat po nasazení

1. **`/api/verify-media-apis`**  
   - `spoonacular.working: true`, `wger.working: true`  
   - Žádná zmínka o ExerciseDB

2. **Plán s cviky**  
   - Obrázky/videa cviků se zobrazují (wger)  
   - Sub-label „wger.de“ u ověřených cviků

3. **Plán s jídly**  
   - Obrázky jídel se zobrazují (Spoonacular)

4. **Build bez RAPIDAPI_KEY**  
   - `npm run build` projde  
   - Aplikace běží bez `RAPIDAPI_KEY`, `EXERCISEDB_*` v env

5. **Vercel env**  
   - Odstranit `RAPIDAPI_KEY`, `EXERCISEDB_API_KEY`, `EXERCISEDB_API_HOST` z Environment Variables
