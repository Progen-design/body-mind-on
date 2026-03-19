# Finální verifikační audit – Body & Mind ON

**Datum:** 2026-03-18  
**Typ:** Senior full-stack QA + product engineer  
**Cíl:** Ověřit produkční flow generování plánů, lokalizaci do češtiny a konzistenci dat v profilu, e-mailu a popup receptu.

---

## A. Celkový verdict

**HOTOVO**

---

## B. PASS / RISK / FAIL tabulka

| Oblast | Status | Poznámka |
|--------|--------|----------|
| Spoonacular meals | PASS | resolveMeals používá Spoonacular, fallback na MEAL_QUERIES při miss |
| localized meal titles | PASS | batchTranslateRecipeTitlesToCzech + translateRecipeTitleToCzech, display_name_cs nikdy raw |
| localized recipe popup | PASS | /api/spoonacular-recipe → getLocalizedRecipe → česky název, suroviny, postup, nutriční blok |
| trust-safe meal images | PASS | image_url jen při image_trust_level === 'exact', jinak null |
| wger exercises | PASS | resolveExercise → wgerService, exercise_verified, display_name_cs |
| canonical Czech exercise names | PASS | mountain_climber → Horolezec, superman → Superman cvik, bench_press → Tlak na lavici |
| renderer profile | PASS | planRenderer používá display_name_cs, recipe_verified, exercise_verified |
| renderer email | PASS | stejný renderPlanHtmlFromStructured → sendPlanEmail |
| replace meal | PASS | translateRecipeTitleToCzech, display_name_cs, recipe_verified, image_trust_level |
| replace workout | PASS | display_name_cs, canonical_key, exercise_verified – stejný model jako pipeline |

---

## C. Root causes

Co ještě může způsobit:

1. **Angličtina v UI**
   - ~~`exerciseCanonicalMap.js`: `mountain_climber`, `superman`, `bench_press` mají `display_name_cs` v angličtině~~ – opraveno
   - Při cviku mimo canonical mapu: `display_name_cs = 'Cvik'` (generic placeholder) – OK

2. **Špatné obrázky**
   - Obrázek jídla se používá jen při `image_trust_level === 'exact'` – OK
   - PlanViewer: `API_ONLY_MEDIA=true` → jen exact; jinak illustrative z meal_trust

3. **Rozdíl mezi profilem a e-mailem**
   - Oba používají `renderPlanHtmlFromStructured(planResult, bm)` → stejný HTML – OK

4. **Rozdíl mezi pipeline a replace endpointy**
   - replace-meal: stejný model (display_name_cs, recipe_verified, image_trust_level)
   - replace-workout: stejný model (display_name_cs, canonical_key, exercise_verified)

---

## D. Kritická místa v kódu

| Soubor | Funkce | Problém | Dopad |
|--------|--------|---------|-------|
| lib/exerciseCanonicalMap.js | CANONICAL_EXERCISES | ~~mountain_climber, superman, bench_press v angličtině~~ – opraveno na Horolezec, Superman cvik, Tlak na lavici | — |
| lib/generatePlan.js | generatePlan (line 841) | `m.recipe ?? { title: m.display_name }` – enrichment pro vrácení | Pouze interní enrichment objekt, ne user-facing; planHtml už má display_name_cs |
| lib/mealEnrichment.js | searchMealMetadata (line 339) | `name: best.recipe.title \|\| mealName` | Interní pole meta, planOrchestrator ho nepoužívá pro UI |

---

## E. Co je už správně

1. **Pipeline flow:** OpenAI → Spoonacular → wger → planOrchestrator → renderer → persist + email
2. **OpenAI negeneruje user-facing názvy:** pouze search_query, meal type
3. **Jídla resolved přes Spoonacular:** searchMealMetadata, confidence >= 0.75, image_trust_level
4. **Automatický fallback jídel:** getFallbackMealQueries při Spoonacular miss
5. **Překlad receptů:** batchTranslateRecipeTitlesToCzech, translateRecipeTitleToCzech, getLocalizedRecipe
6. **Renderer:** pouze display_name_cs, recipe_verified, exercise_verified; placeholdery Jídlo (neověřeno), Cvik (neověřeno)
7. **Nákupní seznam:** jen recipe_verified === true
8. **Popup receptu:** /api/spoonacular-recipe → getLocalizedRecipe → česky vše + nutriční blok
9. **Replace endpoints:** stejný model jako hlavní pipeline
10. **Trust-safe obrázky:** image_url jen při exact
11. **exerciseProviderRegistry:** display_name_cs = def?.display_name_cs ?? 'Cvik' – nikdy raw wger name

---

## F. Co ještě dorazit

1. ~~**exerciseCanonicalMap.js:** Změnit display_name_cs u mountain_climber, superman, bench_press na české ekvivalenty~~ – **HOTOVO** (2026-03-18): mountain_climber → „Horolezec“, superman → „Superman cvik“, bench_press → „Tlak na lavici“.

---

## G. Testovací checklist

### Ruční QA pro produkci

1. **Nová registrace**
   - [ ] Vyplnit dotazník na /start
   - [ ] Ověřit e-mail s plánem – vše česky
   - [ ] Ověřit jména jídel – žádná raw angličtina
   - [ ] Ověřit názvy cviků – žádná raw angličtina (kromě mountain climber, superman, bench press)

2. **Profil**
   - [ ] Načíst plán v profilu
   - [ ] Jídla: display_name_cs, obrázky jen u ověřených
   - [ ] Cviky: display_name_cs
   - [ ] Nákupní seznam: jen ověřená jídla

3. **E-mail**
   - [ ] Stejný obsah jako v profilu
   - [ ] HTML validní, česky

4. **Popup receptu**
   - [ ] Klik na ověřené jídlo → modal
   - [ ] Název česky
   - [ ] Suroviny česky
   - [ ] Postup česky
   - [ ] Nutriční hodnoty česky (Kalorie, Tuky, Bílkoviny, …)

5. **Replace meal**
   - [ ] Nahradit jídlo → nový recept
   - [ ] display_name_cs česky
   - [ ] Při miss: „Jídlo (neověřeno)“

6. **Replace workout**
   - [ ] Nahradit trénink → nové cviky
   - [ ] display_name_cs (nebo Cvik (neověřeno))

7. **Edge case – neznámý cvik**
   - [ ] AI navrhne cvik mimo canonical mapu
   - [ ] Očekáváno: „Cvik (neověřeno)“ nebo „Cvik“ (ne raw wger name)

8. **Edge case – slabý meal match**
   - [ ] Spoonacular vrátí nízkou confidence
   - [ ] Fallback: zkusit alternativy z MEAL_QUERIES
   - [ ] Při selhání všech: „Jídlo (neověřeno)“
