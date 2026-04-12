# Handoff: Body & Mind ON – stav a další fáze (pro AI asistenta)

Tento dokument shrnuje **aktuální fázi** implementace jádra produktu (AI plán + Spoonacular + wger) a **co dál dává smysl**. Můžeš ho celý vložit do jiného AI nástroje jako kontext pro úpravy nebo audit.

---

## 1. Fáze, ve které projekt je (leden/duben 2026)

| Oblast | Stav |
|--------|------|
| Jednotný generátor plánu | `runUnifiedPlanPipeline` – vstupy: registrace, preference, next week, assistant-intake |
| Spoonacular | `complexSearch` s `addRecipeInformation` + `addRecipeNutrition`; při chybějících nutrientech/surovinách doplnění přes `/recipes/{id}/information` (`lib/mealEnrichment.js`) |
| wger | `lib/services/wgerService.js` + `lib/wgerClient.js`, základ URL `lib/wgerApiConstants.js` → `https://wger.de/api/v2/` |
| Ověření jídel v plánu | `skipDailyDedup: true` v `resolveMeals` – **žádný denní dedup přes `meal_metadata_cache`** při generování týdenního plánu |
| Rychlý režim | `fastMode` v orchestrátoru **vynuceně vypnutý** – plný resolve |
| UI plán | `PlanViewer` – v produkci defaultně jen média `exact`, pokud není `NEXT_PUBLIC_API_ONLY_MEDIA=false`; HTML atributy `data-recipe-id` / obrázek sloučené s enrichmentem |
| UX čekání | `lib/planGenerationUiCopy.js` – text o minutách generování (registrace + profil) |
| Health check | `GET /api/verify-media-apis` – Spoonacular (search + information), wger (translation + search + exerciseimage) |

**Produkční nasazení:** změny jsou na větvi `main` a přes Vercel (auto-deploy z GitHubu).

---

## 2. Kritická pravidla (nesmí se „rozbít“ bez záměru)

- V `.cursor/rules/00-project-guardrails.mdc`: **žádná cache ve flow generování plánu** ve smyslu dedupu výsledků Spoonacular pro týdenní plán; plný ověřený resolve.
- Logika v `/lib`, API v `/pages/api`, UI v komponentách.
- E-maily: platné HTML, čeština.
- **Nepřidávat** nové npm balíčky bez schválení vlastníka repa.

---

## 3. Mapa klíčových souborů

| Soubor | Role |
|--------|------|
| `lib/unifiedPlanPipeline.js` | Jediný orchestrátor generování plánu |
| `lib/services/planOrchestrator.js` | OpenAI → struktura → `resolveMeals` / `resolveWorkouts` |
| `lib/services/planOrchestratorResolve.js` | Spoonacular + překlady názvů jídel; budget `SPOONACULAR_MAX_REQUESTS_PER_PLAN` (default 90) |
| `lib/mealEnrichment.js` | Shortlist, skóre, volání Spoonacular, případně `information` |
| `lib/spoonacularComplexSearch.js` | Query string pro `complexSearch` |
| `lib/wgerApiConstants.js` | `WGER_API_V2_BASE` |
| `lib/services/wgerService.js` | Search, obrázky, video, `resolveExerciseById` |
| `lib/exerciseEnrichment.js` | Registry + wger; volitelné `wger_exercise_id` z HTML |
| `lib/planRenderer.js` | HTML s `data-recipe-id`, `data-meal-key`, `data-wger-exercise-id` |
| `components/PlanViewer.js` | Parsování HTML, trust, modal receptu |
| `pages/api/spoonacular-recipe.js` | Detail receptu pro UI |
| `pages/api/plan-enrichment.js` | Média po načtení plánu v profilu |

---

## 4. Proměnné prostředí (výběr)

- `SPOONACULAR_API_KEY` – povinné pro jídla  
- `SPOONACULAR_MAX_REQUESTS_PER_PLAN` – volitelné (default v kódu 90)  
- `MEAL_CONFIDENCE_THRESHOLD` – volitelné (default ~0.35)  
- `NEXT_PUBLIC_API_ONLY_MEDIA` – `false` / `true` / unset (v produkci unset = chování jako strict exact)  
- Supabase, OpenAI, e-mail – viz `.env.example`

---

## 5. Návrh **další fáze** (priorita pro dalšího AI / vývojáře)

Následující body jsou **doporučení**, ne povinná součást současné fáze:

1. **Observabilita** – strukturované logy u `resolveMeals` (počet `complexSearch` vs `information`, počet ověřených jídel) do jednoho JSON řádku pro Vercel Logs.  
2. **Kvóty Spoonacular** – dashboard už ukazuje hlavně `complexSearch`; po nových úpravách sledovat, zda `information` nestoupá příliš; případně zvednout budget nebo zpřísnit podmínku `recipeNeedsSpoonacularInformation`.  
3. **E2E / smoke** – jeden skript: přihlášení → načtení profilu s plánem → kontrola, že `plan_html` obsahuje `data-recipe-id` u ověřených jídel (bez screenshotů).  
4. **Sjednocení timeoutů** – `mealEnrichment` vs `wgerClient` vs Vercel `maxDuration` na route, která volá pipeline (u dlouhých plánů).  
5. **Dead code** – v `mealEnrichment.js` funkce `getCachedMeal` / `getCachedMealByRecipeId` nejsou volané z produkční cesty; buď zapojit do jiného flow, nebo odstranit po revizi.  
6. **Dokumentace pro support** – krátký „runbook“: co znamená `plan_state: processing`, kdy doporučit obnovit profil, odkaz na `/api/verify-media-apis`.

---

## 6. Co předat dalšímu AI v jedné větě (prompt seed)

> Repozitář **body-mind-on**: Next.js + Supabase + Vercel. Jádro je `runUnifiedPlanPipeline` → Spoonacular (`mealEnrichment` + případně `information`) + wger. Při generování plánu nepoužívej denní `meal_metadata_cache` dedup (`skipDailyDedup: true` už je v `resolveMeals`). Respektuj `.cursor/rules/00-project-guardrails.mdc`. Další práce: viz `docs/HANDOFF_NEXT_PHASE_AI.md` sekce 5.

---

*Poslední aktualizace dokumentu: duben 2026. Po větších změnách v pipeline tento soubor prosím aktualizuj.*
