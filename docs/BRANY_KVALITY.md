# Brány kvality — klasifikace `scripts/verify-*.mjs`

PROMPT_UKLID.md (2026-09-17), Blok 2. V repu bylo 79 skriptů `verify-*.mjs`
(zadání odhadovalo ~71 — rozdíl beze změny, jen přesnější počet).

## Kritéria

- **A — patří do CI**: hlídá skutečné pravidlo, běží bez sítě, bez
  `service_role` klíče, bez prohlížeče, a je DNES ZELENÝ. Kandidát na
  zařazení do `npm run check` (Blok 3).
- **A\* — patří sem svým tvarem, ale dnes červené**: bez sítě/klíče/
  prohlížeče, ale FAIL z reálného produktového důvodu, ne z úklidu. Do
  Bloku 3 se nezahrnuje, dokud to Honza nevyřeší.
- **B — ruční audit**: potřebuje `service_role`, síť, prohlížeč nebo lidský
  úsudek, aby měl smysl. Zůstává jako ručně spouštěný skript.
- **C — smazat nebo přepsat**: mířil na `_legacy-next` (smazáno v Bloku 1),
  na neexistující migraci nebo na markup éry před Vite SPA. Kde skript
  hlídal něco skutečného, byl přepsán na živý ekvivalent v `src/`/`lib/`/
  `api/` místo smazání; kde šlo o čistý šum (mrtvá funkce, žádný živý
  ekvivalent), byl smazán.

## DŮLEŽITÁ OPRAVA — první průchod smazal příliš mnoho

Tenhle blok dělal nejdřív podřízený agent (fork). Při kontrole jeho práce se
ukázalo, že **smazal 23 skriptů, z toho nejmíň 6 mělo přes 100 řádků
skutečné, živé `lib`/`api` logiky s jen 1–5 řádky dotýkajícími se
`_legacy-next`** — tedy přesně ten případ, kdy zásada říká "přepiš, ne smaž".
Nejzávažnější: `verify-exercise-integrity.mjs` (172 řádků, ~30 kontrol nad
`lib/exerciseCanonicalMap.js`/`lib/exerciseIntegrity.js`, jen 3 řádky
`_legacy-next`) a `verify-macro-kcal-consistency.mjs` (explicitně jmenovaný
kandidát na A v zadání) byly smazané BEZ ZMÍNKY v reportu ani v tabulce.

Všech 23 smazaných skriptů bylo obnoveno (`git restore`) a prošlo se znovu
ručně, soubor po souboru: u každého se hledalo, jestli existuje živý
ekvivalent v `src/`/`lib`/`api`, a přepisovalo se na něj — stejný postup jako
u Bloku 1's pěti testů. Výsledek: **18 z 23 mělo skutečnou, zachranitelnou
logiku a bylo přepsáno; jen 5 bylo potvrzeno jako čistý šum** (celé mířily na
UI paradigma, které v `src/` vůbec neexistuje — accordion týdenní plán
v jednom `PlanViewer`, marketing landing page, beta sekce) a smazány znovu,
tentokrát s odůvodněním v této tabulce.

Cestou se přepisováním našlo dalších 5 GAPů stejného typu jako v Bloku 1
(server/data existuje, UI ho nezobrazuje) — viz sekce níž.

## Nové GAPy nalezené při opravě Bloku 2

Stejný vzor jako v Bloku 1 (Withings banner, trial nota, zlozvyky): server
nebo `lib/` má hotovou logiku, `src/` ji nikde nevolá. Pinováno jako `GAP:`
test v příslušném skriptu, nevymýšleno:

1. **Dýchání/tempo u cviků** — `lib/exerciseInstructions.js` má pro každý
   cvik `breathing`/`tempo` texty, `src/components/WorkoutSection.tsx` je
   nikde nevykresluje (`verify-profile-real-user-bugfixes.mjs`).
2. **"Připnout jídlo na příští týden"** — `user_meal_pins` API i agent logika
   žijí, žádné tlačítko v `src/` na ně nevede
   (`verify-meal-replacement-actions.mjs`, nalezeno fork-em, ověřeno).
3. **Odznak prostředí tréninku** — `planOrchestrator.js` vyrábí
   `training_environment_label`, žádná komponenta ho nezobrazuje jako badge
   (`verify-training-environment-strictness.mjs`).
4. **`shouldShowWithingsSection`** — viz Blok 4 fix #2, potvrzeno i tady
   (`verify-withings-widget-ux.mjs`).
5. **Celá "Progress" analytická sekce** — váhový graf s trendem, souhrn
   aktivity po obdobích, cílová linka (`lib/progressIntegrity.js`,
   `lib/progressModel.js`) nemá v `src/` VŮBEC žádný live ekvivalent; živý
   `WeightChart.tsx` jede jinudy, ale nezávisle ověřeno, že si neznovu-zavedl
   fabulovaná data (`verify-progress-integrity.mjs`). Tohle je větší gap než
   detail — celá funkční oblast, ne UI nuance.

Dvě zjištěné PRE-EXISTUJÍCÍ, s úklidem nesouvisející FAILy (nechány červené,
nahlášeno, ne opraveno): `lib/membershipRegistration.js`'s
`membershipFromRegistration('START', ...)` vrací `status: 'pending_payment'`
místo dokumentovaného `'trial'` s `trial_ends_at` (`verify-paid-membership-gate.mjs`,
2 FAIL); `lib/mealNutritionDisplay.js`'s `resolveDayCalorieTarget()` preferuje
`calories_per_day` před specifičtějším `daily_target_kcal`, opačně než název
funkce slibuje (`verify-profile-kcal-consistency.mjs`, 1 FAIL).

## Co se stalo s C (finální, po opravě)

**5 skriptů smazáno** — potvrzeno, že 100 % (nebo skoro 100 %) checků mířilo
na UI, které v `src/` nemá a nikdy nemělo obdobu:
- `verify-ui-visual-system.mjs` — Playwright E2E nad Next.js dev serverem
  (`__NEXT_DATA__`, `npm run start`), navíc potvrzeně nahrazen živým
  `scripts/e2e-visual-system-review.mjs`.
- `verify-profile-layout-focus.mjs` — Playwright E2E nad stejným mrtvým
  Next.js předpokladem + CSS detaily dávno smazané stránky.
- `verify-profile-weekly-days-modern-ui.mjs` — celé o "weekly accordion"
  layoutu (kompaktní dnešek + rozbalitelný týden v jednom `PlanViewer`);
  živá appka je záložková (`NavigationTabs.tsx`), ne accordion.
- `verify-profile-no-sales-upsell.mjs` — kontrolovalo, že profil NEobsahuje
  mrtvou komponentu (`ProfileContinuationUpsell`/`ProgramVariantsSection`),
  která dnes nikde neexistuje ani jako riziko.
- `verify-program-variants-section.mjs` — mířil na `components/`/`pages/`
  BEZ `_legacy-next` prefixu, tedy strukturu mrtvou ještě dřív než zbytek.

**18 skriptů přepsáno**, ověřeno PASS (nebo A\* s nahlášeným pre-existujícím
FAILem), živé zdroje beze zbytku `_legacy-next` (jen `verify-withings-profile-
visibility.mjs` a `verify-workout-restore.mjs` zůstávají záměrně nedotčené,
viz níž):
`verify-exercise-integrity.mjs`, `verify-macro-kcal-consistency.mjs`,
`verify-paid-membership-gate.mjs`, `verify-workout-muscle-selection.mjs`,
`verify-workout-replacement-actions.mjs`, `verify-workout-exercise-copy.mjs`,
`verify-profile-kcal-consistency.mjs`, `verify-profile-macro-chart.mjs`,
`verify-profile-beta-ux.mjs`, `verify-training-environment-strictness.mjs`,
`verify-email-cta-profile-access.mjs`, `verify-product-consistency.mjs`,
`verify-birthdate-persistence.mjs`, `verify-withings-integration.mjs`,
`verify-withings-widget-ux.mjs`, `verify-profile-today-ux.mjs`,
`verify-profile-real-user-bugfixes.mjs`, `verify-progress-integrity.mjs`.

Odpovídající `npm run verify:*` záznamy pro těch 5 opravdu smazaných scriptů
odstraněny z `package.json`; záznamy pro těch 18 přepsaných zůstaly (skripty
dál existují, jen s živým obsahem).

**2 skripty ponechány nedotčené**, i když dnes také padají na `_legacy-next`
čtení — jsou explicitně vyhrazené pro Blok 4 a jejich oprava tam patří:
`verify-withings-profile-visibility.mjs` (fix #2 — viditelnost sekce),
`verify-workout-restore.mjs` (fix #3 — úklid testovacích účtů).

## Nesrovnalosti s hinty ze zadání

Zadání odhadovalo `db-schema-contract`, `start-templates-catalog`,
`recipe-from-catalog`, `exercise-integrity`, `gluten-free-gate`,
`macro-kcal-consistency` jako kandidáty na A. `macro-kcal-consistency`
kandidátem skutečně je (potvrzeno, viz tabulka) — první průchod ho omylem
smazal beze zmínky, teď opraveno. `exercise-integrity` je taky A (první
průchod ho smazal celý kvůli 3 řádkům z 172, teď přepsáno). Zbylé čtyři
(`db-schema-contract`, `start-templates-catalog`, `recipe-from-catalog`,
`gluten-free-gate`) ve skutečnosti čtou `SUPABASE_SERVICE_ROLE_KEY` nebo
(`recipe-from-catalog`) volají běžící `BASE_URL` přes `fetch` — bez nich buď
spadnou, nebo se přeskočí. Zařazeny do B.

## Bezpečnostní nález (mimo rozsah tohoto bloku, nahlášeno)

`scripts/verify-migration.mjs` měl v kódu natvrdo zapsaný Supabase Personal
Access Token jako výchozí hodnotu `process.argv[2] || '...'`. Skript i
nadále funguje bez argumentu, tedy s tím tokenem. Token nebyl z tohoto
souboru odstraněn ani přepsán (mimo rozsah Bloku 2), ale je potřeba ho
rotovat a nahradit čtením z env proměnné — `verify-migration-v2.mjs` vedle
něj to už dělá správně (`process.argv[2]`, žádný default).

## Tabulka (74 skriptů)

| Script | Skupina | Důvod | Owner |
|---|---|---|---|
| verify-active-plans-catalog-names.mjs | B | čte `SUPABASE_SERVICE_ROLE_KEY` | Honza |
| verify-agent-simple-meal-planner.mjs | A* | bez sítě/klíče, ale DNES ČERVENÝ — „expected 4 meals/day, got 5", nesouvisí s úklidem | Honza |
| verify-ai-instruction-standards.mjs | A* | bez sítě/klíče, DNES ČERVENÝ — `PROMPT_VERSION` pin (10 vs. čekáno 9), potřebuje jen bump konstanty | Honza |
| verify-beta-cohort-ops.mjs | B | service_role + síť | Honza |
| verify-beta-email-automation.mjs | B | service_role + síť | Honza |
| verify-beta-feedback.mjs | B | service_role + síť | Honza |
| verify-birthdate-persistence.mjs | **A** | přepsáno na StartRegistrace.tsx + živé api/lib, dnes PASS (+ pinnutý GAP: birth_date se v profilu needituje) | CI |
| verify-catalog-candidate-supply.mjs | B | service_role | Honza |
| verify-coach-cron.mjs | B | síť (cron endpoint) | Honza |
| verify-coach-fallback.mjs | B | síť | Honza |
| verify-cookable-discrete-amounts.mjs | B | service_role | Honza |
| verify-daily-activation.mjs | B | service_role + síť | Honza |
| verify-db-schema-contract.mjs | B | service_role (má `SKIP` fallback bez klíče, ale bez klíče nic neověří) | Honza |
| verify-dietary-exclusions.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-email-and-recipe-content.mjs | B | síť | Honza |
| verify-email-config.mjs | **A** | bez sítě (config-only mód), dnes PASS | CI |
| verify-email-cta-profile-access.mjs | **A** | přepsáno — bezpečnyRedirect/auth guard mají pokrytí jinde (routing.test.ts), zbytek byla živá lib/siteUrls.js logika, dnes PASS | CI |
| verify-email-visual-consistency.mjs | B | síť | Honza |
| verify-env-required.mjs | B | service_role | Honza |
| verify-exercise-assets.mjs | A* | bez sítě/klíče, DNES ČERVENÝ — chybí položka v registru + „replace-workout must import workoutTemplates" | Honza |
| verify-exercise-integrity.mjs | **A** | přepsáno (jen 3 z ~30 kontrol mířily na PlanViewer, zbytek je lib/exerciseCanonicalMap.js), dnes PASS | CI |
| verify-exercise-registry.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-footer-legal-links.mjs | **A** | přepsáno na `lib/pravniOdkazy.js` + `UcetASpravaSection.tsx`, dnes PASS | CI |
| verify-gluten-free-gate.mjs | B | čte `SUPABASE_SERVICE_ROLE_KEY` (zadání čekalo A) | Honza |
| verify-google-calendar-config.mjs | **A** | bez sítě (jen env přítomnost), dnes PASS | CI |
| verify-import-gate.mjs | B | síť | Honza |
| verify-ingredient-aliases.mjs | B | service_role | Honza |
| verify-lifecycle-emails.mjs | **A** | bez sítě/klíče, dnes PASS | CI |
| verify-macro-kcal-consistency.mjs | **A** | přepsáno (1 z 15 kontrol mířila na MacroRatioChart, zbytek živá lib/macroKcalConsistency.js), dnes PASS | CI |
| verify-meal-replacement-actions.mjs | **A** | přepsáno na `RecipeModal.tsx`, dnes PASS (+ pinnutý GAP: chybí UI pro pin-next-week) | CI |
| verify-migration-v2.mjs | B | síť + PAT jako CLI argument (bez defaultu — v pořádku) | Honza |
| verify-migration.mjs | B | síť + **natvrdo zapsaný PAT jako default** — bezpečnostní nález, viz výš | Honza |
| verify-openai-config.mjs | B | síť | Honza |
| verify-paid-membership-gate.mjs | **A\*** | přepsáno (jen 2 z ~50 kontrol mířily na profil.js, zbytek živé api/lib), dnes ČERVENÝ — 2 pre-existující FAILy v membershipRegistration.js (viz výš), nesouvisí s úklidem | Honza |
| verify-paid-path.mjs | B | service_role + prohlížeč + síť | Honza |
| verify-plan-kcal-roundtrip.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-plan-meals-against-catalog.mjs | B | service_role | Honza |
| verify-plan-quality-invariants.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-product-consistency.mjs | **A** | zkráceno na pricing.ts (zbytek mířil na marketing landing page, samostatný repo/deploy), dnes PASS | CI |
| verify-product-events.mjs | B | service_role + síť | Honza |
| verify-profile-beta-ux.mjs | B | přepsáno (habit labels na živý lib/habits.js, beta sekce smazána — nemá živý ekvivalent), ale plná hodnota vyžaduje service_role (vytváří/maže test účet) | Honza |
| verify-profile-kcal-consistency.mjs | **A\*** | přepsáno (1 z 12 kontrol mířila na ProfileTodayPanels), dnes ČERVENÝ — 1 pre-existující FAIL v mealNutritionDisplay.js (viz výš), nesouvisí s úklidem | Honza |
| verify-profile-macro-chart.mjs | **A** | přepsáno (12 z 24 kontrol mířilo na mrtvý MacroRatioChart, ten nemá živý ekvivalent — smazány; zbytek živá lib logika), dnes PASS | CI |
| verify-profile-real-user-bugfixes.mjs | **A** | zkráceno na živé api/lib (accordion/handler-jména byly o mrtvém PlanVieweru), dnes PASS (+ pinnutý GAP: dýchání/tempo) | CI |
| verify-profile-today-ux.mjs | **A** | zkráceno na 1 živou kontrolu (mealRecipeDisplay), zbytek byl o mrtvém accordion layoutu, dnes PASS | CI |
| verify-profile-weight-consistency.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-progress-integrity.mjs | **A** | přepsáno (lib/progressIntegrity.js zůstává, čistá funkce), dnes PASS (+ pinnutý velký GAP: celá Progress sekce nemá UI) | CI |
| verify-recipe-from-catalog.mjs | B | volá `fetch` na běžící `BASE_URL` (zadání čekalo A) | Honza |
| verify-registration-email-visual-consistency.mjs | B | service_role + prohlížeč | Honza |
| verify-run-coach-scheduler.mjs | B | síť | Honza |
| verify-security-headers.mjs | B | síť (HTTP hlavičky běžícího serveru) | Honza |
| verify-simple-meals.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-simple-recipe-detail-hardening.mjs | B | síť | Honza |
| verify-simple-start-meals.mjs | A* | bez sítě/klíče, DNES ČERVENÝ — fallback oběd 653 kcal neodpovídá očekávání, možná stará knihovna receptů | Honza |
| verify-start-calorie-consistency.mjs | A* | bez sítě/klíče, DNES ČERVENÝ (61 FAIL) — sledovaný, otevřený nález na `feat/vysokokaloricke-porce`, přehodnotit po mergi | Honza |
| verify-start-catalog-resolve-b1.mjs | B | service_role | Honza |
| verify-start-checkout-preview.mjs | B | service_role + síť; vytváří reálné účty bez úklidu — cíl Bloku 4 fixu #3 | Honza |
| verify-start-meal-variability.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-start-meals-library-only.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-start-templates-catalog.mjs | B | čte `SUPABASE_SERVICE_ROLE_KEY` (zadání čekalo A) | Honza |
| verify-stripe-tier-mapping.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS (jen WARN na chybějící env) | CI |
| verify-supabase-readonly.mjs | B | service_role + síť | Honza |
| verify-t8-t9-dev.mjs | B | service_role + síť | Honza |
| verify-training-environment-strictness.mjs | **A** | přepsáno (5 z ~50 kontrol mířilo na _legacy-next, zbytek živá lib/trainingEnvironment.js), dnes PASS (+ pinnutý GAP: odznak prostředí) | CI |
| verify-varianty-cviku.mjs | B | service_role (odpovídá hintu ze zadání) | Honza |
| verify-weekly-structured-source.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-withings-integration.mjs | B | Playwright prohlížeč + service_role, navíc `ensureLocalServer` počítá s Next.js dev serverem (rozbité, mimo rozsah Bloku 2 opravit) — statická sekce opravena na živý BodyCompositionSection.tsx | Honza |
| verify-withings-profile-visibility.mjs | C — nedotčeno | čte smazané `_legacy-next`, dnes padá; oprava patří do Bloku 4 fixu #2, záměrně ponecháno | Honza |
| verify-withings-widget-ux.mjs | B | Playwright prohlížeč + stejný rozbitý Next.js server předpoklad — statická sekce přepsána na živý PropojenaZarizeniSection.tsx s pinnutým GAPem (shouldShowWithingsSection chybí, viz Blok 4 fix #2) | Honza |
| verify-workout-exercise-copy.mjs | **A** | přepsáno (2 z 9 kontrol mířily na mrtvý sdílený formatter — smazán, žádný živý ekvivalent), dnes PASS | CI |
| verify-workout-muscle-selection.mjs | **A** | přepsáno (modal, na který mířil, se nikdy nepostavil — potvrzeno komentářem v živém ZmenitDnesniTrenink.tsx), dnes PASS | CI |
| verify-workout-publishable-gate.mjs | **A** | bez sítě/klíče/prohlížeče, dnes PASS | CI |
| verify-workout-replacement-actions.mjs | **A** | přepsáno na `WorkoutSection.tsx`'s handleVymenitCvik, dnes PASS | CI |
| verify-workout-restore.mjs | C — nedotčeno | čte smazané `_legacy-next` a navíc service_role/síť; vytváří reálné účty bez úklidu — cíl Bloku 4 fixu #3, záměrně ponecháno | Honza |

## Součty

- **A (do CI)**: 29
- **A\* (patří sem svým tvarem, ale dnes červené z produktových důvodů —
  nezahrnuto do Bloku 3, dokud to Honza nevyřeší)**: 7
- **B (ruční audit)**: 36
- **C (smazáno)**: 5 (+ 18 zachráněno přepisem, viz oprava výš — celkem 23
  bylo v prvním, chybném průchodu smazáno)
- **C (ponecháno nedotčené, vyhrazeno pro Blok 4)**: 2

Celkem řádků v tabulce: 74 (29+7+36+2). 5 smazaných skriptů nemá řádek —
79 skriptů na začátku Bloku 2, 74 na konci.
