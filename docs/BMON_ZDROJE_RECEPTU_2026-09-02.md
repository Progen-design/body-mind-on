# Odkud dnes přibývají recepty — a proč katalog tloustne sám od sebe

Změřeno 2. 9. 2026 na produkci. Navazuje na `docs/BMON_MAKRA_V_GENERATORU.md`
(bod 8.3, Fáze B), kde vyšlo, že plánům chybí nízkotučné svačiny: pool 6–8
proti 14 slotům týdně, u šestijídlových plánů 7 proti 21.

Otázka zněla: umí `import-spoonacular` cílit na podíl tuku, nebo se recepty
musí objednat přes `recipe_generation_queue`?

Odpověď: **umí, ale je to jedno — Spoonacular je vyčerpaný. A živý zdroj
receptů vyrábí přesně ten problém, který řešíme.**

---

## 1. `maxFat` je podporovaný a nevyžaduje změnu kódu

`applyQueryParamsToSearch()` (`lib/spoonacular/importQueryRotation.js:163`) je
whitelist parametrů, které se pošlou na Spoonacular. Obsahuje:

```
type, cuisine, diet, intolerances, maxReadyTime,
minCalories, maxCalories, maxCarbs, minCarbs, maxFat
```

`maxFat` tam **je**. Stačilo by tedy vložit řádky do
`spoonacular_import_queries` s `params.maxFat` — žádná migrace, žádný kód.

(Ten whitelist má nad sebou varování z vlastní jizvy: šest dotazů na
nízkosacharidové recepty ztratilo `maxCarbs` cestou, doběhly jako obyčejné
dotazy a 17. 8. se retirovaly. `maxFat` už tenhle problém nemá.)

Pozor na jiné místo: `DEFAULT_CATALOG_IMPORT_FILTERS`
(`lib/spoonacular/catalogImportGate.js`) je `{ minProtein: 5, maxSugar: 30 }`
a **žádný tukový filtr nemá**. To je lokální brána po stažení, ne dotaz.
Pro cílení na tuk se použije `params.maxFat` v dotazu, ne tahle brána.

---

## 2. Jenže Spoonacular import je 13 dní mrtvý

```
catalog_meal_type   dotazů   živých   s maxFat
obed                   22        0         0
snidane                 9        0         0
svacina                16        0         0
vecere                 19        0         0
```

**Všech 66 dotazů je vyčerpaných.** Poslední běh 20. 8. 2026. Cron
`/api/cron/import-spoonacular` běží každý den ve 3:00 a nemá co dělat —
`selectImportQueriesGlobal()` mu nevrátí nic.

Důvody retirace: 55× `pool_exhausted`, 8× `pool_empty`, 3× bez důvodu.

Za posledních 14 dní přibylo ze `source = 'spoonacular'` **0 receptů.**

### Pool u svačin je vyčerpaný na straně Spoonacularu, ne u nás

`total_results` jednotlivých svačinových dotazů: 6, 7, 5, 9, 5, 9, 1, 2, 0,
11, 9, 5, 8, 11, 4, 5. Šestnáct dotazů dohromady **~97 výsledků**.

Za to můžou tvrdé podmínky v `params`: `maxReadyTime: 10` (u většiny) a
`minCalories: 150–200`. Snack s přípravou do 10 minut a aspoň 150 kcal je
u Spoonacularu úzká množina. `MEAL_SIMPLICITY_RULES.svacina.maxReadyTime`
je přitom **15**, ne 10 — dotazy jsou přísnější než vlastní brána.

**Přidat `maxFat` do vyčerpané studny dá míň výsledků, ne víc.** Cesta přes
Spoonacular by nejdřív potřebovala uvolnit `maxReadyTime` na 15 a založit
nové dotazy — a i pak jde o desítky receptů, ne stovky.

---

## 3. Živý zdroj je `llm_generated` — a je to nejtučnější zdroj v katalogu

Aktivní recepty podle zdroje, s průměrným podílem tuku na kaloriích
(cíl je 27–28 %):

```
zdroj             meal_type   receptů   za 14 dní   podíl tuku
llm_generated     svacina        162        42         47 %
llm_generated     vecere         142        18         48 %
llm_generated     snidane         79        32         44 %
llm_generated     obed            62        26         46 %
spoonacular       snidane         73         0         43 %
spoonacular       obed            53         0         44 %
spoonacular       vecere          18         0         42 %
spoonacular       svacina         15         0         53 %
coach_seed_v1     obed            83         0         20 %
coach_seed_v1     vecere          46         0         24 %
coach_seed_v1     svacina         10         0         23 %
coach_seed_v1     snidane         11         0         37 %
meal_cache        obed            20         0         41 %
simple_start      (4 typy)        23         0         24-35 %
```

**Všech 118 receptů za poslední dva týdny je `llm_generated`, a ty mají
44–48 % kalorií z tuku.** Ručně naseedovaný `coach_seed_v1` má 20–24 %.

Generátor receptů nemá žádnou instrukci k tuku (`recipe_generation_queue`
má sloupec `protein_hint`, obdobu pro tuk **ne**), takže model píše, co ho
napadne — a to je skoro dvojnásobek cíle.

**Appka si tedy denně sama vyrábí problém, který jsme naměřili v plánech.**
Čím déle běží, tím tučnější katalog má. Bez zásahu se pool nízkotučných
svačin nezvětšuje, ale relativně zmenšuje.

---

## 4. A fronta u svačin z 94 % selhává

```
stav      meal_type   řádků   požadováno   vyrobeno   úspěšnost
failed    svacina        40         224         13        6 %
failed    vecere         12          60          3        5 %
failed    snidane        17          80         15       19 %
failed    obed           22         110         27       25 %
```

Nejčastější příčina, 43 řádků a **194 nevyrobených receptů**:

> „model vrátil dávku, ale žádný recept neprošel validací"

Konkrétní zamítnutí ukazují, o co jde — model míjí kalorické pásmo slotu:

```
294 kcal mimo pásmo 300–520 pro slot snidane
125 kcal mimo pásmo 170–370 pro slot svacina
380 kcal mimo pásmo 170–370 pro slot svacina
792 kcal mimo pásmo 450–680 pro slot obed
```

Dokud tohle platí, je jedno, jaký hint se do fronty zadá — z pěti
objednaných receptů projde nula. Objednat 21 nízkotučných svačin dnes
znamená objednat ~350 a doufat.

---

## 5. Co z toho plyne

Pořadí prací je jiné, než jsem čekal. **Dovoz receptů není první krok —
první krok je přestat vyrábět tučné.**

1. **Opravit úspěšnost fronty** (6 % u svačin). Bez toho je každá další
   objednávka plýtvání tokeny. Příčina je pojmenovaná v datech: model
   nedodržuje kalorické pásmo slotu.
2. **Přidat tukový cíl do generování receptů** — obdoba `protein_hint`.
   Nový sloupec v `recipe_generation_queue`, promítnutí do promptu,
   a validace stejně jako u kalorií. Bez tohohle se katalog s každým
   dnem zhoršuje.
3. **Teprve pak objednat chybějící svačiny** (cíl 21 nízkotučných v pásmu,
   minimum 11 — `docs/BMON_MAKRA_V_GENERATORU.md`, dodatek).
4. **Spoonacular je slepá ulička pro svačiny.** `maxFat` funguje, ale pool
   je vyčerpaný. Má smysl jen jako doplněk po uvolnění `maxReadyTime`
   z 10 na 15 (což odpovídá vlastní bráně), a i tak čekat desítky, ne stovky.
5. **`cilTukuSlotu.js` (bod 8.4) tím není zrušený** — pro oběd a večeři má
   pool 33–49 a dává smysl hned. Jen se tím potvrzuje, že u svačin je to
   práce na katalogu, ne na řazení.

Měřeno dotazy do produkce, ne z kódu: stav `spoonacular_import_queries`,
`recipes_catalog` po `source`, `recipe_generation_queue` po `stav`
a `posledni_chyba`. Whitelist a filtry v bodě 1 jsou z kódu.
