# Další krok pro Claude Code

## Pravidla, která platí nade vším

- **Neměř produkci.** Žádné dotazy do DB, žádné Vercel MCP, žádné volání
  produkčních endpointů. Čísla dostaneš hotová.
- **Migrace píšeš jako soubor, NEAPLIKUJEŠ ji.** Nasazuje ji Honzův druhý
  Claude, a když ji kód potřebuje, tak před mergem.
- **Model Sonnet.** Eslint na `src/` nespouštěj, repo ho tam nemá.
- Bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná mock data, žádný
  Next.js, jeden zdroj pravdy.
- **Před „hotovo" spusť celou sadu**, ne jen `test:src`:
  `npm run test:unit`, `npm run test:src`, `npx tsc --noEmit`,
  `npm run lint:copy`, `npm run build`.
  (`build` proto, že modul z `lib/` se od 8.2 importuje i do SPA.)
- Konec = diff a čekání na „schvaluji". **Necommituj sám** — a to platí
  i proti pokynu v chatu.

---

## 8.9 „NEZNÁMÁ SUROVINA", KTERÁ NENÍ NEZNÁMÁ — CHYBA JE V JEDNOTCE

**Tohle je oprava mojí vlastní chybné diagnózy. Dvakrát jsem tvrdil, že
generátor zahazuje recepty kvůli surovinám, které nejsou ve slovníku.
Není to pravda a měření to vyvrací.**

### Co se skutečně děje

`compute_nutrition_for_ingredients` označí surovinu za nedohledanou,
když neplatí `name_cs is not null AND gramu is not null`. Do
`ingredients_unmatched` se ale v obou případech zapíše **název suroviny**.
Když selže převod jednotky, chyba obviní surovinu.

Změřeno 3. 9. na produkci, `losos` (ve slovníku je: `name_cs='losos'`,
208 kcal/100 g, `reference_cs`):

```
jednotka   ingredients_unmatched   kcal
g          []                      2.1
ml         []                      —
ks         []                      312.0
''         []                      312.0
kus        ["losos"]               null
kg         ["losos"]               null
gram       ["losos"]               null
dkg        ["losos"]               null
dl         ["losos"]               null
porce      ["losos"]               null
balení     ["losos"]               null
konzerva   ["losos"]               null
```

Odtud je i hláška ve frontě `posledni_chyba = "losos, losos, losos"`
(položka 1704, 3. 9.) a `"losos, krevety, losos, krevety"` (31. 8.).
Losos i krevety jsou ve slovníku. Padlo to na jednotce.

Doprovodná měření:

- `unit_conversions` má 76 obecných převodů. Chybí mezi nimi `kg`,
  `gram`, `gramů`, `dkg`, `dl`, `kus`. Přitom `kgs`, `l` a `ml` tam jsou.
- `ingredients_nutrition` má 376 řádků, z toho 68 bez `name_cs` — samé
  anglické zbytky po Spoonaculuaru (`salmon`, `olive oil`, `quinoa`).
  `nactiPovoleneSuroviny()` je filtruje pryč, takže povolený seznam má
  308 jmen. To je v pořádku, ne chyba.
- Suroviny, o kterých byla řeč — maliny, borůvky, rukola, krevety, cizrna,
  ricotta, ostružiny, fíky, tahini, hummus, tofu, tempeh — **jsou ve
  slovníku všechny**, se správnými dietními příznaky. Do slovníku se
  nepřidává nic.
- Všech 2 749 gramáží + 208 mililitrů v přijatých `llm_generated`
  receptech používá jen `g` a `ml`. Jiná jednotka = dávka spadla. To je
  survivorship bias, ne důkaz, že model jiné jednotky nepíše.

### Proč to bolí dvakrát

Zahozený recept není to nejhorší. `nedohledane` jde do dalšího pokusu jako
`tyhle_suroviny_neznam: ["losos"]` — **modelu se tím zakáže surovina,
která byla celou dobu v pořádku.** Fronta si sama zužuje prostor a učí se
špatnou lekci. U rybích a mořských slotů je to přímý důvod, proč se
nedaří dotáhnout objednávku.

### Co udělat

1. **Rozdělit chybu v SQL.** Nová verze `compute_nutrition_for_ingredients`
   (**migrace jako soubor, NEAPLIKUJ ji**) vrací navíc
   `units_unmatched text[]` — suroviny, které slovník zná, ale u kterých
   selhal převod jednotky. `ingredients_unmatched` zůstane jen pro
   skutečně neznámé názvy. `complete` se chová stejně jako dnes.

2. **`zapisRecept()` ty dvě věci nesmí míchat.** Nový důvod
   `neznama_jednotka` vedle `nutrice_neuplna`. **Do `nedohledane`
   (a tedy do `tyhle_suroviny_neznam`) smí jít výhradně
   `ingredients_unmatched`.** Neznámá jednotka patří do vlastního pole
   promptu, ne mezi zakázané suroviny.

3. **Uzavřít svět jednotek v promptu.** Seznam surovin je uzavřený, seznam
   jednotek otevřený — to je ta asymetrie, která tohle způsobila.
   Do `buildGeneratorInput()` přidat `povolene_jednotky: ["g", "ml"]`
   a do `prompts/recipe-generate.md` větu, že jiná jednotka je chyba.
   Data ukazují, že model to už dnes v 100 % úspěšných případů dodržuje.

4. **Doplnit deterministické převody** (`unit_conversions`, obecné, tedy
   `ingredient_match is null`) — migrace jako soubor:
   `kg` = 1000, `dkg` = 10, `dl` = 100, `gram` / `gramy` / `gramů` = 1,
   `mililitr` / `mililitrů` = 1, `kus` / `kusy` / `kusů` → **stejné
   chování jako prázdná jednotka a `ks`**, tedy dohledat gramáž kusu
   v `ingredient_match`; obecný fallback pro `kus` NEPŘIDÁVAT.

5. **Test** na to, že známá surovina v neznámé jednotce se neobjeví
   v `tyhle_suroviny_neznam`. To je jádro celé opravy.

### Co v tomhle bodě NEDĚLAT

- **Nepřidávej suroviny do `ingredients_nutrition`.** Jsou tam. Změřeno.
- **Nepřidávej obecný převod pro `kus`, `porce`, `balení`, `steak`,
  `šálek`, `konzerva`.** Jeden kus lososa a jeden stroužek česneku nejsou
  stejná gramáž. Obecná hodnota by nezvýšila průchodnost, jen by tiše
  zfalšovala makra — a makra jsou přesně to, co se teď snažíme srovnat.
  Správná cesta je uzavřený seznam jednotek (bod 3).
- **Nepouštěj se do `is_pantry_ingredient`.** Zjištění k tomu je v textu
  níž a je to samostatné rozhodnutí, ne součást téhle opravy.

## 8.11 MAKRA SE NELÁMOU V GENERÁTORU, ALE VE VÝBĚRU

**Zásoba libových receptů v katalogu JE. Skladač je nebere.** Tohle je
nejlevnější cesta k tomu, aby appka splnila to, co web slibuje slovem
„makra" — nepotřebuje jediný nový recept.

### Měření, které to obrací

Průměr katalogu je 41 % kalorií z tuku proti cíli 27–28 %. To ale
nerozhoduje. Rozhoduje, kolik libových receptů je k dispozici:

```
slot       aktivních   do 35 % tuku   do 30 %
obed          229          127          104
vecere        219           86           66
snidane       179           68           54
svacina       208           64           52
```

Týdenní plán potřebuje při `MAX_OPAKOVANI_RECEPTU_TYDNE = 2` aspoň
⌈7/2⌉ = 4 recepty na slot (u šestijídlových plánů 7 na svačiny).
K dispozici je 64 až 127. **Zásoba není brzda.**

### Kudy plán vzniká (ověřeno v kódu, ne odhad)

```
LLM agent                    kostra týdne — které jídlo, jaký den, název
resolveMealsFromCatalog      slot NAHRADÍ skutečným receptem z katalogu
pickSeededCatalogRecipe   →  pickFromTopKCatalogRow  →  catalogPickRank
```

Model tedy recept NEVYBÍRÁ. Vybírá ho vzorec. Proto se makra nedají
spravit promptem a proto je celý tenhle bod v `lib/`.

### Tři závady, ne jedna

1. **Váhy.** `catalogPickRank` = `kcalDiff × 1,15` + penalizace bílkovin
   + penalizace tuku − `simplicity × 2,8`. Překročení tuku má váhu
   `VAHA_NAD_CILEM_TUK = 0,6`, takže tučný recept, který trefí kalorie,
   porazí libový s odchylkou padesát kalorií.

2. **Losuje se z TOP-5.** `pickFromTopKCatalogRow` seřadí kandidáty a pak
   z prvních `CATALOG_PICK_TOP_K` (default 5, clamp 3–8) seedovaně losuje
   kvůli variabilitě per uživatel/týden/slot. Sebelepší řazení se tím
   rozředí — pátý v pořadí může být výrazně tučnější než první.

3. **Nouzová větev penalizaci tuku NEZNÁ.** `pickClosestCatalogRow`
   (`lib/nutrition/portionScaling.js`) volá `sortCatalogRowsForSimplePick`
   **bez** `cilovyPodilBilkovin` a `cilovyPodilTuku` — defaultují na `null`
   a řadí se čistě podle kalorií a jednoduchosti. Spouští ji
   `pickClosestCatalogRecipe` z `resolveMealsFromCatalog` po hlášce
   „TITLE/FILTER MISS — emergency catalog pick". **Na téhle cestě je celá
   8.4 mrtvá.** Tohle je díra, ne ladění.

### Co udělat

1. **Zalátat nouzovou větev (bod 3) jako první.** `pickClosestCatalogRow`
   musí přijímat a předávat `cilovyPodilBilkovin` a `cilovyPodilTuku`
   stejně jako `pickFromTopKCatalogRow`, a `pickClosestCatalogRecipe` je
   musí protáhnout z `resolveMealsFromCatalog`. Bez tohohle nemá smysl
   ladit váhy — část plánů by ladění minulo.

2. **Tvrdý strop na tuk ve výběru, ne jen penalta.** Penalta je spojitá a
   dá se „přeplatit" kalorickou trefou. Přidej do řazení pásmo: kandidáti
   s podílem tuku do `STROP_TUKU_VYBERU` (navrhuju 0,35) tvoří přednostní
   pool; teprve když jich je míň než `topK`, doplní se zbytkem. Stejný
   vzor, jaký už `sortCatalogRowsForSimplePick` používá pro `simplicity`
   (`SIMPLE_FLOOR`, postupné povolování) — nekopíruj ho, ale drž se ho.
   Měření výš říká, že pool bude neprázdný ve všech čtyřech slotech.

3. **Zúžit losování, když je z čeho brát.** `topK` nech, ale losuj jen
   z těch kandidátů přednostního poolu. Variabilita zůstane (64+ receptů
   na slot), zmizí jen možnost vylosovat tučný, když libový byl po ruce.

4. **Až potom sahej na váhy.** `VAHA_NAD_CILEM_TUK` zvyš jen tehdy, když
   po bodech 1–3 měření pořád ukazuje překročení. Neměň víc věcí naráz —
   pak se nedá poznat, co zabralo.

5. **Diagnostika do logu.** Do `[catalog-resolve] ... complete` přidej,
   kolik slotů se vybralo z přednostního poolu a kolik ze zbytku. Bez
   toho nepůjde po nasazení říct, jestli bod 2 zabral, nebo jen pool byl
   pokaždé prázdný.

6. **Testy** — čisté funkce, žádná DB:
   - `pickClosestCatalogRow` s cílovým podílem tuku vybere libovější
     recept než bez něj (regrese na bod 3)
   - při dostatku libových kandidátů se tučný nedostane do losování
   - když je libových míň než `topK`, pool se doplní a nic nespadne
   - `topK = 1` a prázdný vstup nespadnou
   - beze změny chování, když `cilovyPodilTuku` je `null` (starší volání)

### Co v tomhle bodě NEDĚLAT

- **Neměň `MAX_OPAKOVANI_RECEPTU_TYDNE`.** Strop opakování je to jediné,
  co drží pestrost; zvýšit ho kvůli makrům by vyměnilo jeden problém
  za druhý.
- **Nedeaktivuj tučné recepty v katalogu.** Jsou správné pro lidi
  s vyšším cílem na tuk; problém je výběr pro konkrétní cíl, ne recept.
- **Nesahej na generátor ani na `fat_hint`.** 8.8 se teprve měří.
- **Nezvyšuj `CATALOG_PICK_TOP_K`.** Řeší se opačný problém.

## 8.12 ÚKLID FRONTY — CO SE NEKONTROLUJE, TO SE NEDODRŽÍ

**Tři malé věci, které vyplavalo měření 4. 9. po nasazení 8.10. Žádná
z nich není velká, dohromady ale drží frontu v polorozbitém stavu.**

### Měření, ze kterého to vzešlo (produkce 4. 9., NEMĚŘ SI TO SÁM)

8.10 zabralo: běh v 11:15 UTC nedal ani jedné vegetariánské položce
`hlavni_bilkovina: "ryby"` — dostaly `vejce`. `hovezi`/`veprove` se
objevily jen u `gluten_free`, kde se nic nevylučuje. Správně.

Spadly ale znovu, na něčem jiném:

```
1567  vecere   vegetarian   protein_hint {"podil":0.55}
1568  svacina  vegetarian   {"podil":0.55}     posledni_chyba: "černý pepř"
1660  svacina  vegetarian   {"podil":0.5}
1527  vecere   vegetarian   {"podil":0.4}
```

55 % kalorií z bílkovin na vegetariánské svačině je nesplnitelné. 8.5
tenhle podíl zastropovala na 0,25 — ale jen v `omezPodilProObjednavku()`
při ZAKLÁDÁNÍ objednávky. Staré řádky ve frontě si původní hodnoty nesou
dál a **CHECK constraint v databázi pořád povoluje až 0,55**. Kód a
schéma si odporují a schéma je slabší.

Stav po ručním zásahu (Honzův druhý Claude, 4. 9.): 6 řádků zastropováno
na 0,25, **53 zbylo** — po zastropování by se srazily s objednávkou,
která na tentýž slot už čeká. Je to duplicitní poptávka, ne ztráta, ale
budou se donekonečna pokoušet a padat.

A do třetice: `pantry_ingredients` obsahuje `pepr`, `mlety pepr`,
`kajensky pepr` — ale ne `černý pepř`. Jedna položka na tom dnes spadla.
Stejná třída jako „červená paprika" v 8.10.

### Co udělat

1. **Zpřísnit CHECK na `protein_hint` z 0,55 na 0,25** — migrace jako
   soubor, NEAPLIKUJ ji. Ať se kód a schéma přestanou lišit; dnes je
   `omezPodilProObjednavku()` jediná obrana a stačí ji jednou obejít.
   Constraint je `recipe_generation_queue_protein_hint_check` a je to
   regulární výraz nad textem (`^\{("zdroj":"...",)?"podil":0\.[0-9]{1,2}\}$`)
   plus rozsah — **měň jen tu horní mez, formát nech být.** Migrace musí
   napřed zastropovat existující řádky, jinak `ALTER TABLE ... ADD
   CONSTRAINT` na starých datech spadne.

2. **Uzavřít mrtvé objednávky.** Řádek ve `failed`, jehož specifikace se
   po zastropování na 0,25 kryje s jinou položkou v `pending`/`running`,
   se nemá zkoušet znovu. Přidej stav (`nadbytecna` nebo podobně, doplň
   ho do CHECKu na `stav`) a v migraci ho těm řádkům nastav.
   **Nemaž je** — historie fronty je jediné, z čeho se dá zpětně poznat,
   co si appka kdy vyžádala.

3. **`černý pepř` do `pantry_ingredients`** (`cerny pepr`, kategorie
   `seasoning`, vegan i vegetarián). Stejná migrace, `ON CONFLICT DO
   NOTHING` jako u „římského kmínu".

4. **Test** na `omezPodilProObjednavku()`, že 0,55 na vstupu dá 0,25 na
   výstupu — už existuje, ověř že platí, a přidej k němu poznámku, že
   od téhle migrace to hlídá i schéma.

### Co v tomhle bodě NEDĚLAT

- **Neměň strop 0,25 samotný.** Je to změřené rozhodnutí z 8.5
  (nad 0,25 spadla úspěšnost fronty 3,5×), ne odhad.
- **Nemaž řádky fronty.**
- **Nesahej na `fat_hint`.** Měření 4. 9. ukázalo, že nezabral (nové
  recepty 49,6 % kalorií z tuku proti 45 % před ním) — ale řeší se to
  v 8.11 na straně výběru, ne tady.

## 8.13 TUKOVÝ STROP JAKO TVRDÁ VALIDACE — PROMPT NESTAČÍ

**Tři měření za sebou. 8.8 (tuk jen jako zadání do promptu) nezabrala
ani jednou.**

```
3. 9.  před 8.8    45,0 % kalorií z tuku
4. 9.  po 8.8      49,6 %
4. 9.  druhý běh   47,5 %   (1 recept z 12 pod 35 %)
```

Bílkovinový hint, který se v `zapisRecept()` TVRDĚ validuje
(`receptSplnujePodil`, důvod `pod_cilem_bilkovin`), přitom drží
33 % spolehlivě. Rozdíl mezi tím, co se kontroluje, a tím, co se jen
napíše do promptu.

### Rozložení, ze kterého se musí vyjít

110 receptů `llm_generated` za 7 dní:

```
medián            51,4 % kalorií z tuku
do 30 %           15 ze 110   (14 %)
do 35 %           21          (19 %)
do 40 %           33          (30 %)
do 45 %           43          (39 %)
```

**Tvrdý strop na 0,30 by zahodil 86 % dávky a frontu zabil** — přesně
to riziko, kvůli kterému se 8.8 dělala jen jako prompt. Strop musí být
tam, kde je splnitelný, a utahovat se až podle měření.

### Co udělat

1. **Tvrdá validace v `zapisRecept()`**, zrcadlo bílkovinové kontroly:
   recept nad stropem se nezapíše, důvod `nad_stropem_tuku`, detail
   nese skutečný podíl i strop. Kontroluje se až z
   `compute_nutrition_for_ingredients`, model makra nevrací.

2. **Strop ber z `fat_hint` položky fronty**, ne z konstanty —
   sloupec už existuje (8.8, default 0,30). **Ale nepoužívej ho
   syrový:** validační strop = `max(fat_hint, MIN_TVRDY_STROP_TUKU)`,
   kde `MIN_TVRDY_STROP_TUKU = 0,45`. Důvod je v rozložení výš: při
   0,30 projde 14 % dávky, při 0,45 projde 39 %. Chceme tlak, ne
   zaseknutou frontu.

3. **Důvod do dalšího pokusu.** `nad_stropem_tuku` patří do
   `nedohledane`? NE — nejsou to názvy surovin. Vlastní pole promptu,
   stejně jako `tyhle_jednotky_nepouzivej` z 8.9: konkrétní číslo
   („minule 52 %, strop je 45 %"), ne obecné „dej míň tuku".

4. **Počítadlo do `ai_runs.result`** — `zahozeno_nad_stropem_tuku`,
   obdoba `zahozeno_pod_cilem_bilkovin`. Bez něj nepůjde poznat, jestli
   se strop dá utáhnout, nebo už škrtí.

5. **Testy:** recept nad stropem se nezapíše; přesně na stropu projde;
   `fat_hint` pod 0,45 se zvedne na 0,45; chybějící makra recept
   nezahodí (stejné pravidlo jako u bílkovin — chybějící hodnota není
   porušení).

### Co v tomhle bodě NEDĚLAT

- **Nesnižuj `MIN_TVRDY_STROP_TUKU` pod 0,45**, dokud měření neukáže,
  že fronta má rezervu. Utahuje se po nasazení, ne dopředu.
- **Nesahej na `catalogPickRank` ani na 8.11.** Tohle je výroba,
  8.11 je výběr; měří se odděleně.
- **Neměň `RECIPE_GEN_MAX_PER_DAY`.**

## 8.14 PROFIL: TÝDEN MUSÍ BÝT VIDĚT CELÝ, NÁKUPNÍ SEZNAM SE MÁ SBALIT

**Zadání od Honzy po prohlídce profilu 5. 9. Tři věci ve dvou
komponentách, žádná databáze.**

### 1. Týdenní rozpis tréninků ukazuje jen tréninkové dny

`src/data/adaptery.ts` (kolem ř. 336) mapuje na `workouts` jen dny,
které mají trénink. Profil pak v „Týdenním rozpisu" zobrazí tři dlaždice
(Pá, Po, St) a zbytek týdne prostě není. Člověk nevidí, že úterý je
volno — vidí, že úterý neexistuje.

**Doplnit všech sedm dní, Po–Ne.** Volný den je dlaždice jako každá
jiná, jen popisek `Volno` místo názvu tréninku, bez délky a bez
kalorií, a **není klikací** (`disabled`, žádný hover efekt).
Grid už `lg:grid-cols-7` má, takže layout se nemění.

Pořadí dní je Po–Ne, ne pořadí, ve kterém přišly z API.

### 2. Klikání zůstane, ale nesmí vypadat jako hlavní ovládání

Honza: *„člověk musí mít jasný cíl a směr"*. Karta **DNEŠNÍ NAPLÁNOVANÝ
TRÉNINK** je to hlavní; rozpis je přehled. Dnes působí rozpis jako
navigace, protože kliknutí přepíše detail pod ním a nic to nenaznačuje.

- Kliknutí na tréninkový den detail dál přepíná (Honza to chce zachovat).
- **Vizuálně se rozpis podřídí:** menší, tišší, bez svítící ramečkové
  animace, kterou má dnes vybraná dlaždice. Zvýraznění dneška
  (`isToday`, pulzující tečka) zůstává.
- Když je vybraný jiný den než dnešek, **musí to být nad detailem vidět**
  — dnes to není poznat a vypadá to, jako by se změnil dnešní trénink.
  Text typu „Prohlížíš pondělí" a odkaz „zpět na dnešek".

### 3. Nákupní seznam se má sbalit

`src/components/NutritionSection.tsx` (kolem ř. 269) vypisuje všech
63 položek pod sebou a odtlačí zbytek profilu mimo obrazovku.

**Sbalený stav jako výchozí**, rozbalovací. V hlavičce zůstane počet
(`zbývá X z Y`), aby šlo poznat stav bez rozbalení. Tlačítko „Otevřít
přes celou obrazovku" zůstává, kde je.

### Co v tomhle bodě NEDĚLAT

- **Nesahej na jídelníček.** Dnešní jídla + tlačítko „Celý týdenní
  jídelníček" Honzovi vyhovují, ověřeno.
- **Neodstraňuj týdenní rozpis** ani přepínání — obojí zůstává,
  mění se jen rozsah (7 dní) a vizuální váha.
- Žádná migrace, žádná změna API, jen `src/`.

## 7.1 APPKA A WEB NESDÍLEJÍ JEDINOU HODNOTU — A APPKA NEMÁ TOKENY

> **Nedělá se teď.** Honza 31. 8.: vzhled má počkat, dokud systém nefunguje.
> Zadání zůstává hotové a připravené, až na něj přijde řada.

Změřeno 31. 8. 2026 porovnáním obou repozitářů.

`bodyandmindon-web/app/globals.css` má nad tokeny tenhle komentář:

> „Tokeny odečtené z app.bodyandmindon.cz — landing a appka jsou jeden produkt."

Záměr tedy existuje a je zapsaný. Skutečnost mu neodpovídá:

```
                      web (landing)              appka
pozadí                #070b18 navy-950          #08090d
akcenty               #34d399 / #10b981         #39ff14 (134×)
                      #a78bfa / #8b5cf6         #00f2fe  (94×)
                      #14b8a6
písmo                 Inter (next/font)         Plus Jakarta Sans
                                                + JetBrains Mono
typografická škála    --text-hero/h2/h3/lead    žádná
                      (clamp, plynulá)
vrstva tokenů         @theme, pojmenovaná       ŽÁDNÁ
```

Ani jedna hodnota není společná. Web má smaragdovou a fialovou, appka
neonově zelenou a azurovou. Web má Inter, appka Plus Jakarta Sans.

**Appka nemá vrstvu tokenů vůbec.** 356 výskytů natvrdo zapsaných hex barev
v 35 z 60 souborů v `src/`. Změna odstínu je dnes hromadné hledání
a nahrazování napříč komponentami — proto se to nikdy neudělá a proto se to
rozešlo.

### Pořadí prací: tokenizace PŘED jakoukoli změnou vzhledu

První krok nemění ani jeden pixel. Vytáhnout 356 natvrdo psaných hodnot do
pojmenované vrstvy (`@theme` v `src/index.css`, stejný tvar jako web) a
komponenty přepsat na názvy. Rendrovaný výsledek musí zůstat bajt po bajtu
stejný — to je věc, kterou lze otestovat.

Teprve pak je změna palety úpravou deseti řádků, ne třiceti pěti souborů.

**Rozhodnutí o tom, KTERÁ paleta vyhraje, je na Honzovi a v tomhle bodě se
nedělá.** Tokenizace je stejně potřeba v obou případech.

### Zadání

1. Vytvoř `@theme` blok v `src/index.css` se všemi barvami, které appka
   dnes používá. Pojmenuj je podle role, ne podle odstínu — `--color-akcent`,
   `--color-pozadi-karta`, ne `--color-lime`. Role pozná i ten, kdo paletu
   později vymění.
2. Přepiš `src/` na tyhle názvy. Žádná změna vzhledu.
3. Test, který drží obojí:
   - v `src/` (mimo `index.css`) nezůstal žádný literál `#rrggbb`;
   - seznam tokenů odpovídá barvám, které se v appce dnes používají.
4. Vypiš, kolik hodnot vzniklo a která barva je použitá jen jednou nebo
   dvakrát — to jsou kandidáti na překlep, ne na token (`#2bf5ff`,
   `#50fa8f`, `#38ef7d`, `#0e1420`, `#0d1722`, `#0a0b0e`). U každé napiš,
   jestli je to záměrná varianta, nebo omyl. Neslučuj je sám.

Písmo v tomhle bodě neřeš — `index.html` načítá Plus Jakarta Sans
a JetBrains Mono z Google Fonts, změna písma je samostatné rozhodnutí.

---

## Hotovo a nasazeno — NEŘEŠ ZNOVU
- **8.10** vegetariánská objednávka už nedostane rybu. `černý rybíz`
  spadl do skupiny `ryby` přes vzor `/ryb/i`, rotace objednala rybu a
  povolený seznam ji zahodil — 46 položek `failed`. Opraveno vzorem
  i nezávislou mapou `VYLOUCENE_SKUPINY_PODLE_DIETY`. Nasazeno 4. 9.,
  `2dba634` (#144). Migrace `20260903220000` (jednotky) a `20260904090000`
  (alias „červená paprika", „římský kmín" do spíže) aplikované a
  orazítkované. 24 položek vráceno do `pending`, zbylých 22 mělo
  shodnou specifikaci s něčím, co ve frontě už čekalo. Účinek se měří
  po běhu 4. 9. v 11:15 UTC (dřív brání denní strop 20).
- **8.8** tukový strop `fat_hint` (default 0,30, CHECK `(0,1]`) je ve
  frontě i v promptu — jako zadání, ne jako důvod k zahození. Nasazeno
  3. 9., `fc0cac2`. Účinek na nově vyrobených receptech se teprve měří.
- **8.7** cena a délka trialu jsou konečně vidět v registraci — poslední
  krok teď ukazuje: *„7 dní zdarma, pak 599 Kč / měsíc. První platba
  8. den. Zrušit můžeš kdykoli v profilu."* Doslova to, co slibuje web
  (ověřeno průchodem přes Chrome 3. 9.).
  - Před opravou: hledání `599` a `1499` napříč všemi `.tsx` v `src/`
    nevrátilo **nic**. Člověk viděl cenu na webu, prošel pěti kroky
    registrace bez ní a založil si předplatné.
  - Ceny se nepíšou natvrdo — krok5 čte `TRIAL_DAYS`
    a `START_VARIANT_PRICE_LABEL` z `lib/pricingConstants.js`, stejného
    zdroje jako `TrialPaywallCard`, paywall a lifecycle e-maily.
  - **Nález navíc, opravený rovnou:** `TRIAL_PERIOD_DAYS`
    (`lib/trialEligibility.js`, jde do Stripe `trial_period_days`) byla
    vlastní konstanta `= 7` s komentářem „jediné místo pravdy" — a ten
    samý komentář měl i `pricingConstants.js`. Dvě nezávislé konstanty,
    obě 7, obě se tvářily jako jediný zdroj. Kdyby se rozešly, appka by
    slibovala jinou zkušební dobu, než jakou Stripe nastaví. Teď
    `TRIAL_PERIOD_DAYS = TRIAL_DAYS`, jeden zdroj.
  - **Zbývá na Honzovi:** `START_PRICE_CZK = 599` je zrcadlo ceny,
    skutečnou částku určuje Stripe Price objekt z env
    `STRIPE_PRICE_START_MONTHLY`. Ověřit v Stripe dashboardu, že sedí —
    odsud to změřit nejde.

- **8.4** tuk má konečně vazbu na cíl výživy — `1d7243e` (PR #138).
  `lib/nutrition/cilTukuSlotu.js` je zrcadlo bílkovinné penalty
  s OBRÁCENOU asymetrií: penalizuje se přestřelení, ne podstřelení.
  Ověřeno spuštěním — při cíli 0,28 a slotu 700 kcal stojí stejná odchylka
  0,10 celkem **14 bodů při podstřelení a 42 při přestřelení**.
  - `bilkoviny podstřelení 1,00 / přestřelení 0,35`,
    `tuk podstřelení 0,20 / přestřelení 0,60` — váha tuku je pod
    bílkovinnou, takže při konfliktu vyhrají bílkoviny.
  - Tukový dluh dne padne na 0, jakmile den cíl přetáhne (ověřeno:
    1200 kcal / 0 g → 0). Zbytek dne pak tlačí na nejnižší tuk v katalogu.
  - `protein_trefa` i nové `fat_trefa` se persistují do
    `planOut._diagnostics` — do té doby se `protein_trefa` počítal
    a zahazoval.
  - **Změřeno po nasazení a nestačí to.** Přegenerování dvou účtů:
    r09 (bílkoviny na 108 %) tuk 132 → 124 %; r02 (bílkoviny na 67 %)
    tuk 154 → 154 %. Rozpad po slotech u r02: oběd 58,2 % kalorií z tuku
    proti cíli 28 %. Kde je bílkovinový dluh, přebije ho — záměrně,
    protože bílkoviny mají vyšší váhu. Řazení nevybere recept, který
    v katalogu není. Pokračování je bod **8.8** (tuk do výroby receptů).

- **8.6a** generátor už ví, jaké kombinace surovin v katalogu jsou.
  Změřeno naostro: z 5 receptů se 4 zahodily pro `prunik_surovin`, všechny
  proti položkám, které v katalogu **už byly**. Práh 0,7 zůstává beze změny
  — dělá to, co má. Chyběl signál, ne přísnost.
  - `existujiciKombinaceSurovin()` posílá do promptu **suroviny, ne názvy**.
    `uz_mame` (jména) model dostával už předtím a shodu podle nich nepoznal
    — musel by uhodnout, že „Banánový toast s arašídovým máslem a chia
    semínky" je totéž co „Banánové plátky s arašídovým máslem a chia".
  - Deduplikace podle normalizované množiny surovin **před** oříznutím na
    strop, ať porcové varianty téhož jídla nesežerou limit jednou kombinací.
  - Recept zahozený pro shodu surovin se přidá do `existujici`, takže druhý
    pokus i zbytek dávky vidí, že je ta kombinace obsazená.
  - Strop 30 kombinací je vědomý odhad, ne změřené optimum, a je tak
    i okomentovaný. Cena není důvod — 100 kombinací je ~0,005 USD, tedy 5 %
    ceny běhu; důvod je, že dlouhý nediferencovaný seznam model přehlédne.
  - Měřitelný cíl: podíl zahozených pro `prunik_surovin` klesne proti
    dnešním 4 z 5. Změřím po nasazení.

- **8.5** fronta receptů si už nezadává nesplnitelný cíl bílkovin —
  `dade0b6` (PR #135). Změřeno, že `protein_hint` srážel úspěšnost 3,5×
  (17–20 % vs 69–73 %, dieta bez vlivu) a rozpad byl skokový: podíl 0,25 →
  67 %, 0,30 → 3 %, 0,40 až 0,55 → **0 ze 145**. `MAX_PODIL_OBJEDNAVKY = 0.25`
  se aplikuje centrálně v `objednejRecepty()`, čímž se přetrhla i
  samozesilující smyčka (nevyrobený požadavek se dřív bral jako důvod žádat
  víc). `pasmoPoptavky()` rozšiřuje kalorické pásmo demand objednávky na to,
  co unese škálování porce (0,5–2,0×), s kvantizací po 300 kcal —
  změřeno, že krok 100 by frontu roztříštil na 9–17 pásem místo jednoho,
  krok 300 na 4–7.
  - Ověřeno před mergem: `{"podil": X}` je výhradně v `demand` řádcích
    (89/89), surovinové hinty výhradně v `seed` (17/17), a ani
    `fill_recipe_queue_from_demand`, ani `kanonicke_pasmo_slotu`
    `protein_hint` nenastavuje (`pg_get_functiondef`).
  - Fronta vyčištěna: 64 zaseknutých `failed` řádků byly ve skutečnosti
    jen 11 objednávek lišících se eskalujícím podílem. 5 obnoveno na
    `pending` s podílem 0,25 (33 receptů), 59 označeno jako sloučené.
  - Po nasazení spuštěno naostro: žádné zamítnutí kvůli bílkovinám ani
    kvůli kalorickému pásmu. Narazilo se na jiné brzdy → bod 8.6.
    Denní strop 20 receptů (`RECIPE_GEN_MAX_PER_DAY` ve Vercelu) zůstává
    vědomě, Honza 2. 9.: „to bude stačit".


- **8.1 + 8.3** cíl výživy: událost `target_changed` a návrh na makra
  v generátoru — `83576d9` (PR #131) a `docs/BMON_MAKRA_V_GENERATORU.md`.
  - **Fáze A (kód):** cíl se mění na PĚTI místech, ne čtyřech —
    `lib/weeklyWeightRecalc.js` píše `calories_target` mimo
    `buildCalorieTargetBodyMetricsPatch()`. Jedna funkce
    `emitCalorieTargetChangedEvent()` volaná ze všech pěti až po úspěšném
    zápisu; chybové větve `return`ují dřív. Payload nese starou i novou
    hodnotu a zdroj změny. Migrace `20260901090000` aplikovaná
    a orazítkovaná před mergem — ověřeno: `ai_trigger_rules` má 8 řádků,
    `target_changed → adjust_plan` s `enabled = false`, zapnuté je pořád
    jen `user_registered`.
  - Ověřeno taky, že `enqueueAIEvent()` nevyhazuje výjimku (vrací
    `{ ok: false }`), takže holé `await` nemůže shodit request na uložení
    výšky ani váhy, a že `ai_events` nemá CHECK na `event_type`.
  - `ruleMatches()` (`lib/aiDecisionEngine.js`) zná pevný seznam
    `trigger_type` a `target_changed` mezi nimi NENÍ — i po zapnutí by
    pravidlo zatím nic nevytvořilo. Vědomě mimo migraci.
  - **Fáze B (návrh):** premisa původního 8.3 byla špatná — uložený cíl
    se do generátoru dostane. `structured_plan_json.targets` se shoduje
    s `body_metrics` do gramu (ověřeno na třech účtech). Díra je ve výběru
    jídel. Změřeno na 140 dnech / 20 plánech: bílkoviny 94 % cíle
    (45 % dnů v ±10 %), sacharidy 79 % (25 %), tuky 148 % (10 %).
  - Katalog (791 aktivních receptů): medián podílu tuku 32–46 % proti cíli
    27–28 %. Po zúžení na pásmo slotu (cíl ±15 %) je pool nízkotučných
    u oběda 49 a večeře 33, ale u svačiny 6–8 proti 14 slotům týdně —
    a u šestijídlových plánů 7 proti 21 slotům, kde nutné minimum je 11.
  - Pokračování je bod **8.4**.


- **8.2** přegenerování „beze změny tréninku" už tréninku nesebere jméno —
  `d62772c` (PR #129). Ověřeno na produkci 1. 9. na třech účtech
  (`r02`, `r03`, `r09`) zavoláním stejného endpointu, jaký posílá tlačítko
  („Přegenerovat jídelníček", `PATCH /api/profile-preferences`
  s `regenerateMealsOnly: true`). U všech tří:
  - `plan_id` beze změny, žádný duplicitní řádek (upsert na
    `(user_id, valid_from)` drží, `created_at` zůstalo 31. 8.);
  - `workout_name`, `start_program_variant`, počet cviků i
    `duration_minutes` shodné s předchozím stavem
    (r02 a r09 Trénink A/B/C/D, 5 dnů po 5 cvicích, 60 min; r03 Trénink A/B,
    3 dny po 5 cvicích, 60 min);
  - `day_index` uvnitř tréninku sedí se dnem v plánu (1→1, 2→2, 3→3, 5→5,
    6→6) — to byla ta konkrétní věc, která se předtím rozbíjela;
  - cviky si nesou i `canonical_key`, `gif_url`, `image_url`, `video_url`,
    `wger_exercise_id`, `exercise_verified` a české názvy — hluboká kopie
    nic neuřízla;
  - `daily_activity_completions` neosiřely.
- **7.2** profil si už neprotiřečí sám se sebou — `7e09575` (PR #126).
  Sedm nálezů z auditu 31. 8. (`docs/AUDIT_PRAVDIVOSTI_2026-08-31.md`):
  banner nesouladu cíle, uložené gramy maker místo dopočtu z procent,
  „3 z 5 jídel" pravdivě, BMI z jedné výšky (`lib/bmi.js`), výzva
  k propojení Withings jen nepřipojenému, práh 72 h na změnu složení těla,
  srovnání BMR proti dennímu cíli.
  Naměřená data z Withings a Apple Health přitom seděla do poslední
  číslice — appka si nic nevymýšlela, jen si každá obrazovka počítala
  po svém.
- **6.1** máslo neprojde bezlaktózovou bránou — `4415955`
- **6.2** karta Withings už netvrdí, co nemá z dat — `24f20a4` (PR #110)
- **6.4** ruční vážení už nesmaže zbytek profilu — `0187255` (PR #111)
- **6.3** doma s vybavením už nehlásí velkou činku — `24eccd5` (PR #112),
  migrace `20260830120000` nasazená a ověřená: očekávaných klíčů 48,
  registry 221 řádků, 0 očekávaných klíčů bez řádku, `cvik_bez_vizualu`
  14 → 15 podle předpokladu.
- **6.5** výška se ukládá tam, kde ji někdo čte — `305af91` (PR #113)
- **6.6** zprávy trenéra už nechodí o dvě hodiny posunuté — `be0f30c`
  (PR #116), migrace `20260831160000` nasazená a ověřená: `ai_messages`
  má `created_at` i `delivered_at` jako `timestamptz`, produkční odpověď
  vrací `"2026-08-31T00:04:30.12+00:00"` = 2:04:30 v Praze. Že hodnoty byly
  v UTC, nebyl dohad z konfigurace — u deseti registrací z 31. 8. se
  `ai_messages.created_at` lišilo od `auth.users.created_at` o 18–26 s,
  ne o dvě hodiny. Migrace šla ven PŘED kódem (opačné pořadí by nechalo
  banner prázdný).
- **6.11** v den volna se dá zapsat trénink mimo plán — `553b5d5` (PR #121).
  Karta 4 už nenabízí stopky pro trénink, který v plánu není: při
  naplánovaném dni „Spustit záznamník (Stopky)", v den volna „Zapsat
  trénink mimo plán". Ověřeno, že zápis mimo plán projde — `handleSaveWorkout`
  a `sestavZapisTreninku` staví tělo POSTu jen z data, stopek a výběru
  uživatele, žádné `planId`/`planDay`.
- **6.8 + 6.9** nákupní seznam patří k jídelníčku, „Dnešní trénink" už
  nepodstrkuje cizí den — `5f5202c`, vydáno spolu s 6.10 v PR #119.
  Nová `dnesniTreninkPresne()` vrací `DEN_BEZ_TRENINKU`; původní
  `dnesniTrenink()` zůstala pro `vybranyTrenink()` na záložce Tréninkový
  plán, která o sobě tvrdí „nejbližší trénink v plánu". Zbytek → 6.11.
- **6.10** datum vážení už nespadne na předchozí den — `5e82a91` (PR #119).
  Změna typu sloupce SE NEUDĚLALA a udělat nejde: `ALTER` padá na
  `rule _RETURN on view system_health_alerts_zaklad`. Zónu doplňuje server
  (`bodyMetricsSeZonou` v `api/profile.js`). Ověřeno na produkci:
  `body_metrics[0].created_at` = `"2026-08-31T00:03:59.275Z"`.
  Že jsou hodnoty v UTC, změřeno proti `auth.users.created_at`: 20 účtů,
  rozdíl −0,9 až −0,1 s, žádný řádek v budoucnosti proti UTC.
- **6.7** makra se přepočítají s kalorickým cílem, výška se čte ze zdroje
  pravdy, neznámý návyk se odmítne — `aefed74` (PR #114). Ověřeno na
  produkci po nasazení:
  - `POST /api/body-metrics` s `selected_habits: ['zdrava_strava',
    'kvalitni_spanek']` vrací **400 `Neznámé návyky: …`** a žádný účet
    nevznikne;
  - `GET /api/profile` u účtu r01 vrací `height_cm: 178` z `body_metrics`,
    přestože v `user_metadata` výška vůbec není — **18 z 20 účtů** ji tam
    nemá, těm všem se do teď výška na profilu nezobrazovala;
  - dva řádky s rozjetými makry dorovnány přes `buildCalorieTargetBodyMetricsPatch`
    (`janprikopa@gmail.com` 185/205/67 → 189/285/82 při 2634 kcal;
    `+t6` 112/146/45 → 108/142/43 při 1386 kcal). Zbylých 19 účtů sedí
    v rámci zaokrouhlení (±2 kcal).

---

## Vědomě odloženo
**Obrázky u receptů — 99 % jídel je nemá, a dohledávání přes Spoonacular
NEFUNGUJE. Nezkoušet znovu.** Honza 2. 9. 2026: „budeme řešit později."

Stav: v aktivních plánech je **695 ze 700 jídel bez obrázku**.
`llm_generated` má 0 obrázků ze 445, `coach_seed_v1` 0 ze 150,
`simple_start` 0 z 23. Obrázky nese jen `spoonacular` (159/159) a
`meal_cache` (30/30), a Spoonacular import je od 20. 8. vyčerpaný.
`recipeGenerator.js` s `image_url` vůbec nepracuje.

**Metoda B (dohledat přes Spoonacular podle názvu) byla implementována
a po měření zahozena.** Změřeno 2. 9. proti živému API na skutečných
názvech z katalogu:

```
česky (co by backfill posílal)                      výsledků
Krůtí toast s avokádem a sýrem feta                     0
Cottage s borůvkami a arašídovým máslem                 0
Libové hovězí s dýňovým pyré                            0
Tofu s avokádem a chilli                                0
Tvarohový salát s okurkou a rajčetem                    0
Salát s hovězím steakem a avokádem                      0
```

Nula ze šesti. Kontrolní vzorek ručně přeložený do angličtiny dal
**1 ze 6**, a ten jediný byl „Steak Salad with Chimichurri Sauce" proti
našemu „Salát s hovězím steakem a avokádem" — jiné jídlo, tedy přesně ta
fotka cizího jídla, kterou nechceme.

Kořen: Spoonacular je katalog **existujících anglických receptů**. Naše
jídla vymyslel model a jsou česká — „Krůtí klobása s caprese špízy" v jejich
korpusu není a nebude. `name_en` je u `llm_generated` navíc **identický
s `name_cs`** (čeština, ne angličtina), takže i „hledej podle anglického
názvu" by nefungovalo bez nového překladu.

Kód metody B (`lib/recipeImageBackfill.js`, `api/cron/backfill-recipe-images.js`)
byl napsaný správně — dotýkal se jen `image_url`, respektoval rozpočet
(`lib/spoonacular/importBudget.js`, ne `spoonacularQuotaGate.js`, což je
jen přepínač režimu) a práh jistoty 0,7. **Smazán, protože by doplnil nula
obrázků a spálil kvótu.** Chyba byla v zadání, ne v provedení.

Zbývající cesty, až na to přijde řada:
- **generovat obrázky modelem** — jediné, co pro vymyšlená česká jídla
  dává smysl; ~0,04 USD/obrázek, 445 receptů ≈ 18 USD jednorázově;
  je to ilustrace, ne fotka, ale bude odpovídat jídlu;
- nechat bez obrázků.

Spoonacular klíč je obnovený a funkční (2. 9., HTTP 200, kvóta 50/den) —
na import receptů použitelný zůstává, na obrázky ne.


**Trial nemá kde zaplatit dřív než 3 dny před koncem.** Honza 29. 8.: je to
v pořádku, dřív připomínat netřeba.

**Cena a délka trialu nejsou v registraci vidět** ani v jednom z pěti kroků.
U předplatného se zkušební dobou to bude potřeba doplnit dřív, než přijdou
první platící lidé.

**Tlačítko „Přegenerovat jídelníček" nekontroluje `locked`.** Tři účty
mají zamčený plán (vzorek z 5.9). Dnes na to nikdo nedosáhne — nesoulad
cíle mají jen dva účty a ani jeden zamčený není — ale až se zamčené plány
rozšíří, přepis by zamčený vzorek zrušil.

**Interní názvy receptů** vidí zákazník („Tuňák s pečivem — sytá svačina — XL").

**Nákupní seznam:** rozsypané kategorie (parmezán, tofu i voda v „Ořechy, Tuky
& Ostatní", mandlové mléko v „Mléčné výrobky"), sůl 74 g a pepř 69 g na týden,
položky se dvěma jednotkami. Podrobnosti v
`docs/AUDIT_PROFILU_NALEZY_2026-08-29.md`.

**Chybějící ukázky u cviků** `dumbbell_romanian_deadlift` a `dumbbell_row`.

**`PROGRESSION_BY_EXERCISE.kind` a `CANONICAL_EXERCISES.equipment` se
rozcházejí u `tricep_extension`** — progrese `dumbbell`, statická mapa
`cable`. Stejný vzorec driftu jako u `overhead_press`, kde produkční registry
dala za pravdu progresi a mapa byla stará. Neověřeno, co má pravdu tentokrát.

**Záložka Apple Watch je slepá ulička** — vyzývá „Připoj Apple Health", ale
tlačítko tam žádné není.

**Navigační záložky nemají přístupné jméno** pro odečítače obrazovky.
