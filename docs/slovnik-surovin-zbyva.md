# Slovník surovin — co zbývá nenamapované

Stav po dávce 3 (USDA) a aliasech z dlouhého ocasu.

Výchozí měření: 485 neznámých názvů blokovalo 192 ze 426 aktivních receptů.
Po zásahu: **289 názvů, 162 blokovaných receptů**.

Číslo v závorce = kolik aktivních receptů ten název blokuje.

---

## 1. Aliasy, které neprošly ověřovací bránou (23)

Brána: `scripts/verify-ingredient-aliases.mjs`. Návrh dával smysl, ale výpočet
nad skutečnými recepty ho nepotvrdil. Čísla jsou v `.cache/aliasy-neprosly.json`.

| alias | navržený cíl | proč neprošel |
|---|---|---|
| `banany` | `banan` | median odchylky 31.2 % > 25 % |
| `houb` | `houby` | soucet prestrelil ulozene kcal 349 % |
| `soda na peceni` | `jedla soda` | prepis nic nepridal — cil se nespáruje |
| `bazalka natrhana na kousky` | `bazalka` | prepis nic nepridal — cil se nespáruje |
| `chilli prasek` | `chili prasek` | soucet prestrelil ulozene kcal 320 % |
| `dalsi mata` | `mata` | prepis nic nepridal — cil se nespáruje |
| `jalapeno papricky` | `jalapeno` | soucet prestrelil ulozene kcal 855 % |
| `klas kukurice` | `kukurice` | soucet prestrelil ulozene kcal 855 % |
| `kureci prsa bez kuze a kosti` | `kureci prsa` | soucet prestrelil ulozene kcal 171 % |
| `limetkove klinky` | `limetka` | prepis nic nepridal — cil se nespáruje |
| `lzice vody` | `voda` | prepis nic nepridal — cil se nespáruje |
| `mild cheddar` | `cheddar` | median odchylky 1116.3 % > 25 % |
| `mild cheddar syr` | `cheddar` | prepis nic nepridal — cil se nespáruje |
| `mint` | `mata` | prepis nic nepridal — cil se nespáruje |
| `nakrajeny mlady zazvor` | `zazvor` | prepis nic nepridal — cil se nespáruje |
| `nove brambory` | `brambory` | soucet prestrelil ulozene kcal 297 % |
| `portobello zampiony` | `houby` | prepis nic nepridal — cil se nespáruje |
| `praskovy cukr` | `cukr` | soucet prestrelil ulozene kcal 1180 % |
| `stavnata zrala rajcata` | `rajce` | prepis nic nepridal — cil se nespáruje |
| `svestkove rajcata` | `rajce` | soucet prestrelil ulozene kcal 562 % |
| `vlazna voda` | `voda` | prepis nic nepridal — cil se nespáruje |
| `zelene cibule` | `jarni cibulka` | soucet prestrelil ulozene kcal 171 % |
| `ziti` | `testoviny` | soucet prestrelil ulozene kcal 1270 % |

U přestřelů obvykle nesedí uložené kcal receptu, ne alias — např. `ziti` →
`těstoviny` přestřelí o 1270 %, protože recept má uloženo řádově míň, než
z jeho surovin vychází. Alias by tu chybu zabetonoval.

## 2. Zakázané aliasy — modifikátor, který cíl nemá (9)

Nedostaly se ani do návrhu. Zdrojový název nese stav suroviny (sušené,
konzervované, plnotučné, grilované, pošírované), který cílová surovina nemá.
Buď dostaly vlastní řádek v `ingredients_nutrition`, nebo čekají.

| název | zamýšlený cíl |
|---|---|
| `grilovana kureci prsa` | `kureci prsa` |
| `jogurt z plnotucneho mleka` | `bily jogurt` |
| `kokosove mleko plnotucne` | `kokosove mleko` |
| `konzervovana rajcata` | `rajce` |
| `posirovany losos` | `losos` |
| `prirodni jogurt (neslazeny)` | `bily jogurt` |
| `rajcata z konzervy` | `rajce` |
| `recky jogurt plnotucny` | `recky jogurt` |
| `suseny tymian` | `tymian` |

## 3. USDA nedohledáno po dvou pokusech (3)

| surovina | co USDA vrátilo |
|---|---|
| `mascarpone` | `cheese italian mascarpone` → restaurační ravioli; `cheese cream` → smetanový sýr (ten už máme) |
| `matcha prášek` | `tea green brewed` → uvařený čaj (0 kcal); `spices tea powder` → chilli prášek |
| `sušené brusinky` | oba dotazy vrátily jinou položku, naposledy jablečné pyré |

Dohledat ručně v SR Legacy a doplnit dávkou 4.

## 4. Nejednoznačné a nesmyslné (226)

Sem se nesahá. Rozdělené podle typu.

### Zbytky parsování (12)

- `cizrna *1` (1)
- `hrnec. odlomte a odhodte tvrde konce z` (1)
- `lzice smetany` (1)
- `pch salt` (1)
- `poznamka: pouzil jsem pomerance` (1)
- `privedte k varu nekolik hrnku vody` (1)
- `t cream` (1)
- `to)` (1)
- `trocha maku` (1)
- `voda *2` (1)
- `voda - prave tolik` (1)
- `voda minus 2 lzice & pridat 2` (1)

### Značkové produkty (15)

- `alouette berries & cream spreadable cheese` (1)
- `alouette creme fraiche` (1)
- `arenkha msc` (1)
- `arenkha msc caviar substitute` (1)
- `bel gioioso mozzarella` (1)
- `bobs mill steel cut oats` (1)
- `chobani yogurt` (1)
- `dales seasoning` (1)
- `diestel breakfast sausage` (1)
- `knorr hollandaise sauce mix` (1)
- `maslo country crock` (1)
- `omacka hollandaise knorr` (1)
- `proteinovy prasek premier protein` (1)
- `smes na dresink hidden valley ranch` (1)
- `syr gouda prima donna` (1)

### Hotové výrobky a polotovary (35)

- `muffiny` (2)
- `barbecue omacka` (1)
- `brusinkovo-pomerancova omacka` (1)
- `cerna fazolova cesnekova omacka` (1)
- `crepes` (1)
- `croissant` (1)
- `croissanty` (1)
- `guacamole` (1)
- `habanero omacka a chile` (1)
- `houbova polevka` (1)
- `jahodovy marshmallow` (1)
- `krutonky` (1)
- `lasagne bez vareni` (1)
- `makova napln` (1)
- `masova omacka` (1)
- `muffins` (1)
- `nepecene testo na kolac` (1)
- `palacinkova smes` (1)
- `pasta omacka` (1)
- `pesto` (1)
- `pikantni marinara omacka` (1)
- `predpeceny korpus` (1)
- `ramen` (1)
- `ranch dressing` (1)
- `rybi kolacek` (1)
- `salsa` (1)
- `smetanova houbova polevka` (1)
- `smetanova kureci polevka` (1)
- `soja omacka s nizkym obsahem sodiku` (1)
- `testo na kolac` (1)
- `testo na kolac o prumeru 23 cm` (1)
- `testo na quiche` (1)
- `tzatziki` (1)
- `ustricova omacka` (1)
- `vanilla almond granola` (1)

### Nejednoznačné složení (34)

- `smes smetany a mleka` (5)
- `vanilka` (4)
- `syr asiago` (2)
- `vanilla almond milk` (2)
- `vanilla yogurt` (2)
- `berries` (1)
- `bylinkove koreni` (1)
- `cereal` (1)
- `dynove koreni` (1)
- `fruit` (1)
- `grilovane kure` (1)
- `koreni` (1)
- `koreni citron a pepr` (1)
- `koreni na dynovy kolac` (1)
- `koreni v kostce` (1)
- `kure` (1)
- `kureci kousky` (1)
- `kureci palicky` (1)
- `maso na duseni` (1)
- `maso na gulas` (1)
- `ostre americke syry` (1)
- `paprika (koreni)` (1)
- `pufovany ryzovy cerealie` (1)
- `raspberries and mint leaves` (1)
- `raspberry fruit spread` (1)
- `smes bobuloveho ovoce` (1)
- `syr brie` (1)
- `syr gruyere` (1)
- `syr havarti` (1)
- `tvrdy syr` (1)
- `vanilla silk almond milk` (1)
- `vanilla sugar` (1)
- `vino` (1)
- `zbytky kurete milanskeho stylu` (1)

### Ostatní (130)

- `potravinarske barvivo` (2)
- `salt & pepper` (2)
- `almond extract` (1)
- `amaretti` (1)
- `anyzova seminka` (1)
- `baby arugula` (1)
- `baby beets` (1)
- `barbecue sauce` (1)
- `barbecue seasoning` (1)
- `berry cranberry sauce` (1)
- `bread` (1)
- `challah chleb` (1)
- `chilli pasta` (1)
- `chorizo klobasa` (1)
- `cibulove vlocky` (1)
- `citronovy tymian` (1)
- `coconut water` (1)
- `cokolada a extra kakaovy prasek` (1)
- `collard greens` (1)
- `corn tortillas` (1)
- `corned beef hash` (1)
- `cracked pepper` (1)
- `cranberry` (1)
- `creamed wildflower honey` (1)
- `crust` (1)
- `cukrovy hrasek` (1)
- `drozdi` (1)
- `dzem` (1)
- `farro` (1)
- `filet mignon steaks` (1)
- `filety z halibuta` (1)
- `freshly cracked pepper` (1)
- `grain bread` (1)
- `grape preserves` (1)
- `herbed butter` (1)
- `himalajska sul` (1)
- `hnizda spenatovych fettuccine` (1)
- `hoisin sauce` (1)
- `horcicny prasek` (1)
- `hot sauce` (1)
- `hrasek a mrkev` (1)
- `jack cheese` (1)
- `jedle kvety` (1)
- `kachni vejce` (1)
- `kaki` (1)
- `kardamom` (1)
- `klobasa` (1)
- `koncentrat limonady` (1)
- `konopny proteinovy prasek` (1)
- `koriandrova seminka` (1)
- `kost s uzeninou` (1)
- `krupavy chleb k podavani` (1)
- `kruti klobasa` (1)
- `kyselina vinna` (1)
- `lamanka` (1)
- `lehce oslazena slehacka nebo` (1)
- `lepkava ryzova mouka` (1)
- `lime juice` (1)
- `lime kura` (1)
- `lime stava` (1)
- `limonada` (1)
- `liquid egg substitute` (1)
- `mahagonova ryze` (1)
- `mangosteen` (1)
- `maraschino tresen` (1)
- `mata peprna (extrakt)` (1)
- `mirin` (1)
- `miso paste` (1)
- `mlade listy cervene repy` (1)
- `mlady kapustovy salat` (1)
- `mleta horcice` (1)
- `mleta kukuricna krupice` (1)
- `mlete hrebicek` (1)
- `mlete klobasy` (1)
- `mlete veprove` (1)
- `mlety kardamom` (1)
- `monterey jack syr` (1)
- `multigrain bread` (1)
- `naan bread` (1)
- `nahrada vajec` (1)
- `nakladane hovezi` (1)
- `nefiltrovany med` (1)
- `nepsenicna mouka` (1)
- `orange pepper` (1)
- `orechove ovesne vlocky` (1)
- `ovesna mouka` (1)
- `parsnip` (1)
- `pecorino romano` (1)
- `piknikova sunka` (1)
- `pita chleb z celozrnne mouky` (1)
- `pita pockets` (1)
- `rainbow chard` (1)
- `rajcatovy protlak` (1)
- `recky jogurt s vanilkou` (1)
- `reduced fat cheddar cheese` (1)
- `roast turkey` (1)
- `romano syr` (1)
- `rosemary and thyme` (1)
- `rostlinne mleko` (1)
- `rum` (1)
- `ruzova voda` (1)
- `rybi filety` (1)
- `safran` (1)
- `seafood seasoning` (1)
- `silna kava` (1)
- `smazeny cesnek` (1)
- `snizenotucna smetana` (1)
- `sou cream` (1)
- `spring mix greens` (1)
- `stava z citronu meyer` (1)
- `stevie` (1)
- `susena cizrna` (1)
- `swiss cheese` (1)
- `tarragon leaves` (1)
- `tarragon stalks` (1)
- `tekuty kour` (1)
- `thajska bazalka` (1)
- `tortilla` (1)
- `tuna` (1)
- `udon s krevetami` (1)
- `vajecny nahrazka` (1)
- `vanilkova pasta` (1)
- `vanilkovy lusk` (1)
- `vanilkovy proteinovy prasek` (1)
- `veganske maslo` (1)
- `veprova plec` (1)
- `wasabi paste` (1)
- `watercress` (1)
- `zelena dyne` (1)
- `zlate maliny` (1)
