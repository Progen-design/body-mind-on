# Další krok pro Claude Code

## Pravidla, která platí nade vším

- **Neměř produkci.** Žádné dotazy do DB, žádné Vercel MCP, žádné volání
  produkčních endpointů. Čísla dostaneš hotová.
- **Migrace píšeš jako soubor, NEAPLIKUJEŠ ji.** Nasazuje ji Honzův druhý
  Claude, a když ji kód potřebuje, tak před mergem.
- **Jeden bod na jednu session.** Po dokončení `/clear`.
- **Model Sonnet.** Eslint na `src/` nespouštěj, repo ho tam nemá.
- Bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná mock data, žádný
  Next.js, jeden zdroj pravdy.
- **Před „hotovo" spusť celou sadu**, ne jen `test:src`:
  `npm run test:unit`, `npm run test:src`, `npx tsc --noEmit`,
  `npm run lint:copy`.
- Konec = diff a čekání na „schvaluji". Necommituj sám.

---

## 7.2 PROFIL SI PROTIŘEČÍ SÁM SE SEBOU

Změřeno 31. 8. 2026 průchodem `app.bodyandmindon.cz/profil` v prohlížeči,
účet `janprikopa@gmail.com`, každé číslo porovnané se zdrojem v DB.
Celý zápis: `docs/AUDIT_PRAVDIVOSTI_2026-08-31.md`.

**Naměřená data z Withings a Apple Health sedí do poslední číslice.**
Appka si nic nevymýšlí. Všech sedm nálezů níž je o tom, že jedna
obrazovka tvrdí něco jiného než druhá.

Dělej je v tomhle pořadí, ke každému vlastní test.

### a) Denní cíl 2634 kcal, ale jídelníček je postavený na 2164

```
profil                         cíl 2 634 kcal
ai_generated_plans             daily_calories 2164
5 jídel na dnešek dohromady    2151 kcal
```

Plán vznikl před opravou výšky (6.5). Když se změní
`body_metrics.calories_target`, plán se nepřegeneruje a nikdo se to
nedozví. Uživatel může sníst celý denní plán a být 480 kcal pod cílem,
který mu appka sama nastavila.

Watchdog to hlásí (`calorie_target_mismatch`, view
`system_health_alerts`), takže detekce existuje — chybí reakce.

Nechci automatické přegenerování na pozadí; plán je rozhodnutí o člověku.
**Chci, aby to uživatel VIDĚL** na profilu i v jídelníčku: plán je
postavený na jiný cíl, tady je tlačítko ho přegenerovat. Navrhni tvar
a zdůvodni ho dřív, než začneš psát.

### b) Makra na obrazovce nejsou makra v databázi

```
body_metrics       189 B / 285 S / 82 T
profil ukazuje     191 B / 283 S / 82 T
```

UI si gramy dopočítává z procent (`denniMakra` v `src/lib/makra.ts`),
místo aby vzalo `protein_target_g`/`carbs_target_g`/`fat_target_g`,
které tam od etapy 6.7 jsou. Rozdíl jsou dva gramy — ale znamená to, že
žádná obrazovka neukazuje číslo, se kterým se skládá jídelníček.

Ukazuj uložené gramy. Procenta z nich dopočítej, ne naopak.

### c) Přehled ukazuje 3 z 5 jídel pod nadpisem „Všechna jídla"

`OverviewBentoGrid.tsx:304`: `meals.slice(0, 3)`. Na kartě je
436 + 604 + 298 = 1338 kcal proti cíli 2634 — vypadá to, že třetina dne
chybí. Na záložce Jídelníček je všech pět.

Buď ukázat všechna, nebo napsat pravdu („3 z 5 jídel"). Rozhodni.

### d) Historie BMI míchá dvě různé výšky

Withings počítá BMI z výšky, kterou má nastavenou u sebe. Do 30. 8. to
bylo 182 cm, od 31. 8. správných 194:

```
30. 8.  104,8 kg  BMI 31,6   (ze 182 cm)
31. 8.  105,7 kg  BMI 28,1   (ze 194 cm)
```

Váha stoupla, BMI spadlo o 3,5 bodu. Každý graf BMI přes čas ukáže
zlepšení, které se nestalo — týká se 44 měření.

BMI si má appka počítat sama z `body_metrics.height_cm` (má na to
`calculateBmi`), ne přebírat `withings_body_snapshots.bmi`. Historii tím
srovnáš na jednu výšku.

### e) Karta Withings říká připojenému uživateli, ať se připojí

`WithingsCard.tsx:79` — odstavec „Propojte svou chytrou váhu Withings pro
automatickou synchronizaci…" se vykresluje **bez podmínky**, hned pod
odznakem „Online" a pod „Poslední úspěšná synchronizace: před 1 h 22 min".
Odznak i status po 6.2 chodí z dat správně, tenhle odstavec ne.

### f) „+3,4 kg svalové hmoty od minula" za 21 hodin jako fakt

Mezi 30. 8. 22:43 a 31. 8. 19:17 hlásí profil +3,4 kg svalů a −1,8 %
tuku. Za den. To není pokrok, to je šum impedance — v historii kolísá
svalová hmota mezi 81,3 a 92 kg podle hydratace.

Rozdíl mezi dvěma měřeními v odstupu kratším než pár dní se nemá
podávat jako změna složení těla. Navrhni práh a co se ukáže místo toho.
Nevymýšlej si diagnózy ani rady — jen neříkej jako fakt něco, co měření
neunese.

### g) Doporučený příjem je pod bazálním metabolismem

Na jednom profilu vedle sebe:

```
Bazální metabolismus (Withings)   2826 kcal
Denní cíl                         2634 kcal
```

Withingsový BMR je nadsazený (počítá ho z těch 91,5 kg „svalů";
Mifflin–St Jeor dá pro 105,7 kg / 194 cm / 38 let asi 2085 kcal), ale
appka obě čísla ukazuje jako fakt a nikde je nesrovná. Uživatel čte, že
má jíst o 190 kcal míň, než spálí v klidu.

`lib/nutritionTargets.js` má `minimalniKalorickyCil()` s vlastním
výpočtem BMR — appka tedy zná i své číslo. Navrhni, které z nich se má
ukazovat a jak, aby si dvě čísla na jedné obrazovce neodporovala.

### Co v tomhle bodě NEDĚLEJ

Nákupní seznam (kuřecí prsa třikrát pod třemi názvy, kategorie, sůl 52 g
na týden, dvě jednotky u položky) a chybějící ukázky u cviků
`dumbbell_romanian_deadlift` / `dumbbell_row` jsou jiná oblast a jiná
session. Zůstávají v „Vědomě odloženo".

---

## 7.1 APPKA A WEB NESDÍLEJÍ JEDINOU HODNOTU — A APPKA NEMÁ TOKENY

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

## 8.1 UDÁLOST `target_changed` A ZAPNUTÍ PRAVIDLA `missing_plan`

Kontext a měření: `docs/BMON_EKOSYSTEM.md`. Krátce: řetěz
`ai_events` → `ai_trigger_rules` → `ai_tasks` → exekutory existuje, ale
ze sedmi pravidel je zapnuté jediné (`user_registered → initial_plan`)
a od 10. 3. 2026 se jich nikdo nedotkl. Systém reaguje na člověka přesně
jednou za život.

### Co udělat

1. **Nová událost `target_changed`.** Vzniká, když se změní
   `body_metrics.calories_target`. Místo, kde se cíl mění, už existuje
   jedno: `buildCalorieTargetBodyMetricsPatch()` a jeho čtyři volající
   (viz komentář v `lib/calorieTargetIntegrity.js`). Napiš, kam přesně
   událost patří, ať nevzniká čtyřikrát nebo vůbec.

   `enqueueAIEvent()` v `lib/aiEvents.js` už používá
   `api/profile-preferences.js` pro `diet_changed` a `goal_changed` —
   drž se stejného vzoru.

2. **Migrace (soubor, NEAPLIKUJ):** nové pravidlo
   `target_changed → adjust_plan` a zapnutí `missing_plan → initial_plan`.
   Obě s `enabled = false` v migraci — zapneme je ručně a po jednom, až
   ověřím chování. Migrace je připraví, nespouští.

3. **REŽIM „NAVRHNI, NEZASAHUJ".** `target_changed` NESMÍ v první verzi
   přepsat člověku jídelníček sám. Má vyrobit stav, který uvidí na profilu
   — to už umí banner z 7.2a (`nesouladCile()`). Navrhni, jak to spojit,
   aby banner nevznikal z klientského porovnání, ale ze skutečné události.

4. **Co se stane s `conditions_json`.** U všech sedmi pravidel je `null`,
   takže pravidlo neumí říct „jen když". Napiš, co by `target_changed`
   potřebovalo za podmínku (např. rozdíl větší než X kcal), ale
   NEIMPLEMENTUJ to — jen popiš, ať víme, co nás čeká u 8.2.

### Co v tomhle bodě NEDĚLEJ

Nezapínej žádné pravidlo naostro. Nezapínej týdenní producer (to je 8.2).
Nesahej na `weight_stagnation`, `high_stress` ani `low_adherence` —
bez `conditions_json` by reagovaly na šum.

---

## 8.2 PŘEGENEROVÁNÍ „BEZE ZMĚNY TRÉNINKU" ZTRATÍ NÁZEV TRÉNINKU

Změřeno 31. 8. 2026 naostro: po stisku „Přegenerovat jídelníček"
(bod 7.2a) se plán `64bf0ee1…` zachoval se stejným `plan_id` a
dokončení zůstala — pojistka funguje. Ale trénink přišel o jméno:

```
před   workout: { workout_name: "Trénink B", exercises: […5], … }
po     workout: { day_index, exercises: […5], duration_minutes }
UI     „Trénink B"  →  „Trénink"
```

Cviky, počet i zaměření sedí. Chybí jen název.

Příčina je v `lib/services/priorPlanWorkouts.js` ř. 11. Funkce
`loadResolvedWorkoutsFromLatestPlan()` má v dokumentaci návratový typ
`Array<{ day_index: number, exercises: object[] }>` a kopíruje doslova
jen `exercises`. Orchestrátor pak objekt tréninku poskládá znovu a
`workout_name` nemá odkud vzít.

Komentář v `api/profile-preferences.js` i text v banneru přitom slibují,
že trénink zůstane **beze změny**. Nezůstane — ztratí jméno.

### Co udělat

1. Přenést i `workout_name` (a cokoli dalšího, co se ztrácí — projdi
   klíče objektu `workout` v plánu PŘED a PO a vypiš rozdíl, ať to
   nedoděláváme potřetí).
2. Test, který drží tvrzení z bannera: po `mealsOnly` regeneraci musí
   být objekt tréninku shodný s původním, ne jen mít stejný počet cviků.
3. Jestli se ukáže, že „beze změny" nejde splnit doslova, oprav TEXT
   v banneru — ne aby slib zůstal a skutečnost se lišila.

---

## 8.3 GENERÁTOR NEZNÁ ULOŽENÝ CÍL VÝŽIVY

Změřeno 31. 8. na stejném přegenerování. Jídelníček se srovnal na
kalorie, ale ne na makra:

```
                 cíl (body_metrics)   nový plán      původní plán
kcal                        2634        ~2685            2151
bílkoviny                  189 g        156 g           163 g
sacharidy                  285 g        252 g           147 g
tuky                        82 g        117 g           106 g
```

Sacharidy se srovnaly. **Tuky jsou o 43 % nad cílem, bílkoviny o 17 %
pod ním.** U redukce jsou přitom bílkoviny to hlavní, co drží svalovou
hmotu — tohle není kosmetika.

Příčina: **uložený cíl výživy se do generátoru vůbec nedostane.**
Grep přes `lib/` a `api/` (mimo testy): `protein_target_g`,
`carbs_target_g` a `fat_target_g` čte jen

```
lib/registration/bodyMetricsRegistration.js   zápis při registraci
lib/calorieTargetIntegrity.js                 zápis při změně cíle
lib/weeklyWeightRecalc.js                     zápis při týdenním přepočtu
lib/nutritionTargets.js:143-145               čtení uvnitř calculateNutritionTargets
```

A `calculateNutritionTargets()` volá registrace, `deterministicFallback`,
`calorieTargetIntegrity` a `weeklyWeightRecalc` — **ne
`unifiedPlanPipeline` ani `planOrchestrator`**, tedy ne hlavní cesta,
kterou plán vzniká.

Generátor přitom nějakou představu o bílkovinách má
(`lib/nutrition/cilBilkovinSlotu.js`, `lib/plan/proteinHint.js`,
`lib/recipesCatalog.js` ř. 1515 pracuje s `targets?.protein_g`) — jen
si ji odvozuje sám, místo aby vzal to, co je uložené u člověka.

### Co udělat

1. **Nejdřív dohledat a POPSAT, odkud dnes generátor bere makra.** Kde
   se v `planOrchestrator`/`unifiedPlanPipeline` vezme `targets`, které
   doteče do `recipesCatalog.js:1515`. Napiš to dřív, než začneš měnit.
2. Teprve pak návrh, jak do té cesty dostat uložený cíl z
   `body_metrics.*_target_g` — a co se stane, když uložený cíl chybí
   (starší účty ho nemají).
3. **Nedělej z maker tvrdou podmínku bez rozmyslu.** Katalog má omezený
   počet receptů (viz `dieta_pod_kritickym_poctem` ve watchdogu); tvrdý
   filtr na tři makra najednou může skončit tím, že se plán nesestaví
   vůbec. Navrhni, jak to ošetřit — tolerance, priorita bílkovin před
   ostatními, nebo něco jiného. Zdůvodni.
4. Měřitelný cíl: součet maker dne se má vejít do tolerance kolem cíle.
   Navrhni, jaká tolerance je poctivá, a napiš, proč zrovna ta.

Tenhle bod je větší než předchozí. Klidně skonči u návrhu a kód nech na
příště — radši dobrý návrh než rychlá změna v generátoru.

---

## Hotovo a nasazeno — NEŘEŠ ZNOVU

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

**`PROGRESSION_BY_EXERCISE.kind` a `CANONICAL_EXERCISES.equipment` se
rozcházejí u `tricep_extension`** — progrese `dumbbell`, statická mapa
`cable`. Stejný vzorec driftu jako u `overhead_press`, kde produkční registry
dala za pravdu progresi a mapa byla stará. Neověřeno, co má pravdu tentokrát.

**Záložka Apple Watch je slepá ulička** — vyzývá „Připoj Apple Health", ale
tlačítko tam žádné není.

**Navigační záložky nemají přístupné jméno** pro odečítače obrazovky.
