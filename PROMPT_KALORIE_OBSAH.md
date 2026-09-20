# Doplnit šablony a recepty, aby byl `verify-start-template-coverage` zelený

Větev `feat/vysokokaloricke-porce`, už je rebasovaná na `main` (za #242, #243, #244).
Necommituj, nepushuj, neotvírej PR. Migrace nepouštěj — dělám je já.

## Kde jsme

Logika je hotová a ověřená:
- kaloricky vědomý `pickTemplateForSlot` včetně propadové větve (uvolnění
  `MAX_MEAL_USES_PER_WEEK`, pak nejmenší kandidát) — **funguje**
- `npm run check` **exit 0** po rebase
- `verify-start-meal-variability` **PASS** — den 5 na 1800 kcal už není pod cílem

Zbývá jediná věc: **obsah**. `verify-start-template-coverage` hlásí FAIL(107),
protože na spoustu kalorických pásem prostě není dost šablon, které by se do
pásma `[0,85 × base, 1,15 × base]` vešly. Žádné množství chytré logiky to
nespraví — chybí jídla.

## Krok 1: srovnat rozsah brány s tím, co skutečně řešíme

Ze 107 FAILů je většina mimo dohodnutý rozsah:
- **vegan** — 0 uživatelů, vědomě odloženo (`BMON_ODLOZENE_KALORIE_2026-09-17.md`)
- **cíle nad 2400 kcal** — taky vědomě odloženo

Brána, která je napořád červená, je brána, kterou si za týden všichni odvyknou
číst. To je přesně ten stav, který jsme uklízeli v #242.

Uprav `scripts/verify-start-template-coverage.mjs` tak, aby:
- **hard FAIL** byl jen pro `standard` a `vegetarian` v pásmu **1400–2400 kcal**,
- všechno ostatní (vegan, jakýkoli cíl nad 2400) bylo **WARN / report-only**,
  vypsané ve stejné tabulce, ale s vlastním souhrnným řádkem na konci ve tvaru
  `WARN mimo rozsah: <N> kombinací (vegan, cíle > 2400) — viz BMON_ODLOZENE_KALORIE_2026-09-17.md`,
- rozsah byl **jedna exportovaná konstanta** nahoře v souboru s komentářem PROČ,
  ne rozsypaná podmínka v těle skriptu. Až se vegan otevře, mění se jedno místo.

Toto není zametení pod koberec: odložené položky jsou zapsané v registru a
brána je nadál vypisuje. Jen nemaskují reálné díry těmi, které jsme se rozhodli
neřešit.

## Krok 2: doplnit chybějící šablony a recepty

Po zúžení rozsahu zbývá 28 kombinací. Tabulka je z živého běhu brány
(`sedí/pool` = kolik šablon se do pásma vejde / velikost poolu):

### standard

| cíl | typ | cíl slotu | sedí/pool | chybí |
|---|---|---|---|---|
| 1400 | breakfast | 350 | 2/14 | 2 |
| 1400 | lunch | 490 | 3/9 | 1 |
| 1600 | lunch | 560 | 3/9 | 1 |
| 1600 | dinner | 480 | 3/9 | 1 |
| 2000 | lunch | 560 | 3/9 | 1 |
| 2000 | dinner | 480 | 3/9 | 1 |
| 2200 | breakfast | 440 | 3/14 | 1 |
| 2200 | dinner | 528 | 2/9 | 2 |
| 2400 | lunch | 672 | 2/9 | 2 |
| 2400 | dinner | 576 | 2/9 | 2 |

### vegetarian

| cíl | typ | cíl slotu | sedí/pool | chybí |
|---|---|---|---|---|
| 1400 | breakfast | 350 | 2/12 | 2 |
| 1400 | lunch | 490 | 2/4 | 2 |
| 1400 | dinner | 420 | 3/4 | 1 |
| 1600 | lunch | 560 | 2/4 | 2 |
| 1600 | dinner | 480 | 2/4 | 2 |
| 1800 | lunch | 504 | 3/4 | 1 |
| 1800 | dinner | 432 | 3/4 | 1 |
| 1800 | snack | 252 | 5/23 | 2 |
| 2000 | lunch | 560 | 2/4 | 2 |
| 2000 | dinner | 480 | 2/4 | 2 |
| 2000 | snack | 280 | 6/23 | 1 |
| 2200 | breakfast | 440 | 3/12 | 1 |
| 2200 | lunch | 616 | 2/4 | 2 |
| 2200 | dinner | 528 | 1/4 | 3 |
| 2200 | snack | 308 | 4/23 | 3 |
| 2400 | lunch | 672 | 1/4 | 3 |
| 2400 | dinner | 576 | 0/4 | 4 |
| 2400 | snack | 336 | 5/23 | 2 |

**Hlavní nález, na který se dívej jako na příčinu, ne jako na položku v tabulce:**
vegetarian má pro **oběd 4 šablony a pro večeři 4 šablony**. Celkem. Na celý
týden, na všechna kalorická pásma. Standard jich má 9. Proto vegetarián propadá
skoro všude a proto to nespraví „dosypat pár receptů k číslům z tabulky" —
ten pool je potřeba postavit, ne záplatovat.

**Čísla „chybí" nesčítej.** Jedna nová šablona pokrývá několik pásem: oběd o
560 kcal base spraví standard 1600 i 2000 zároveň. Postupuj podle pokrytí, ne
podle součtu — cílem je zelená brána, ne 50 nových receptů.

Odhad, který ti má stačit jako vodítko: **6–8 vegetariánských obědů, 6–8
vegetariánských večeří** rozprostřených tak, aby base kcal pokryly pásmo
~420–700, **2–3 vegetariánské svačiny** kolem 250–340, **2–3 standard obědy a
večeře** ve vyšším pásmu (~570–680) a **2 snídaně** kolem 330–360 a jedna kolem
440. Přesná čísla si dopočítej z brány, ne z tohoto odstavce.

## Pravidla pro obsah — tohle je ta důležitá část

1. **Makra se počítají ze surovin, ne odhadují.** Použij
   `lib/nutrition/ingredientNutritionTable.js`. Když surovina v tabulce není,
   přidej ji tam i se zdrojem čísla v komentáři — nedopisuj hodnotu od oka.
2. **Atwater musí sedět**: `calories ≈ 4×protein_g + 4×carbs_g + 9×fat_g`.
   `verify-macro-kcal-consistency` to kontroluje a máme tam už 30 receptů,
   které to nesplňují (odložené) — nepřidávej k nim další.
3. **Každá nová šablona musí mít knihovní recept** v
   `lib/simpleStartRecipeLibrary.js` — s `ingredients` (surovina + gramáž) a
   `instructions` (kroky, jak je to u stávajících). Šablona bez receptu rozbíjí
   záměnu jídla; přesně to jsme opravovali v #240.
4. **Česká, běžně dostupná jídla.** Suroviny z normálního supermarketu, ne
   exotika. Značka je „prakticky, bez omáčky" — jídelníček, který jde uvařit.
5. **Žádné duplicity ani přebarvené varianty.** „Totéž, velká porce" už v
   knihovně je a `baseDishKey()` je schválně slučuje — nová šablona musí být
   jiné jídlo, ne jiná gramáž téhož.
6. **U vegetarián packu hlídej bílkoviny.** Slot má cíl bílkovin
   (`cilBilkovinSlotu.js`); oběd o 560 kcal z těstovin a rajčat ho nesplní.
   Luštěniny, tvaroh, cottage, vejce, tofu, tempeh, řecký jogurt.
7. **`pickTemplateForSlot` ani `splitByCalorieFit` NEUPRAVUJ.** Logika je
   ověřená. Když ti brána nejde zazelenat obsahem, je to nález — napiš ho,
   neohýbej kvůli němu picker.

## Krok 3: ověř

Musí projít všechno:

```
npm run check
node scripts/verify-start-template-coverage.mjs
node scripts/verify-start-meal-variability.mjs
node scripts/verify-macro-kcal-consistency.mjs
```

`verify-start-meal-variability` byl PASS **před** tvým zásahem — když po
doplnění šablon spadne, je to regrese, kterou jsi způsobil, ne stará vada.

## Výstup

Napiš:
- kolik šablon a receptů jsi přidal, rozpad standard / vegetarian a podle typu,
- u každého: název, base kcal, bílkoviny, která pásma tím zaplnil,
- tabulku brány po opravě (musí být 0 hard FAILů, WARNy vypsané),
- výsledek všech čtyř příkazů výš,
- **co jsi NEudělal a proč** — hlavně jestli nějaká kombinace zůstala červená
  a co by pro ni bylo potřeba,
- jestli jsi musel sáhnout do `ingredientNutritionTable.js`, tak které suroviny
  a odkud máš jejich hodnoty.

Nic nemaž bez uvedení v tom seznamu.
