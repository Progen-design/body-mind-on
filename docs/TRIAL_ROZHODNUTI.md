# Trial: podklad pro rozhodnutí (5.7)

Změřeno 28. 8. 2026. Rozhoduje Honza, nic z toho není naimplementované.

## 1. Kde je brána

`lib/planGenerationGate.js:69` (`canRunPlanTask`), čisté pravidlo v
`lib/planRenewalRules.js:100` (`canRenewPlanForMembership`). Držet v souladu,
UI čte to druhé.

Blokuje šest typů úloh — `initial_plan`, `adjust_plan`, `reduce_training_load`,
`weekly_plan_update`, `next_week_plan`, `regenerate_plan` — a navíc cokoli
s `agent_slug = 'trainer'`. Během trialu projde jen `initial_plan`, a to jen
jednou (druhý spadne na `start_trial_initial_plan_already_exists`).

Volá se ze dvou míst: `aiScheduler.js:83` a `createAITasksFromDecisions.js:43`.
Tedy **jen cesta přes scheduler**.

## 2. Co uživatel vidí

**Starý propadlý plán, bez jakéhokoli označení.** Ne prázdno, ne paywall.

- `TrialExpiredPaywall`, `PlanLockedPaywall`, `TrialEndingSoonBanner` a
  `TrialPlanScopeNote` existují **jen v `_legacy-next/`**, který je
  v `.vercelignore` — do nasazené aplikace se nedostanou vůbec.
- Živá SPA nemá slovo „paywall", „předplatné" ani „trial" nikde v komponentách.
- `api/profile.js` počítá `plan_state = 'expired_upgrade'` a posílá
  `plan_renewal` i `plan_expired`. **SPA to nečte** — `plan_state` se v `src/`
  vyskytuje jednou, a to při registraci.
- `vyberPlan()` v `src/data/adaptery.ts`: když žádný plán nepokrývá dnešek,
  vrátí větev `skoncene`, tedy poslední skončený plán, a ten se vykreslí jako
  běžný jídelníček. `platnostPlanu()` (`'skoncil'`) je exportovaná, ale nikdo
  ji nevolá.

Backend má pro paywall všechno připravené, frontend to zahazuje.

## 3. Kolik by stál zamčený týden

**Za recepty nula.** Plán se skládá deterministicky z katalogu; sync GPT je za
`OPENAI_PLAN_ENABLED`, které je defaultně `false`. Marginální cena dalšího
týdne je jen čas databáze.

Kapacita katalogu na to je: 171 snídaní, 172 svačin, 215 obědů, 194 večeří
aktivních.

Endpoint na to **už existuje** — `api/generate-plan-next-week.js`
(`mealsOnly`, `skipEmail`). Není napojený na SPA a používá **jinou bránu**:
`requireActiveMembership`, která běžící trial pouští. Tedy jiné pravidlo než
scheduler.

Práce: odemknout typ úlohy v bráně (dva `return`y), napojit UI a dodělat
zamčené zobrazení. Odhad půl dne, největší kus je UI.

Rizika:
- Dvě různá pravidla pro tutéž otázku (`canRunPlanTask` vs
  `requireActiveMembership`) — když se změní jen jedno, rozejdou se.
- Zamčený obsah musí být zamčený i na API, ne jen skrytý v UI.
- Pestrost: trial by dostal druhý týden ze stejného katalogu, takže část jídel
  se bude opakovat.

## 4. Má trial uživatel data pro generátor

**Ano, u všech tří.** `body_metrics` existují, `goal` vyplněný
(2× `nabirani_svaly`, 1× `redukce`), kalorický cíl 2470 / 3012 / 3173, váha
i výška vyplněné. Nic se nemusí dopočítávat.

Jediné prázdné je `diet_type` (u všech čtyř účtů včetně platícího) — to ale
znamená „žádná preference", ne chybějící data; `bodyMetricsToPlanInput`
z toho udělá `standard`.

## Stav tří trialů

Nula ze tří konvertovalo.

| konec trialu | plán platil do | rozdíl |
|---|---|---|
| 9. 8. | 8. 8. | −1 den |
| 20. 8. | 23. 8. | +3 dny |
| 27. 8. | 26. 8. | −1 den |

Dvěma ze tří skončil plán den před koncem trialu. Poslednímu (konec 27. 8.)
zůstal plán s `is_active = true`, přestože platnost vypršela — vidí ho tedy
dál jako aktuální.
