# Zadání: kaloricky vědomý scheduler (PR 2 + PR 3 dohromady)

Datum: 2026-09-17
Stav v repu: PR 2 (vysokokalorické varianty) je **v working tree, nekomitnutý**. Nekomituj ho
samostatně — jde ven až s tímhle.

## Proč se to slučuje

Ověřil jsem PR 2 nezávisle plnou pipeline (`buildSimpleStartMealSkeleton` →
`resolveSimpleStartLocalSlot` → `fillDayCaloriesByAddingLibraryMeals`) na profilech
1600–3841 kcal. Výsledek:

Vysoké cíle (2000–3841, 49 dní) se zlepšily:
- dní pod −15 % cíle: 3 → **1**
- jídel s multiplikátorem mimo 0,85–1,15: 186 → **157**

Nízké cíle (1600–2400, 35 dní) se rozbily:
- dní nad +15 % cíle: 1 → **6**
- nejhorší den: +17 % → **+45 %**

Konkrétně, cíl 1600 kcal, den 4:

```
lunch    Těstoviny s kuřetem, velká porce   1009 kcal
dinner   Těstoviny s kuřetem                 640 kcal
                                    celkem  2323 kcal na cíl 1600  (+45 %)
```

Příčina: `pickTemplateForSlot` rotuje pozičně `(dayIndex*5 + mi*3 + offset) % pool.length`
a kalorie neřeší vůbec. Dokud byla nejtěžší šablona 640 kcal, nevadilo to. S šablonou
za 1009 kcal to vadí.

Umístění nových šablon na začátek polí byl správný instinkt (držet
`verify-start-meal-variability` zelený), ale je to ladění pozičního hashe — přesunulo to
rozbití z profilu, který ten skript testuje (2700 kcal), na profily, které netestuje.
Po tomhle PR má být pozice v poli bezvýznamná. Ten komentář o pozici u šablon smaž.

## A. Kaloricky vědomý výběr šablony

`pickTemplateForSlot(pool, dayIndex, mi, exclusions, mealType, usedCounts)` dostane navíc
`slotTarget` (kcal pro ten slot; volající ho už má z `slotTargetKcal`).

Pro každou šablonu spočítej potřebný multiplikátor:

```js
const needed = slotTarget / templateKcal;
```

Tolerance se bere **z `START_MIN_SCALE` / `START_MAX_SCALE`** v
`lib/nutrition/portionScaling.js`, ne z natvrdo napsané 1.15. Tři skupiny:

1. **`needed` v `[START_MIN_SCALE, START_MAX_SCALE]`** — sedne přesně. Primární skupina.
2. **`needed > START_MAX_SCALE`** — šablona je na slot malá. Přijatelné jako záloha:
   den skončí pod cílem, což je poctivé, a `fillDayCaloriesByAddingLibraryMeals` dokáže
   přidat jídlo.
3. **`needed < START_MIN_SCALE`** — šablona je na slot velká. **Nikdy nevybírat.**
   Zmenšit pod 0,85 se nesmí, takže by jídlo cíl přestřelilo — přesně případ +45 % výš.

Pořadí: zkus skupinu 1, při prázdné skupinu 2. Skupina 3 se nepoužije nikdy. Když jsou
1 i 2 prázdné (nemělo by nastat), vrať `null` a nech volajícího propadnout na dosavadní
cestu — **žádné tiché propadnutí na `pool[0]`**, ten komentář na řádku ~247 platí dál.

## B. Rotace uvnitř skupiny zůstává poziční

Ve vybrané skupině rotuj **stejným pozičním vzorcem** nad odfiltrovaným seznamem.
**Neřaď podle toho, co sedne nejlíp** — sortování podle nejmenší odchylky je přesně to,
co v #237 zafixovalo dvoucyklus a co #238 opravovalo. Kandidáti se filtrují, ne řadí.

`MAX_MEAL_USES_PER_WEEK` a `MIN_DISTINCT_BY_TYPE` nech, jak jsou, a aplikuj je až
na odfiltrovaném seznamu.

## C. Stejný základ jídla dvakrát za den

Samostatná vada, kterou kalorické filtrování nevyřeší: den 4 dostal „Těstoviny s kuřetem,
velká porce" na obědě a „Těstoviny s kuřetem" na večeři. `MIN_DISTINCT_BY_TYPE` hlídá
rozmanitost v rámci typu, takže duplikace napříč typy propadne.

Přidej `baseDishKey(title)` — normalizovaný název bez velikostní přípony
(`, velká porce` a podobné). V rámci jednoho dne nevybírej šablonu, jejíž `baseDishKey`
už ten den padl. **Měkké omezení**: když by to skupinu vyprázdnilo, pusť to a vezmi
duplikát — lepší duplikát než `null`.

## D. Gate skripty — chybí nízké cíle

Tohle je důvod, proč to zelené testy nezachytily. Testují jen:

- `verify-start-calorie-consistency.mjs` — 3300, 2200, 3300 bez sýra
- `verify-start-meal-variability.mjs` — 2700

Žádný profil pod 2200 kcal. Přitom hubnutí a udržování v pásmu 1600–2200 je největší
segment. Doplň:

1. Do `verify-start-calorie-consistency.mjs` profily **1600, 1800, 2000** kcal
   (`goal: 'hubnuti'`, `weight_kg: 80`).
2. V témže skriptu zpřísni horní kontrolu: dnes je `sum > round(dayTarget*1.15) + 50`.
   Ta rezerva 50 kcal tam nemá co dělat — srovnávej proti `round(dayTarget * 1.15)`.
   Nahlas, kolik FAILů z toho zpřísnění vyjde, ať vím, co je nové a co jen odhalené.
3. Do `verify-start-meal-variability.mjs` přidej druhý profil na **1800** kcal.
4. Unit test, který přišpendlí mechanismus: šablona za 1009 kcal se **nesmí** vybrat
   pro slot s cílem odpovídajícím dni 1600 kcal. Ne konkrétní názvy jídel — mechanismus,
   ať test přežije přidání dalších receptů.
5. Unit test na `baseDishKey`: „Těstoviny s kuřetem" a „Těstoviny s kuřetem, velká porce"
   mají stejný klíč.

## E. Co nechat být

- Makra 6 nových receptů jsem přepočítal, Atwater drží přesně u všech šesti. Neměň je.
- `MIN_DISTINCT_BY_TYPE`, `MAX_MEAL_USES_PER_WEEK` — beze změny.
- Neřeš makra 30 starších receptů, které Atwateru nesedí (nejhorší −8,8 %). To je
  samostatný PR, mám ho v plánu.
- Migrace párování cviků — samostatný PR, migraci pouštím já.

## F. Co nahlásit

- `npm run test:unit`, `test:src`, typecheck, lint, lint:copy, build
- `verify-start-calorie-consistency` — počet FAILů, a rozpad: co ubylo díky
  kalorickému schedulingu a co přibylo díky zpřísnění o těch 50 kcal
- `verify-start-meal-variability`, `verify-start-templates-catalog`,
  `verify-dietary-exclusions`, `verify-meal-replacement-actions`
- Tabulku odchylek dne od cíle pro profily 1600, 1800, 2000, 2200, 2400, 2800, 3300,
  3600, 3841 — všech 7 dní, plná pipeline včetně honesty fill. Chci vidět, že žádný
  den není nad +15 % a kolik dní zůstává pod −15 %.

## G. Pravidla

- **Nekomituj, neotvírej PR, neměř produkci, nepouštěj migrace.** Nahlas a čekej.
- Dokumentaci ber jako součást změny: `docs/AUDIT_PORCE_VYSOKE_KCAL_2026-09-17.md`
  v working tree rozšiř o kalorický scheduling, ať to je jeden souvislý zápis.
