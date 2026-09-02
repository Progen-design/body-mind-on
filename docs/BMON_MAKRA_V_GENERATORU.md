# Makra v generátoru — odkud dnes berou, kam je dostat

docs/DALSI_KROK.md 8.1+8.3, Fáze B. **Jen tenhle dokument — do generátoru se
nesahá ani řádkou** (viz hlavička DALSI_KROK.md a stejné pravidlo v zadání
Fáze B). Čísla, která šla dohledat v kódu, jsou dohledaná; čísla, která šlo
zjistit jen z produkce, dodal Honza (140denní přesnost maker a složení
katalogu, oboje v bodě 4) — použitá tak, jak přišla, ne přepočítaná
z vlastního odhadu.

**Oprava vlastního zadání, hned na začátku:** tvrzení „uložený cíl výživy se
do generátoru vůbec nedostane" (docs/DALSI_KROK.md 8.3, úvod) jsem prošel
soubor po souboru a **není přesné pro kalorie ani pro bílkoviny.** Cesta
existuje a funguje — dá se to ověřit čtením kódu, ne dohadem. Co skutečně
chybí, je užší a jinde, než zadání předpokládalo: popsáno v bodě 1 a shrnuto
na konci bodu 1.

---

## 1. Celá cesta: odkud `targets` vezme co, soubor po souboru

### 1.1 Zdroj: sloupce v `body_metrics`

`protein_target_g`, `carbs_target_g`, `fat_target_g`, `calories_target` se
zapisují na třech místech (docs/DALSI_KROK.md 8.3 je má správně):

- `lib/registration/bodyMetricsRegistration.js:149-171` — registrace, INSERT.
- `lib/calorieTargetIntegrity.js:92-131` (`buildCalorieTargetBodyMetricsPatch`)
  — UPDATE při ruční změně cíle. Pět reálných volajících po Fázi A (8.1):
  `lib/updateHeightCm.js`, `api/profile-body-data.js`,
  `api/profile-preferences.js`, `lib/unifiedPlanPipeline.js`
  (`syncBodyMetricsCalorieTarget`), a `lib/weeklyWeightRecalc.js:136-141`
  (vlastní výpočet, mimo `buildCalorieTargetBodyMetricsPatch` — viz komentář
  v `lib/calorieTargetIntegrity.js` nad `emitCalorieTargetChangedEvent`).

Tohle je zápis. Čtení pro účely plánu vede přes `calculateNutritionTargets`
(dál).

### 1.2 `bodyMetrics` objekt, který doteče do generátoru, ty sloupce nese

Vstupní bod pro regeneraci z profilu (`api/profile-preferences.js:43-54`):

```js
const { data: metricsRows } = await supabaseServer
  .from('body_metrics')
  .select('*')                    // ř. 45 — CELÝ řádek, včetně *_target_g
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(1);
const latest = metricsRows[0];    // ř. 54
```

`bmOverride = { ...latest, ...updates, email }` (`api/profile-preferences.js:237`)
si `protein_target_g`/`carbs_target_g`/`fat_target_g` nese dál, pokud je
`updates` nepřepíše (přepisují jen `goal`/`activity`/`diet_type`/…, ne makra).

`generatePlanForEmail(email, { bmOverride, ... })` (`lib/generatePlan.js:823-849`)
je **thin wrapper** (`lib/generatePlan.js:818`) — deleguje beze změny na
`generatePlanForEmailViaUnified` (`lib/unifiedPlanPipeline.js:409-422`):

```js
let bm = options.bmOverride ?? null;      // ř. 410
if (!bm) {
  const { data: rows } = await supabaseServer
    .from('body_metrics').select('*')...  // ř. 412-417 — fallback, taky '*'
  bm = { ...rows[0], email };             // ř. 419
} else {
  bm = { ...bm, email: bm.email ?? email }; // ř. 421 — bmOverride beze změny
}
```

V obou větvích `bm` makra nese. Stejná funkce dál volá
`runUnifiedPlanPipeline` (`lib/unifiedPlanPipeline.js:108`), kde:

```js
const orchestratorBody = { ...bm, ...planNorm };   // ř. 141
```

`planNorm = bodyMetricsToPlanInput(bm)` (`lib/bodyMetricsToPlanInput.js:71-150`)
**vrací objekt bez `protein_target_g`/`carbs_target_g`/`fat_target_g`/
`calories_target`** (ověřeno — žádný z těch čtyř klíčů se v návratovém
objektu na ř. 125-149 nevyskytuje). Spread `{...bm, ...planNorm}` proto tyhle
sloupce z `bm` NEPŘEBIJE — jdou dál beze změny.

### 1.3 `generateStructuredPlan` — kde se staví `structured.targets`

`lib/services/planOrchestrator.js:583` (`generateStructuredPlan(bodyMetrics, opts)`).
`bodyMetrics` tady = `orchestratorBody` z 1.2.

Primární cesta (produkční výchozí stav): `OPENAI_PLAN_ENABLED` je `false`
(`lib/openaiPlanConfig.js:9-11`, komentář v souboru: „primární cesta je
deterministický katalog"), takže `resolveSyncOpenAiForPipeline()` vrátí
`false` (`lib/openaiPlanConfig.js:19-21`) a `useOpenAI` na
`planOrchestrator.js:592` je `false`. `structured` zůstává `null`
(ř. 594-614 se přeskočí).

Pro běžnou regeneraci (ne START trial, `opts.simpleStartMode` `false`) se
provede větev `!structured?.meal_plan` (`planOrchestrator.js:639-646`):

```js
const catalogSkeleton = buildCatalogSkeletonPlan(bodyMetrics);   // ř. 641
structured.targets = catalogSkeleton.targets || computeTargetsForPlan(bodyMetrics); // ř. 643
```

`buildCatalogSkeletonPlan` (`lib/services/deterministicFallback.js:446-464`):

```js
export function buildCatalogSkeletonPlan(bodyMetrics) {
  const targets = computeTargetsForPlan(bodyMetrics);   // ř. 448
  ...
  return { targets, meal_plan: {...} };                 // ř. 463
}
```

Žádná úprava maker mezi `computeTargetsForPlan()` a návratem — `targets`
jde ven přesně tak, jak přišel.

### 1.4 `computeTargetsForPlan` → `calculateNutritionTargets` — tady se rozhoduje

`lib/services/deterministicFallback.js:26-41`:

```js
export function computeTargetsForPlan(bodyMetrics) {
  const targets = calculateNutritionTargets({ bodyMetrics, ... });  // ř. 27, BEZ forceRecalculate
  return {
    calories_per_day: targets.calories_target,
    protein_g: targets.protein_g,
    carbs_g: targets.carbs_g,
    fat_g: targets.fat_g,
  };
}
```

`lib/nutritionTargets.js:91-99` — `forceRecalculate` defaultuje na `false`.
Klíčová větev, `lib/nutritionTargets.js:142-157`:

```js
const ulozeneMakro = {
  protein: asNum(bodyMetrics?.protein_target_g),   // ř. 143
  carbs: asNum(bodyMetrics?.carbs_target_g),        // ř. 144
  fat: asNum(bodyMetrics?.fat_target_g),            // ř. 145
};
const maUlozenaMakra = !forceRecalculate
  && ulozeneMakro.protein > 0 && ulozeneMakro.carbs > 0 && ulozeneMakro.fat > 0;  // ř. 147-150

let protein = maUlozenaMakra ? Math.round(ulozeneMakro.protein) : /* odvození z váhy */;  // ř. 152-154
let fat = maUlozenaMakra ? Math.round(ulozeneMakro.fat) : /* odvození z kalorií */;        // ř. 155-157
```

a sacharidy, `lib/nutritionTargets.js:207-212`:

```js
const carbs = maUlozenaMakra && !shouldAdjust
  ? clamp(Math.round(ulozeneMakro.carbs), 40, 700)
  : clamp(Math.round((calories - protein * 4 - fat * 9) / 4), 40, 700);  // ř. 210-212
```

**Když `body_metrics.protein_target_g`/`carbs_target_g`/`fat_target_g` mají
hodnotu (>0, všechny tři), `calculateNutritionTargets()` je vrátí BEZE ZMĚNY**
(jen oříznuté na bezpečné meze — `clamp` na ř. 205-206, 211). Kalorie mají
analogickou logiku o pár řádků výš (ř. 112-118, `registrationCalories`).

Zpátky v `planOrchestrator.js:648-664` se navíc `calories_per_day`
NÁSILNĚ srovná s `computeTargetsForPlan(bodyMetrics)` (druhé volání, kvůli
GPT větvi, která by mohla kalorie navrhnout jinak) — ale **jen kalorie**,
makra se na ř. 648-664 vůbec nedotknou, protože už jsou z 1.3/1.4 správně.

**Závěr bodu 1.4: pokud `bodyMetrics` (parametr `generateStructuredPlan`)
nese `protein_target_g`/`carbs_target_g`/`fat_target_g`, `structured.targets`
po ř. 664 obsahuje PŘESNĚ ty hodnoty, co jsou uložené v `body_metrics`.**
Podle 1.2 ten objekt nese.

### 1.5 `structured.targets` → `opts.targets` u resolveru jídel

`planOrchestrator.js:704-717`:

```js
const spoonacularResolveOpts = {
  ...
  targets: structured?.targets ?? {},   // ř. 708
  ...
};
```

Použije se identicky v obou větvích (mealsOnly s `prior_plan`, i běžný
resolve) — `planOrchestrator.js:732` a `planOrchestrator.js:772-777`:

```js
resolvedMeals = await resolveMeals(structured.meal_plan, bodyMetrics?.diet_type, spoonacularResolveOpts);
```

`resolveMeals` (`lib/services/planOrchestratorResolve.js:114-116`) je thin
wrapper na `resolveMealsFromCatalog` (`lib/recipesCatalog.js:1147`):

```js
export async function resolveMealsFromCatalog(mealPlan, dietType, opts = {}) {
  const targets = opts.targets ?? {};                                          // ř. 1149
  const dailyTarget = Number(targets.calories_per_day) || ... || 2200;         // ř. 1150
```

Tohle je **`recipesCatalog.js:1515`, ke kterému zadání ukazuje** — ale než se
tam dostane, `targets` už prošlo celou cestou výš a v `targets.protein_g`
(i `.carbs_g`, `.fat_g`) nese přesně to, co bylo uloženo u člověka.

### 1.6 Co `resolveMealsFromCatalog` s `targets` doopravdy udělá — TADY JE MEZERA

Tři různá použití `targets` uvnitř `resolveMealsFromCatalog`
(`lib/recipesCatalog.js:1147-1560`):

**a) `targets.calories_per_day`** — `dailyTarget` (ř. 1150), jde do
`kcalBandForMealSlot()` (ř. 106-135) a `enforceDayCalorieBand()`
(`lib/nutrition/calorieHonesty.js:572`, voláno s `tolerance: 0.10` na
`recipesCatalog.js:1488-1491`). **Aktivně vynucené, ±10 % denně.**

**b) `targets.protein_g`** — „BÍLKOVINOVÝ DLUH DNE"
(`recipesCatalog.js:1248-1272`):

```js
let zbyvaBilkovin = Number(targets?.protein_g);   // ř. 1258 — seed dluhu na začátku dne
```

Po každém jídle se odečte, co doopravdy dodalo (ř. 1261-1272). Pro každý
další slot se dopočítá `cilovyPodilBilkovin` — **podíl** bílkovin na
kaloriích, ne gramy (`lib/nutrition/cilBilkovinSlotu.js:75-82`,
`cilPodiluProZbytekDne`) — a ten jde do `pickFn`
(`recipesCatalog.js:897-902`) → `pickSeededCatalogRecipe`
(`recipesCatalog.js:696-719`) → `pickFromTopKCatalogRow`
(`lib/nutrition/portionScaling.js:234-260`) → `sortCatalogRowsForSimplePick`
(`lib/recipeSimplicityScore.js:322-339`) → `catalogPickRank`
(`lib/recipeSimplicityScore.js:309-314`):

```js
export function catalogPickRank(row, slotTarget, mealType, cilovyPodilBilkovin) {
  const kcalDiff = Math.abs(Number(row?.kcal) - Number(slotTarget));
  const simplicity = scoreRecipeSimplicity(row, mealType);
  const bilkoviny = penalizaceZaBilkoviny(row, slotTarget, cilovyPodilBilkovin);  // ř. 312
  return kcalDiff * 1.15 + bilkoviny - simplicity * 2.8;                          // ř. 313
}
```

`penalizaceZaBilkoviny` (`lib/nutrition/cilBilkovinSlotu.js:96-109`) penalizuje
recept, jehož podíl bílkovin je mimo cíl — **v kaloriích, ne jako tvrdý
filtr** — a asymetricky: podstřelení váží 1,0×, přestřelení 0,35×
(ř. 39-40 tamtéž). Výběr pak padne na náhodný z **TOP-K** (výchozí 5,
`CATALOG_PICK_TOP_K`) nejlépe seřazených kandidátů
(`lib/nutrition/portionScaling.js:256-259`) — **je to řazení, ne záruka.**

`lib/nutrition/cilBilkovinSlotu.js:10-15` má vlastní změřená čísla
(z produkce, z doby po zavedení tohohle mechanismu 23. 8. 2026):

```
cíl 158 g -> 150 g (95 %)
cíl 161 g -> 168 g (104 %)
cíl 185 g -> 106 g (57 %)   <- rozjelo se, jakmile cíl stoupl
cíl 234 g -> 196 g (84 %)
```

Vzorec sedí s tím, co se změřilo znovu 31. 8. (docs/DALSI_KROK.md 8.3):
cíl 189 g → 156 g (83 %). **Čím vyšší cíl, tím hůř — soft ranking narazí na
strop toho, co katalog v daném kalorickém pásmu vůbec nabízí.**

**c) `targets.fat_g` a `targets.carbs_g` — NEPOUŽITÉ. Nikde.**

```
$ grep -rn "targets?.fat_g\|targets\.fat_g\|targets?.carbs_g\|targets\.carbs_g" \
    lib/recipesCatalog.js lib/nutrition/portionScaling.js \
    lib/recipeSimplicityScore.js lib/nutrition/cilBilkovinSlotu.js
(žádný výsledek)
```

Grep bez jediného zásahu ve všech čtyřech souborech, které tvoří výběrovou
cestu. `structured.targets.fat_g` a `.carbs_g` se do `recipesCatalog.js`
dostanou (viz 1.5), ale nikdo se jich nezeptá. Recept se vybere podle kcal
+ bílkovinového podílu + jednoduchosti — tuk a sacharidy jsou čistě to, co
zbyde po tomhle výběru.

**d) `recipesCatalog.js:1515` samo — jen diagnostika, ne řízení výběru:**

```js
const cilBilkovin = Number(targets?.protein_g);   // ř. 1515
```

Počítá `trefaBilkovin` (ř. 1516-1533; `procent_cile`, `console.warn` pod
85 %) a uloží do `resolved._diag.protein_trefa` (ř. 1536-1537) — ale
`planOrchestrator.js` tenhle klíč do `planOut._diagnostics`
**nekopíruje** (ř. 888-928 kopírují jen spoonacular/meal-resolution
počty, `protein_trefa` mezi nimi není). Diagnostika existuje, ale
nepřežije do uloženého plánu — dá se najít jen v logu toho konkrétního
běhu, ne dotazem nad `ai_generated_plans` zpětně.

### Shrnutí bodu 1 — co je pravda a co ne

| Tvrzení ze zadání (8.3) | Co ve skutečnosti platí |
|---|---|
| „Uložený cíl výživy se do generátoru vůbec nedostane" | **Nepravda pro kalorie a bílkoviny** — cesta existuje, ověřeno řádek po řádku (1.1–1.5), `structured.targets.protein_g` == `body_metrics.protein_target_g` |
| „Generátor si makra odvozuje sám" | Pravda jen pro **tuk a sacharidy** — `targets.fat_g`/`targets.carbs_g` se do `recipesCatalog.js` dostanou, ale nikdo je nečte (1.6c) |
| Bílkoviny generátor „nějak" zohledňuje | Přesněji: soft ranking penalta + náhodný výběr z TOP-5, se stropem daným katalogem — funguje dobře do ~160g cíle, degraduje nad 180g (1.6b, měřeno) |

Skutečná mezera tedy NENÍ „cíl se nikam nedostane". Je to dvoje:
1. **Tuk a sacharidy nemají žádný analogický mechanismus** k tomu, co má
   bílkovina od 23. 8. 2026 — nulová vazba na cíl při výběru receptu.
2. **I bílkovinový mechanismus má strop** daný obsahem katalogu — soft
   ranking nedokáže vyrobit bílkoviny, které v TOP-K kandidátech nejsou.

---

## 2. Návrh: jak dostat cíl do cesty (a co dělat, když chybí)

**Cesta pro kalorie a bílkoviny už existuje a je správná — není co opravovat
v tomhle směru.** Návrh se týká jen tuku (a případně sacharidů, viz bod 3):

Zrcadlit `lib/nutrition/cilBilkovinSlotu.js` do analogického
`cilTukuSlotu.js`: stejný tvar (`podilTuku`, `cilPodiluTukuProZbytekDne`,
`penalizaceZaTuk`), stejné volání v `recipesCatalog.js:1248-1284`
(druhý dluh vedle `zbyvaBilkovin`, seedovaný z `targets.fat_g`), a přičíst
`penalizaceZaTuk(...)` do `catalogPickRank()`
(`lib/recipeSimplicityScore.js:309-314`) vedle `bilkoviny`. Žádná nová
vrstva, žádná nová abstrakce — kopie fungujícího vzoru na druhé makro.

**Asymetrie vah musí být OPAČNÁ než u bílkovin.** U bílkovin je podstřelení
horší (`VAHA_POD_CILEM = 1.0` > `VAHA_NAD_CILEM = 0.35`,
`lib/nutrition/cilBilkovinSlotu.js:39-40`) — chybí stavební materiál. U tuku
je to obráceně: **přestřelení je to, co se měří** (+43 % v 8.3, a je to
typický vedlejší efekt honby za bílkovinami — maso a mléčné výrobky nesou
tuk s sebou). Návrh: `VAHA_POD_CILEM_TUK` nízká (~0,3), `VAHA_NAD_CILEM_TUK`
vysoká (~1,0) — zrcadlový obrázek bílkovinových vah, ne stejná čísla.

**Nasazení musí být per meal_type, ne najednou pro celý plán.** Bod 4 níž
změřil, že dostupný pool nízkotučných receptů v kalorickém pásmu slotu
(ne v celém katalogu) je u oběda a večeře 5–12× nad týdenní potřebou, ale
u svačiny je na hraně nebo pod ní — kvůli tvrdému stropu opakování receptu
(`MAX_OPAKOVANI_RECEPTU_TYDNE = 2`, `lib/plan/pestrostReceptu.js:25`), ne
kvůli řazení. `catalogPickRank()` je jedna funkce volaná pro všechny
meal_type stejně — penalta samotná se tedy nemá lišit podle slotu, ale
OČEKÁVÁNÍ od ní ano. Nasazovat/měřit efekt zvlášť pro `obed`/`vecere`
(kde má na čem stavět) a zvlášť pro `svacina` (kde nemá) je nutná
podmínka k tomu, aby se úspěch u dvou slotů nezprůměroval s neúspěchem
u třetího do jednoho zavádějícího čísla.

**Starší účty bez uloženého cíle** (`maUlozenaMakra` `false` na
`lib/nutritionTargets.js:147-150`, protože chybí byť jen jedno ze tří maker):
tenhle případ **už je ošetřený** — `calculateNutritionTargets` spadne na
odvození z váhy a cíle (ř. 152-157, 210-212), ne na chybu ani na `null`.
Návrh nic nemění na tomhle chování; jen upozorňuje, že fallback existuje a
je to VĚDOMÝ, zdokumentovaný design (komentář `lib/nutritionTargets.js:130-141`),
ne díra. Jediné, co by stálo za zvážení PO Fázi B (ne teď): zapsat takhle
odvozené makro zpátky do `body_metrics`, aby účet přešel z „odvozuje se
pokaždé znovu" na „má uložený cíl" — ale to je práce v generátoru/zápisu,
mimo rozsah tohohle dokumentu.

---

## 3. Nedělat z toho tvrdou podmínku — proč a jak to obejít

**Oprava vlastního dřívějšího tvrzení.** Psal jsem tu, že „sacharidy se
srovnávají samy" — stálo to na jednom účtu z 31. 8. Změřeno na produkci
podruhé, poctivě (140 dnů, 20 aktivních plánů, podíl skutečnost/cíl za
den):

```
            průměr   rozsah        dnů v ±10 % (ze 140)
bílkoviny    94 %    38-152 %      63  (45 %)
sacharidy    79 %    22-151 %      35  (25 %)
tuky        148 %    80-251 %      14  (10 %)
```

**Sacharidy jsou DRUHÉ NEJHORŠÍ, ne vyřešené.** Tvrzení bylo špatně —
opravuju ho tady, ne že bych ho tiše smazal.

Katalog má navíc omezený počet receptů na kombinaci (dieta × meal_type ×
kalorické pásmo) — watchdog `dieta_pod_kritickym_poctem`
(`supabase/migrations/20260824110000_watchdog_dieta_pod_kritickym_poctem.sql`)
existuje přesně proto, že se to už stalo. Tvrdý filtr „recept musí sedět na
kcal PLUS bílkoviny PLUS tuk PLUS sacharidy zároveň" by u restriktivnější
diety s reálnou pravděpodobností nenašel nic — a `resolveMealsFromCatalog`
už dnes umí končit chybou `CATALOG_EMPTY` (`recipesCatalog.js:1503-1508`),
když se vyčerpají i záchranné stupně.

**Návrh drží princip, který systém už používá pro bílkoviny — soft ranking,
ne SQL filtr. Priorita zůstává bílkoviny > tuk > sacharidy, ale ze
zdůvodnění mizí „sacharidy to nepotřebují" a nahrazuje ho tohle:**

1. **Bílkoviny první — z produktového důvodu, ne z měření.** Jsou
   nejméně špatné z měřených tří (94 % průměr, 45 % dnů v toleranci) a MAJÍ
   fungující mechanismus od 23. 8. — ale zůstávají první hlavně proto, že
   u redukce drží svalovou hmotu (docs/DALSI_KROK.md 8.3, úvod). Tohle je
   produktová priorita, měření ji jen nerozporuje.
2. **Tuk druhý — protože je měřením nejhorší (148 % průměr, jen 10 % dnů
   v toleranci) A má už dohledanou strukturální příčinu** (bod 4 níž —
   katalog je systematicky tučnější než cíl). Zdůvodnění pro `cilTukuSlotu.js`
   dřív než pro sacharidy: je to zároveň nejvíc rozbité a nejlíp pochopené —
   „nejlíp pochopené" teď navíc znamená i tohle: víme přesně, kde bude
   fungovat (`obed`, `vecere`) a kde ne (`svacina`, kvůli týdennímu stropu
   opakování receptu, ne kvůli řazení — bod 4).
3. **Sacharidy třetí — ne proto, že se srovnají samy, ale proto, že jsou
   MECHANICKY SVÁZANÉ s tukem přes sdílený energetický rozpočet.** Denní
   kcal drží `enforceDayCalorieBand` na ±10 % (bod 4). Bílkoviny mají
   vlastní dluh. Co zbyde po kaloriích a bílkovinách, se dělí mezi tuk a
   sacharidy (`kcal_zbytek ≈ tuk_g × 9 + sacharidy_g × 4`) — když je
   vybraný recept systematicky tučnější, než má být, sacharidům
   mechanicky ubývá prostor. **Tohle je hypotéza k ověření, ne fakt:**
   až `cilTukuSlotu.js` sníží průměr tuku blíž ke 100 %, je potřeba
   ZMĚŘIT, jestli se sacharidy zlepšily jako vedlejší efekt, nebo jestli
   79 % zůstává i bez tučného vysvětlení — a teprve podle toho rozhodnout,
   jestli sacharidy potřebují vlastní `cilSacharidySlotu.js`, nebo ne.
   Bez týhle re-verifikace by „sacharidy se možná srovnají" byla přesně
   ta samá nepodložená formulace, kterou zadání teď opravuje podruhé.
4. **Žádný hard filter, nikdy.** `fetchCatalogCandidates()`
   (`recipesCatalog.js:288-...`) nemá a nemá dostat `minProtein`/`minFat`
   parametr do SQL `WHERE`. (Mimochodem: `buildSpoonacularContextForMealSlot`
   v `lib/services/planOrchestratorResolve.js:27-66` takový SQL-like
   `minProtein`/`minCarbs` PARAMETR PRO SPOONACULAR API počítá — ale
   nevolá ho odnikud, `grep` na `buildSpoonacularContextForMealSlot` mimo
   vlastní definici nic nenajde. Mrtvý kód z doby, kdy runtime ještě volal
   živé Spoonacular API — dnes `MAX_SPOONACULAR_REQUESTS_PER_PLAN = 0`
   (`planOrchestratorResolve.js:69`). Nezaměňovat s návrhem výš.)
5. **Fronta pro chybějící recepty zůstává jediná tvrdá reakce na díru** —
   `objednejZNevyresenehoSlotu({ minPodilBilkovin: cilovyPodilBilkovin, ... })`
   (`recipesCatalog.js:1309-1316`) — a i ta jen OBJEDNÁ nový recept
   (async, přes `recipe_generation_queue.protein_hint`,
   `lib/plan/proteinHint.js`), neblokuje aktuální plán. `receptSplnujePodil()`
   (`lib/plan/proteinHint.js:176-181`) je jediné místo v celém systému,
   kde je podíl bílkovin OPRAVDU tvrdou podmínkou — a platí jen pro NOVĚ
   vygenerovaný recept, který se má zapsat do katalogu, ne pro výběr
   z toho, co tam už je. Analogický `minPodilTuku` by šel přidat stejným
   vzorem, znovu až PO ověření, že se tuková penalta v ranku osvědčila.

---

## 4. Tolerance — strop daný katalogem, ne volba algoritmu

**Proč kalorie ±10 % vůbec fungují a makra ne — strukturální rozdíl, ne jen
míra rozbitosti.** Porce se škáluje jedním násobkem na celý recept
(`clampedPortionMultiplier`, viz komentář v
`lib/nutrition/cilBilkovinSlotu.js:17-22`) — kcal, bílkoviny, tuk i
sacharidy se násobí týmž číslem. **Škálování proto umí trefit kcal
u libovolného receptu** (vynásobíš, čím potřebuješ), ale **neumí změnit
PODÍL makra na kaloriích** — ten je vlastností receptu, ne porce. Kalorie
mají ±10 % (`recipesCatalog.js:1489`, `enforceDayCalorieBand`,
`CANONICAL_DAY_CALORIE_TOLERANCE` v `lib/calorieTargetIntegrity.js:7`)
proto, že škálování na ně funguje vždycky. Makra takovou záchranu nemají —
jejich tolerance je omezená tím, co katalog OBSAHUJE, ne tím, jak dobře se
to škáluje nebo řadí.

**Marginální rozdělení podílu tuku a bílkovin v katalogu (791 aktivních
receptů), a proč to samo o sobě nestačilo:**

```
meal_type   receptů   bílk. medián   tuk medián   receptů s tukem ≤28 %
obed          221         31 %          32 %        103  (47 %)
vecere        207         30 %          42 %         58  (28 %)
svacina       187         15 %          46 %         39  (21 %)
snidane       176         17 %          41 %         46  (26 %)
```

Uložené cíle tuku (3 vzorky): 82 g/2634 kcal = 28,0 %; 65 g/2182 kcal =
26,8 %; 115 g/3807 kcal = 27,2 % — **stabilně 27–28 % nezávisle na
velikosti kalorického cíle.** Katalogový medián je 32–46 %, celý katalog je
systematicky tučnější než cíl. Tahle tabulka ale POROVNÁVALA ŠPATNÉ VĚCI:
podíl receptů „v celém meal_type" proti tomu, kolik jich appka za týden
opravdu POTŘEBUJE — a tam se pořadí naléhavosti otočilo. Nechávám tabulku
tady, protože je pravdivá, ale závěr o pořadí, který jsem z ní minule
odvodil, byl **metodicky špatně** — viz níž.

### Skutečné dostupné pooly — cíl slotu ±15 %, jen recepty v pásmu

```
2634 kcal / 5 jídel        cíl slotu   pásmo ±15 %   v pásmu   tuk ≤28 %   bílk ≥29 %
snídaně (1×/den)              527       448–606         36         11          4
svačina (2×/den)               369       314–424         39          8          8
oběd (1×/den)                   738       627–849         74         49         43
večeře (1×/den)                 632       537–727         66         33         34

2182 kcal / 5 jídel
snídaně (1×/den)               436       371–501         54         12          7
svačina (2×/den)               306       260–352         75          6         10
oběd (1×/den)                   611       519–703         62         19         23
večeře (1×/den)                 524       445–603         69         15         32
```

(Pásmo je `serveBandForSlot()` — cíl slotu ±15 %, `lib/catalogDemandBand.js:74-95`,
volané z `fetchCatalogCandidates()` na `recipesCatalog.js:351-357` — ne
syrové `calorieRangeForMealType`. To je oprava mého vlastního prvního
dotazu, díky za odchycení.)

### Tvrdší omezení než tolerance sama: týdenní strop opakování

`lib/plan/pestrostReceptu.js:25` — `MAX_OPAKOVANI_RECEPTU_TYDNE = 2`. Tenhle
strop je HARD exclusion (`tvrdaVylouceni()`, `pestrostReceptu.js:38-44`,
předává se jako `hardExcludeIds` — komentář na ř. 28-32: „hranice, kterou
eskalace přebít NESMÍ", ani ty poslední záchranné stupně výběru). Počítá se
na `catalog_id` (`pouzitiZaTyden`) i na základ názvu jídla, aby se nedalo
obejít porcovými variantami (`vycerpaneZaklady`, `zakladNazvuJidla`,
`pestrostReceptu.js:64-86`). Platí pro celý týden, napříč dny — recept smí
přijít nejvýš 2×, pak je pro zbytek týdne nedostupný, ať řazení chce
cokoli.

**Z toho plyne nutná podmínka na velikost poolu:** aby týdenní potřeba
`N` slotů šla pokrýt receptama, které nepřekročí strop 2×, musí platit
`pool ≥ ⌈N / 2⌉`. Snídaně a večeře/oběd mají 1 slot/den (`N=7`), svačina má
při 5 jídlech/den DVA sloty/den (`mealSlotTypes(5)`,
`lib/nutrition/portionScaling.js:54-59` — `['breakfast','lunch','dinner','snack','snack']`),
tedy `N=14`.

```
              N/týden   min. pool (⌈N/2⌉)   pool (2634)   pool (2182)   stav
snídaně          7              4                11            12       POHODLNĚ STAČÍ
svačina         14              7                 8             6       NA HRANĚ / NESTAČÍ
oběd             7              4                49            19       POHODLNĚ STAČÍ
večeře           7              4                33            32       POHODLNĚ STAČÍ
```

**Oprava vlastního závěru o pořadí naléhavosti z minula.** Řadil jsem podle
procenta shody v CELÉM meal_type katalogu (21 % svačina, 26 % snídaně,
28 % večeře, 47 % oběd) a z toho vyšlo pořadí svačina-snídaně-večeře-oběd.
To je špatná metrika — rozhoduje ABSOLUTNÍ POČET proti týdenní potřebě, ne
procento z celku. Snídaně má nízké procento (26 %), ale 11–12 receptů na
potřebu jen 4 je **velká rezerva** — u snídaně tuk NENÍ týdenní problém.
Svačina má navíc **dvojnásobnou denní potřebu** (2 sloty/den) — a i po
zúžení na konkrétní kalorické pásmo slotu (kde je „39 v pásmu" z prvního
vzorku NÁHODNĚ STEJNÉ ČÍSLO jako „39 nízkotučných z celého katalogu" výš —
jsou to dvě různé věci, nezaměňovat) zbyde jen 8 nízkotučných. To je jediný
meal_type, kde pool skutečně neodpovídá poptávce.

### Jak se to projeví — ne pádem, ale tichým rozjetím v druhé půlce týdne

`resolveMealsFromCatalog` prochází dny sekvenčně (`for (const day of
mealPlan?.days ?? [])`, `recipesCatalog.js:1241`) a `pouzitiZaTyden` se
plní postupně (`recipesCatalog.js:1415`) — ŽÁDNÝ globální plánovač, který by
si dopředu rozvrhl, kdy který recept použít. Širší kalorické pásmo (39–75
receptů) nikdy nedojde — `CATALOG_EMPTY` (`recipesCatalog.js:1503-1508`)
tomuhle nehrozí. Co se stane:

1. Prvních pár dní týdne `cilovyPodilBilkovin`-style tuková penalta
   (kdyby existovala) posune výběr ke kompatibilní menšině (6–8 receptů
   u svačiny) — vypadá to, že to funguje.
2. Jakmile menšina vyčerpá strop 2× (u poolu 6, po `6 × 2 = 12` použitích
   ze 14 potřebných — tedy KOLEM 6. DNE týdne), zbylé sloty (u poolu 6
   nejmíň 2, u poolu 8 teoreticky 0, ale bez rezervy — jedna dietní
   výjimka nebo `usedTodayIds` shoda ji vyčerpá dřív) spadnou do
   `hardExcludeIds` a řazení pokračuje na ZBÝVAJÍCÍCH kandidátech z
   širšího pásma — tedy na katalogovém mediánu 46 % tuku, ne na cíli.
3. Výsledek: **plán by systematicky zhoršoval shodu na tuku směrem ke
   konci týdne u svačin** — ne náhodný šum, ale strukturální důsledek
   pořadí, ve kterém se dny generují. To je přesně ten „tvrdší" limit,
   který je horší než jakákoli zvolená tolerance: není to o tom, JAK moc
   se řadí podle tuku, ale o tom, že po pár dnech není z čeho řadit.

### Revidované doporučení pro `cilTukuSlotu.js`

- **Oběd a večeře — stavět a nasadit rovnou.** Pool (19–49) je 5–12×
  nad týdenní potřebou (4) v obou měřených scénářích — soft ranking má na
  čem pracovat celý týden, ne jen první polovinu.
- **Svačina — penalta beze smyslu, dokud nepřibudou recepty.** I dokonalá
  penalta narazí na `hardExcludeIds` kolem poloviny týdne u slabšího
  katalogu (pool 6) a bude na hraně i u silnějšího (pool 8, nulová
  rezerva). PRVNÍ krok je dovoz receptů, ne kód.
- **Snídaně — TUKOVÁ penalta by fungovala (pool 11–12 na potřebu 4), ale
  není to totéž jako „snídaně je vyřešená".** Bílkovinová strana snídaně
  zůstává samostatný, nevyřešený problém (~22 % receptů nad 25% podílem
  bílkovin, `recipesCatalog.js:1252-1256`) — jiné makro, jiný pool, jiné
  číslo. Nemíchat je do jednoho doporučení jen proto, že je to stejný
  meal_type.

**Kolik receptů dovézt pro svačinu — dvě čísla, ne jedno, ať je jasné, co
je nutné minimum a co komfortní rezerva:**

```
                    bare minimum (pool ≥ 7)   bez opakování vůbec (pool ≥ 14)
2634 kcal (pool 8)    už splněno, rezerva 1     dovézt +6 (na 14)
2182 kcal (pool 6)    dovézt +1 (na 7)          dovézt +8 (na 14)
```

„Bare minimum" počítá s tím, že algoritmus rozloží použití DOKONALE
rovnoměrně (2×2×2×1× atd.) — reálný výběr je seedovaný náhodný pick
z TOP-K, ne optimalizátor přes celý týden, takže i „bare minimum" pool
může v praxi dojít dřív, než ukazuje tahle aritmetika. „Bez opakování"
(pool ≥ 14 = týdenní potřeba) je proto realističtější cíl, ne luxus.

### Poctivý strop tolerance — s vědomím obou omezení

Dřívější odhad „±25–30 % dnů v širší toleranci, podle analogie s
bílkovinami" platí nanejvýš pro **oběd a večeři**, kde je pool dost velký,
aby analogie s bílkovinami (95–104 % při nízkém cíli, propad na 57 % při
vysokém — `lib/nutrition/cilBilkovinSlotu.js:10-15`) dávala smysl. **Pro
svačinu žádné číslo tolerance nemá cenu navrhovat, dokud pool nenaroste
aspoň na bare minimum (7) — pod tím limitem negarantuje soft ranking nic,
protože ve druhé půlce týdne nemá z čeho vybírat.** To je odpověď na
zadání: „s tímhle katalogem to pro svačinu nejde pod žádné konkrétní %",
ne proto, že by se nedalo počítat, ale proto, že limitujícím faktorem není
kvalita řazení — je to holý početní nedostatek receptů vůči týdenní
poptávce.

---

## 5. `conditions_json` pro `target_changed` (navazuje na Fázi A, bod 4)

Změřený stav `ai_trigger_rules` (8 řádků, od tebe): `target_changed →
adjust_plan` priority 100, `enabled=false`; `weight_stagnation →
adjust_plan` priority 20, `enabled=false`; jediné zapnuté je
`user_registered → initial_plan`, priority 5. Migrace `20260901090000`
navíc opravila `missing_plan` na `priority = 10` — takže dnešní pořadí
(kdyby se všechno zapnulo najednou) by bylo `user_registered` (5) <
`missing_plan` (10) < `weight_stagnation` (20) < `target_changed` (100).

**Návrh podmínky, NEIMPLEMENTOVÁNO:**

```json
{ "min_abs_delta_kcal": 150 }
```

150 kcal proto, že je to zhruba jedna svačina — menší rozdíl je typicky
zaokrouhlovací šum z přepočtu (viz `docs/DALSI_KROK.md` 6.7, rozdíly kolem
±2 kcal ze zaokrouhlení gramů na celé číslo), ne rozhodnutí o člověku.

Druhá otázka, kterou Fáze B otevírá a Fáze A nemohla vědět: **cíl se může
změnit i beze změny kalorií** — typicky změna `goal` (redukce → nabírání)
při stejném kalorickém stropu posune `protein_target_g` o desítky gramů
(`lib/nutritionTargets.js:154`, násobky 1,6/1,8/2,0 podle cíle). Čistě
kalorická podmínka by tenhle případ přehlédla úplně. Navrhovaný tvar tedy
spíš:

```json
{ "min_abs_delta_kcal": 150, "min_abs_delta_protein_g": 15 }
```

s OR sémantikou (stačí, aby platila jedna z podmínek) — ale **tenhle tvar
`conditions_json` dnes nikdo nečte.** `ruleMatches()`
(`lib/aiDecisionEngine.js:128-142`) porovnává jen `trigger_value` proti
plochému stavu (`missing_plan`, `weight_stagnation`, …) — druhé pole
`conditions_json` se z `ai_trigger_rules` sice načítá
(`loadTriggerRules`, `lib/aiDecisionEngine.js:116-117`), ale používá se
JEN jako zdroj `prompt` textu (`lib/aiDecisionEngine.js:241`), nikdy jako
podmínka k vyhodnocení. Než půjde `conditions_json` použít jako skutečný
práh, `evaluateUserState()`/`ruleMatches()` musí umět:
1. přijmout `payload` konkrétní události (`old_calories_target`,
   `new_calories_target`, makra — přesně to, co `emitCalorieTargetChangedEvent`
   od Fáze A posílá, `lib/calorieTargetIntegrity.js`),
2. srovnat delty z payloadu s prahy z `conditions_json`,
3. teprve pak rozhodnout, jestli `target_changed` vůbec „aktivní" je.

To je kód v `lib/aiDecisionEngine.js`, ne migrace ani dokument — vědomě mimo
rozsah týhle session i téhle fáze.

---

## Co zůstává mimo tenhle dokument

- Žádná řádka v `lib/recipesCatalog.js`, `lib/nutrition/*`,
  `lib/services/planOrchestrator*.js` ani `lib/nutritionTargets.js` se
  neměnila.
- Žádné pravidlo se nezapínalo, žádná migrace se nepsala.
- Neměřil jsem produkci sám ani jednou — čísla v bodě 1 jsou z kódu
  a z existujících komentářů/testů v repu (`lib/nutrition/cilBilkovinSlotu.js`,
  docs/DALSI_KROK.md). Čísla v bodech 3 a 4 (140denní přesnost maker,
  složení katalogu 791 receptů, společné rozdělení kalorického pásma ×
  podílu tuku po meal_type) jsou měření, která mi dal Honza — použil jsem
  je tak, jak přišla, nepřepočítával jsem je z ničeho vlastního. Co z toho
  odvozuju sám (aritmetika stropu opakování v bodě 4: `pool ≥ ⌈N/2⌉`) je
  označené jako odvozené, ne jako další měření — a je to horní odhad
  (počítá s dokonale rovnoměrným rozložením výběru přes týden), takže
  realita může být na tom hůř, nikdy ne líp.
- Kód pro tuk (`cilTukuSlotu.js`), případně pro sacharidy
  (`cilSacharidySlotu.js` — jen pokud re-verifikace v bodě 3.3 ukáže, že
  se sacharidy nezlepší jako vedlejší efekt tukové penalty), perzistence
  diagnostiky (`fat_trefa`/`protein_trefa` v `_diagnostics`) a čtení
  `conditions_json` v `lib/aiDecisionEngine.js` jsou samostatné, menší
  kusy práce pro příští session(y) — radši víc malých PR s testy a
  s re-měřením mezi nimi než jeden velký zásah do „nejcitlivějšího místa
  v appce".

---

## Dodatek: plány se 6 jídly — tam to početně nevychází vůbec

Doplnil Honza (měřicí strana) po dokončení dokumentu. Tabulka v bodě 4
počítá jen s 5 jídly denně; při 6 jídlech je situace o řád horší a je to
jediný scénář, kde je strop opakování **matematicky nesplnitelný**.

`mealSlotTypes(6)` vrací `['breakfast','lunch','dinner','snack','snack','snack']`
— **tři svačinové sloty denně**, tedy `N = 21` za týden. Nutná podmínka
z bodu 4 (`pool ≥ ⌈N/2⌉`) dává minimální pool **11**.

Změřeno na produkci, pásmo svačiny při 3807 kcal / 6 jídel (cíl slotu
457 kcal, ±15 % → 388–526):

```
                                    v pásmu   z toho tuk ≤28 %   nutné minimum
svačina, 6 jídel (N = 21/týden)        18             7               11
```

**Pool 7 proti nutnému minimu 11.** Není to „na hraně" jako u pěti jídel —
je to pod hranicí, takže při 6 jídlech nelze týden poskládat z nízkotučných
svačin ani teoreticky, bez ohledu na kvalitu řazení. Navíc `MEAL_WEIGHTS[6]`
dává svačině 0,12 × 3 = **0,36 dne** — víc než třetinu denních kalorií
ze slotu, kde je 7 použitelných receptů.

Rozložení dnešních plánů (20 aktivních): **16 plánů má 5 jídel, 2 mají 6,
2 mají 4.** Šestijídlové plány jsou tedy menšina — ale jsou to plány
s nejvyššími kalorickými cíli, tedy lidé, u kterých na složení jídelníčku
záleží nejvíc.

Závěr z bodu 4 („u svačiny je prvním krokem dovoz receptů, ne kód") tím
platí silněji, a číslo k dovozu je vyšší, než uvádí tabulka „kolik receptů
dovézt": pro pokrytí i šestijídlových plánů je cílem **21 nízkotučných
svačin v pásmu** (bez opakování), minimum **11**.
