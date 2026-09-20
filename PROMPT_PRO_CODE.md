# Zadání: zavřít kalorické díry v pásmu, kde jsou reální uživatelé

Datum: 2026-09-17
Větev: `feat/vysokokaloricke-porce` — tvoje rozdělaná práce (PR 2 + kaloricky vědomý
scheduler + horní pojistka v add-loopu) v working tree **zůstává**. Tohle na ni navazuje.

**Rozsah je schválně úzký.** Vegan pack, cíle nad 2400 kcal, přepočet maker u starých
receptů a chybějící Spoonacular recepty se teď NEŘEŠÍ — je to na potom. Cílem je, aby
gate byly zelené a pásmo 1386–2400 kcal fungovalo.

---

## Proč to ještě není hotové

Poslední FAIL (`verify-start-meal-variability`, 1800 kcal den 5: 2109 nad stropem 2070)
není vada logiky. Rozebral jsem ten den až na sloty:

```
breakfast  cíl 360   Vejce s pečivem a zeleninou      439 kcal ×0.98
lunch      cíl 504   Rýže s vejcem a zeleninou        515 kcal ×0.95
dinner     cíl 432   Tvarohová miska                  431 kcal ×1.03
snack      cíl 252   Proteinový nápoj a banán         374 kcal ×0.89
snack      cíl 252   Ovesné vločky s tvarohem         415 kcal ×0.86
                                  součet 2174 → po zmenšení 2109, strop 2070
```

Obě svačiny jsou o ~100 kcal větší, než slot unese. Na cíl 252 kcal se z 11 svačin
ve `standard` poolu vejdou do pásma 0,85–1,15 jen **tři** (220, 233, 260). Ostatních
osm má 320–480. Při `MAX_MEAL_USES_PER_WEEK = 2` to dá 6 použití na týden, ale týden
potřebuje **14 svačinových slotů**. Od třetího dne je skupina 1 i 2 prázdná,
`pickTemplateForSlot` propadne na `if (candidates.length) return take(candidates)` —
kalorii neznající větev — a na slot 252 dá jídlo za 480.

Změřil jsem celý prostor. V pásmu, které nás teď zajímá:

- **`standard`, svačiny pod 2400 kcal** — na 1600 sedí **0 z 11**, na 1800 tři, na
  2000–2400 dvě. Týká se **23 z 30 uživatelů** (14 bez vybrané diety plus low_carb,
  lactose_free, gluten_free, other), cíle od 1524 kcal.
- **`vegetarian`, celé pásmo pod 2400** — pool má 5 snídaní, 7 svačin, **4 obědy,
  4 večeře**. Týká se **7 z 30 uživatelů**, cíle **1386–2320 kcal**. Druhá největší
  skupina.

Nejnižší reálný cíl je **1386 kcal**, tedy svačinový slot kolem 139 kcal. Nejmenší
svačina v jakémkoli poolu má 220.

---

## A. Propadová větev nesmí díru zakrývat

`pickTemplateForSlot` v `lib/services/simpleMealPlannerAgent.js`. Když jsou skupina 1
i 2 prázdné:

1. Postav kandidáty znovu **bez omezení `MAX_MEAL_USES_PER_WEEK`** a projeď je stejným
   kalorickým dělením. Třetí opakování sedící svačiny je lepší než den o 17 % vedle.
2. Když je i pak skupina 1 i 2 prázdná, vezmi kandidáta s **nejmenšími kaloriemi**
   (nejmenší přestřelení), ne prvního v rotaci.

Tohle řazení je **jen v degenerované větvi**, ne v normální cestě — dvoucyklus z #237,
který opravovalo #238, tím nevzniká. Napiš to do komentáře, ať to někdo příště
nezobecní.

Test, který přišpendlí mechanismus: pool, kde po vyčerpání limitu nezbude sedící
kandidát, nesmí vrátit jídlo mimo pásmo, když existuje sedící po uvolnění limitu.

---

## B. Gate na pokrytí poolu

Nový skript `scripts/verify-start-template-coverage.mjs`. Bez něj se díry vrátí jinde
a budeme je zase lovit po jedné.

Pro každý pack, typ jídla a cíl spočítá:

- `mealsPerDay` z `resolveMealsPerDay`, sloty z `mealSlotTypes`
- cíl slotu ze `slotTargetKcal`
- kolik šablon má `slotTarget / templateBaseKcal` v `[START_MIN_SCALE, START_MAX_SCALE]`
- potřebu na týden = (počet slotů toho typu za den) × 7
- kapacitu = sedících šablon × `MAX_MEAL_USES_PER_WEEK`

Rozsah teď:

- **FAIL** pro `standard` a `vegetarian` na cílech `[1400, 1600, 1800, 2000, 2200, 2400]`
- **jen výpis, ne FAIL** pro vyšší cíle a pro `vegan` — ať je vidět, jak na tom jsme,
  ale ať to teď neblokuje

Výstup ať je tabulka: pack, cíl, typ, cíl slotu, sedí/pool, potřeba, kapacita, chybí.
Konstanty ber importem (`START_MIN_SCALE`, `START_MAX_SCALE`, `MAX_MEAL_USES_PER_WEEK`),
ne přepisem — `MAX_MEAL_USES_PER_WEEK` kvůli tomu vyexportuj. Přidej skript do
`package.json`.

Rozšíření rozsahu na vyšší cíle a vegany je připravené na potom — nech to
zakomentované nebo za konstantou, ať se to dá zapnout jedním řádkem.

---

## C. Doplnit šablony a recepty, dokud není gate z bodu B zelený

Jen pásmo 1400–2400 kcal, packy `standard` a `vegetarian`. Podle měření je potřeba
zhruba tolik (ale řiď se gatem, ne mým odhadem):

- `standard` svačiny **130–330 kcal** — nejpalčivější, chybí ~6
- `standard` snídaně kolem **300–400 kcal** — chybí ~2
- `vegetarian` svačiny **130–330 kcal** — chybí ~6
- `vegetarian` snídaně, obědy a večeře v pásmu odpovídajícím cílům do 2400 — chybí
  ~2 snídaně, ~3 obědy, ~4 večeře

Pravidla pro každou položku, bez výjimky:

- Šablona v `START_MEAL_TEMPLATES` **a zároveň** knihovní recept
  v `lib/simpleStartRecipeLibrary.js` se **stejným názvem** a správným `meal_type`.
  Šablona bez receptu je přesně díra z PR 1.
- `calories` se musí přesně rovnat `4*protein_g + 4*carbs_g + 9*fat_g`. Makra
  dopočítej ze surovin, ne od oka.
- Skutečná česká jídla z běžně dostupných surovin. **Ne varianty téhož** — dvě
  velikosti jednoho jídla nepomůžou, `MIN_DISTINCT_BY_TYPE` je stejně odfiltruje.
- Kroky přípravy jako pole (`instructions`), ne slepený string — to byla chyba #234.
- Ve vegetariánském packu žádné maso a ryby. Ověř přes `verify-dietary-exclusions`,
  nespoléhej na oko.

---

## D. Co musí platit, než to nahlásíš

- `verify-start-template-coverage` — **PASS** v rozsahu z bodu B
- `verify-start-meal-variability` — **PASS**, rozšiř o profil **1400 kcal** a o jeden
  **vegetariánský** profil
- `verify-start-calorie-consistency` — nahlas počet FAILů (teď 37) a rozpad na
  „mult outside" vs „far above target". Cíl je **nula „far above target"**; počet
  „mult outside" ať jde dolů, nemusí být nula
- `verify-dietary-exclusions`, `verify-start-templates-catalog`,
  `verify-meal-replacement-actions` — PASS
- `test:unit`, `test:src`, typecheck, lint, lint:copy, build

A tabulka odchylky dne od cíle pro profily 1400, 1600, 1800, 2000, 2200, 2400 — všech
7 dní, plná pipeline včetně honesty fillu, zvlášť pro `standard` a `vegetarian`. Žádný
den nesmí být nad +15 %.

Do `docs/AUDIT_PORCE_VYSOKE_KCAL_2026-09-17.md` dopiš, co se doplnilo, a připoj mapu
pokrytí po změně včetně toho, co zůstává rozbité nad 2400 a u veganů — ať je jasné,
co je odložené a ne zapomenuté.

---

## E. Pravidla

- **Nekomituj, neotvírej PR, neměř produkci, nepouštěj migrace.** Nahlas a čekej.
- Nerozšiřuj rozsah. Vegan, cíle nad 2400, makra starých receptů a chybějící
  Spoonacular recepty teď ne — jsou to samostatné kusy na potom.
- Když narazíš na něco, co odporuje tomuhle zadání, řekni to — u „Jak na to" i
  u add-loopu jsi měl pravdu ty a já se mýlil. Radši spor než tiché obejití.
