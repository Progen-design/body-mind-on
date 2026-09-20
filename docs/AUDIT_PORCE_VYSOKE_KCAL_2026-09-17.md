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

## Aktualizace: PR 2 (vysokokalorické varianty) samostatně je regrese

PR 2 doplnil 6 vysokokalorických šablon (breakfast/lunch/dinner, nejvyšší
1009 kcal). Nezávislé ověření na plné pipeli (`buildSimpleStartMealSkeleton`
→ `resolveSimpleStartLocalSlot` → `fillDayCaloriesByAddingLibraryMeals`)
na profilech 1600–3841 kcal ukázalo:

- **Vysoké cíle (2000–3841, 49 dní) se zlepšily**: dní pod −15 % cíle
  3 → 1; jídel s multiplikátorem mimo 0,85–1,15 186 → 157.
- **Nízké cíle (1600–2400, 35 dní) se rozbily**: dní nad +15 % cíle
  1 → 6; nejhorší den +17 % → **+45 %**.

Konkrétně cíl 1600 kcal, den 4: oběd „Těstoviny s kuřetem, velká porce"
(1009 kcal) + večeře „Těstoviny s kuřetem" (640 kcal) = 2323 kcal na cíl
1600 (+45 %). Příčina: `pickTemplateForSlot` rotovala čistě pozičně a
kalorie neřešila vůbec — dokud byla nejtěžší šablona 640 kcal, nevadilo to.

PR 2 se proto **nemergoval samostatně** — jde ven společně s kaloricky
vědomým schedulerem (PR 3) v jednom PR.

## Oprava: kaloricky vědomý `pickTemplateForSlot`

Rozděluje kandidáty (stejná poziční rotace, stejné `exclusions` a
`MAX_MEAL_USES_PER_WEEK` jako dřív) podle potřebného multiplikátoru
`slotTarget / templateBaseKcal` do tří skupin: uvnitř
`[START_MIN_SCALE, START_MAX_SCALE]` (sedí, primární), nad `START_MAX_SCALE`
(šablona je malá — přijatelná záloha, den skončí pod cílem a
`fillDayCaloriesByAddingLibraryMeals` ho poctivě dorovná), a pod
`START_MIN_SCALE` (šablona je velká — **nikdy nevybrat**, přesně případ
+45 % výš). Uvnitř vybrané skupiny se pořád rotuje POZIČNĚ, ne podle nejlepší
shody — řazení podle odchylky je past z #237/#238 (deterministicky nejbližší
kus pořád dokola).

Přidán i `baseDishKey` — měkké omezení proti stejnému základu jídla dvakrát
za den v jiné velikosti („Těstoviny s kuřetem, velká porce" na oběd a
„Těstoviny s kuřetem" na večeři téhož dne).

`templateBaseKcal` bere přednostně kcal z knihovního receptu
(`SIMPLE_START_RECIPES`), ne z `fallback_meal_template.kcal` — je to přesně
číslo, které se doopravdy škáluje (PR 1).

## Zpřísnění kontroly (`verify-start-calorie-consistency.mjs`)

Horní kontrola dřív měla `+ 50` kcal rezervu bez opory v ničem
(`sum > round(dayTarget * 1.15) + 50`). Rozpad FAILů (42 dní, 6 profilů,
plná pipeline):

- Původní 3 profily (3300, 2200, cheese excluded 3300) beze změny: **26**
  FAILů, všechny typu „mult outside 0,85–1,15" — beze změny tímhle PR.
- Přidání profilů 1600/1800/2000 (bod D.1), se STAROU `+ 50` rezervou:
  **+10** FAILů (26 → 36) — to je nález bodu D.1: nízké cíle dřív skript
  vůbec netestoval.
- Zpřísnění `+ 50` rezervy na samotných 6 profilech (bod D.2): **+1** FAIL
  (36 → 37) — přesně jeden den (1800 kcal, den 5: součet 2109 proti stropu
  2070).

Ten jeden FAIL ze zpřísnění je existující chování
`fillDayCaloriesByAddingLibraryMeals` (dorovnává CELÝM knihovním jídlem, ne
po částech, takže občas přestřelí o pár desítek kcal blízko stropu) — ověřeno
na baseline PŘED PR 2/3 se stejným mechanismem a horším celkovým skóre
(74 FAILů na stejných 6 profilech). Není to regrese tohohle PR, je to
jemnost `fillDayCaloriesByAddingLibraryMeals`, kterou tenhle scheduler
neřeší — samostatná práce, ne vedlejší efekt.

## Stav po opravě (plná pipeline, 1600–3841 kcal, všech 7 dní)

| cíl kcal | dní nad +15 % | dní pod −15 % | rozsah odchylek |
|---|---|---|---|
| 1600 | 0 | 0 | +4,3 % až +10,4 % |
| 1800 | 1 | 0 | +0,5 % až +17,2 % |
| 2000 | 0 | 0 | −2,3 % až +13,0 % |
| 2200 | 0 | 0 | −4,8 % až +5,3 % |
| 2400 | 0 | 0 | −4,9 % až +13,5 % |
| 2800 | 0 | 0 | −11,4 % až +5,6 % |
| 3300 | 0 | 0 | −4,9 % až +6,0 % |
| 3600 | 0 | 2 | −26,0 % až +0,8 % |
| 3841 | 0 | 3 | −30,7 % až −0,4 % |

Žádný den nikde nepřestřelí +15 % kromě toho jednoho zmíněného výše. Dny pod
−15 % zůstávají jen na extrémních cílech (3600+ kcal) — to je pořád strop
kalorického rozsahu knihovny, ne chyba schedulingu; `fillDayCaloriesByAddingLibraryMeals`
tam den poctivě nechá pod cílem, místo aby vymyslel kalorie navíc.

## Aktualizace 2026-09-17 (druhá): mapa děr a jejich zavírání

Ten jeden zbylý FAIL výš (1800 kcal, den 5, 2109 nad stropem 2070) se ukázal
být JINDE, než jsem čekal — ne v `pickTemplateForSlot`, ale v
`fillDayCaloriesByAddingLibraryMeals` (`lib/nutrition/calorieHonesty.js`):
add-loop přidával jídlo, dokud `sum < 95 % cíle`, bez horní pojistky, takže
u velkého deficitu (`preferDense` řadí podle NEJVĚTŠÍCH kalorií) mohl den
přestřelit strop. **Opraveno**: přidané jídlo nesmí dostat den nad
`round(target * HONEST_MAX_SCALE)`; když by přestřelilo, zkusí se zmenšit na
`HONEST_MIN_SCALE..1,0`, jinak se přeskočí a zkusí další kandidát; když se
nevejde nikdo, den zůstane poctivě pod cílem.

### Mapa děr (bod B, `verify-start-template-coverage.mjs`)

Nový gate spočítal pro každý balík × typ jídla × 12 kalorických cílů
(1400–3900), kolik šablon se vejde do `[START_MIN_SCALE, START_MAX_SCALE]`
a jestli jich je dost na týden (`MAX_MEAL_USES_PER_WEEK` opakování). Na
startu bodu B: **131 FAIL ze 144 kombinací** — knihovna měla díry prakticky
všude, nejhůř na `standard`/`vegetarian` svačinách (0 sedících už na 1400
kcal) a v celém `vegan` balíku.

### Co se doplnilo (bod C, podle priority)

- **`standard` svačiny** — 27 nových šablon (130–470 kcal, skutečná různá
  jídla, ne velikostní varianty). **Všech 12 cílů teď OK.**
- **`vegetarian` svačiny** — 16 z nich (vegetariánsky bezpečné) sdílené do
  `vegetarian` balíku stejným titulem/receptem. 3 z 12 cílů OK (bylo 0).
- **`standard` + `vegetarian` breakfast** — 6 nových šablon (350–710 kcal,
  do obou balíků). Díra byla na KAŽDÉM cíli, ne jen na okrajích — gate
  z bodu B to odhalil až po měření, ne z odhadu.
- Makra u všech nových šablon: `calories` = `4*protein_g + 4*carbs_g +
  9*fat_g` přesně, dopočteno ze skutečných surovin (tabulka je v historii
  PR, ne opsaná sem kvůli rozsahu — 51 nových receptů).

**Co se NEDOTKLO** (mimo časový rozpočet týhle dávky, viz níž): `standard`
lunch/dinner nad ~2400 kcal, `vegetarian` lunch/dinner (zůstává 4 šablony),
celý `vegan` balík (2/2/3/2 šablon na typ — nejtenčí ze všech, 0 uživatelů
zatím, ale první vegan dostane rozbitý plán).

### Stav gate z bodu B po týhle dávce

**107 FAIL ze 144** (bylo 131) — `standard` snack je uzavřený celý (0 FAIL
z 12), `standard`+`vegetarian` breakfast výrazně líp (z 24 FAIL na 6),
`vegetarian` snack částečně (z 12 FAIL na 9). `vegan` breakfast zůstal
nedotčený (pořád 12/12 FAIL — 2 šablony na typ, nejtenčí ze všech).
Zbytek (`vegetarian`/`vegan` lunch/dinner, `standard` lunch/dinner nad
2400) čeká na další kolo — je to většina zbývající práce, ne detail.
`verify-start-template-coverage` proto **zůstává FAIL** — je to gate, ne
nahlášený stav, takže lže o hotovosti, dokud se nedodělá zbytek mapy.

### Makra 63→71 receptů (bod D)

Všech **34 z 63** existujících receptů nesplňovalo přesnou Atwater shodu
(nejhorší −8,8 % u „Tuňákový salát s pečivem"). Makra u 24 starších (před
PR 1/2) receptů jsem přepočítal ze skutečných surovin (stejná gramáž,
neměněná — jen čísla). U 10 novějších (PR 1/2, makra už dopočtená správně)
šlo jen o zaokrouhlovací posun v `calories` — dorovnáno na přesnou Atwater
hodnotu ze stejných maker. **Všech 71 receptů v knihovně je teď přesně
Atwater** — tvrdý gate na to je v `verify-macro-kcal-consistency.mjs`.

### Stav po celé dávce (plná pipeline, 1400–3841 kcal, 7 dní)

**`standard`: 0 dní nad +15 %, 0 dní pod −15 %, napříč všemi 10 cíli.**

**`vegetarian`: 0 dní nad +15 % všude; pod −15 % od 2800 kcal** (1 den),
zhoršuje se do 3841 kcal (3 dny) — přímý důsledek toho, že lunch/dinner
u vegetariánů zůstaly nedotčené (4 šablony na typ, žádná nová). Poctivé
(den pod cílem, ne přestřelený), ale ne hotové.

`verify-start-meal-variability` (2700/1800/1400 standard + 2000 vegetarian)
je **PASS**. `verify-start-calorie-consistency`: **34 FAIL, 0 „far above
target"** (cíl splněn), zbylých 34 je typ „mult outside 0,85–1,15" — existující
jemnost `fillDayCaloriesByAddingLibraryMeals` na `1600`/`2000`/`2200`/`3300`
a `cheese excluded 3300`, ne regrese týhle dávky (ověřeno na baseline před
touhle prací: tam bylo na stejných profilech FAILů víc, ne míň).
