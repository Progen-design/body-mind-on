# Vysoký kalorický cíl a nafouklé porce — proč se odkládá (2026-09-17)

Zdroj: ověření dopadu na produkci (30 profilů), měřeno 2026-09-17. Číslo
`meals_per_day` bylo dřív chybně předpokládané — opraveno před tímhle měřením.

## Závěr

**Odkládá se.** Není to funkční rozbití jídelníčku, je to kvalita gramáže.
Řešení potřebuje zásah do obsahu (knihovna šablon) i do schedulingu, ne jen
kód. Až se na to vrátíme, jde se cestou **(A)** domluvenou dřív — obohacení
knihovny šablon o varianty s vyšším bazálním kcal pro horní pásmo cílů,
místo aby scheduler dál škáloval málo kalorické šablony nahoru.

Mezitím se řeší jen menší, samostatný krok: `pickTemplateForSlot` bude
kaloricky vědomý (viz PR, který na tenhle dokument odkazuje) — preferuje
šablony blízké cíli slotu a slabé (nízkokalorické) nabízí, až když nic
lepšího ve slotu není. Tohle FAIL neodstraní (žádná šablona se do extrémního
cíle typu 3300 kcal nevejde), jen sníží, jak často se sahá po nejhůř sedící
šabloně.

## Čísla

- **5 z 30 profilů** má denní kalorický cíl ≥ 2800 kcal.
- **Denní součty sedí** i u nich — `fillDayCaloriesByAddingLibraryMeals`
  den dorovná knihovními jídly navíc:
  - 3270 / 3308 kcal (cíl / skutečnost)
  - 3278 / 3308 kcal
  - 3240 / 3094 kcal
- **Symptom je porce, ne chybějící kalorie**: z **189 jídel** u těchto
  profilů je **73 nad 1.15× škálování** (poměr `target_kcal` slotu ku
  bazálnímu `kcal` šablony), **maximum 1.40×**, **nic nad 1.5×**.

## Proč se to nehoní na 0

- Strop dávají bazální kcal šablon v `START_MEAL_TEMPLATES`
  (`lib/services/simpleMealPlannerAgent.js`) — nejvyšší oběd/večeře má kolem
  600–620 kcal. Pro cíl 2800+ kcal/den při 5–6 jídlech to nutně znamená
  škálování nad 1.15×, dokud knihovna nemá i vyšší-kalorické varianty.
- Rozšířit slovník aliasů nebo přidat další dávku USDA na tohle nemá vliv —
  to řeší nespočítatelnost nutrice (viz sekce o `compute_nutrition_for_ingredients`
  v CLAUDE.md), ne velikost porce.
