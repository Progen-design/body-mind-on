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

## 8.1 + 8.3 CÍL VÝŽIVY: SYSTÉM O JEHO ZMĚNĚ NEVÍ A GENERÁTOR HO NEČTE

Dva nálezy, jeden kořen. Sloučené záměrně — opravovat je odděleně nedává
smysl:

- **8.1** — když se změní `body_metrics.calories_target`, nevznikne žádná
  událost. Systém se to nedozví.
- **8.3** — i kdyby se to dozvěděl a plán přegeneroval, generátor uložený
  cíl výživy stejně nečte. Reakce by byla naprázdno.

Proto **Fáze A je kód (8.1), Fáze B je jen analýza a návrh (8.3)**. Mezi
nimi zastav, ukaž diff Fáze A a počkej na „schvaluji". Do generátoru
v téhle session nesaháš ani řádkou.

---

### FÁZE A — kód: událost `target_changed` a migrace pravidel

Kontext a měření: `docs/BMON_EKOSYSTEM.md`. Krátce: řetěz
`ai_events` → `ai_trigger_rules` → `ai_tasks` → exekutory existuje, ale
ze sedmi pravidel je zapnuté jediné (`user_registered → initial_plan`)
a od 10. 3. 2026 se jich nikdo nedotkl. Systém reaguje na člověka přesně
jednou za život.

#### 1. Nová událost `target_changed`

Vzniká, když se změní `body_metrics.calories_target`. Místo, kde se cíl
mění, už existuje jedno: `buildCalorieTargetBodyMetricsPatch()` a jeho
čtyři volající (viz komentář v `lib/calorieTargetIntegrity.js`). Napiš,
kam přesně událost patří, ať nevzniká čtyřikrát nebo vůbec — a proč
zrovna tam.

`enqueueAIEvent()` v `lib/aiEvents.js` už používá `api/profile-preferences.js`
pro `diet_changed` a `goal_changed` — drž se stejného vzoru.

Do payloadu dej **starou i novou hodnotu cíle** a zdroj změny (registrace /
ruční změna cíle / týdenní přepočet). Bez staré hodnoty se v bodě 4 ani
ve Fázi B nedá postavit žádná podmínka — a dodělávat to podruhé je zbytečné.

#### 2. Migrace (soubor, NEAPLIKUJ)

Nové pravidlo `target_changed → adjust_plan` a zapnutí
`missing_plan → initial_plan`. **Obě s `enabled = false`** — zapneme je
ručně a po jednom, až ověřím chování. Migrace je připraví, nespouští.

#### 3. Režim „navrhni, nezasahuj"

`target_changed` NESMÍ v první verzi přepsat člověku jídelníček sám. Má
vyrobit stav, který uvidí na profilu — to už umí banner ze 7.2a
(`nesouladCile()` + `src/components/CalorieMismatchBanner.tsx`).

Navrhni, jak to spojit, aby banner nevznikal z klientského porovnání, ale
ze skutečné události. Pokud ti vyjde, že to bez zapnutého pravidla nejde,
**napiš to a banner nech, jak je** — nepřepisuj ho do stavu, kdy do zapnutí
pravidla nevykreslí nic. Dnes funguje a lidem se zobrazuje.

#### 4. Co se stane s `conditions_json`

U všech sedmi pravidel je `null`, takže pravidlo neumí říct „jen když".
Napiš, co by `target_changed` potřebovalo za podmínku (např. rozdíl větší
než X kcal), ale **NEIMPLEMENTUJ to** — je to vstup pro Fázi B, bod 5.

#### Co ve Fázi A NEDĚLAT

Nezapínej žádné pravidlo naostro. Nezapínej týdenní producer. Nesahej na
`weight_stagnation`, `high_stress` ani `low_adherence` — bez
`conditions_json` by reagovaly na šum. A nesahej na generátor.

#### Konec Fáze A

Celá testovací sada, diff, stop. Na Fázi B pokračuj až po „schvaluji" —
**ve stejné session, bez `/clear`**, ať máš kontext z Fáze A.

---

### FÁZE B — jen analýza a návrh: generátor nezná uložený cíl výživy

Změřeno 31. 8. na přegenerování naostro. Jídelníček se srovnal na kalorie,
ale ne na makra:

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

Příčina: **uložený cíl výživy se do generátoru vůbec nedostane.** Grep přes
`lib/` a `api/` (mimo testy): `protein_target_g`, `carbs_target_g` a
`fat_target_g` čte jen

```
lib/registration/bodyMetricsRegistration.js   zápis při registraci
lib/calorieTargetIntegrity.js                 zápis při změně cíle
lib/weeklyWeightRecalc.js                     zápis při týdenním přepočtu
lib/nutritionTargets.js:143-145               čtení uvnitř calculateNutritionTargets
```

A `calculateNutritionTargets()` volá registrace, `deterministicFallback`,
`calorieTargetIntegrity` a `weeklyWeightRecalc` — **ne `unifiedPlanPipeline`
ani `planOrchestrator`**, tedy ne hlavní cestu, kterou plán vzniká.

Generátor přitom nějakou představu o bílkovinách má
(`lib/nutrition/cilBilkovinSlotu.js`, `lib/plan/proteinHint.js`,
`lib/recipesCatalog.js` ř. 1515 pracuje s `targets?.protein_g`) — jen si ji
odvozuje sám, místo aby vzal to, co je uložené u člověka.

**V téhle fázi nepíšeš kód.** Výstup je jeden dokument:
`docs/BMON_MAKRA_V_GENERATORU.md`.

1. **Popiš, odkud dnes generátor bere makra.** Celá cesta, soubor po
   souboru, s čísly řádků: kde se v `planOrchestrator` / `unifiedPlanPipeline`
   vezme `targets`, které doteče do `recipesCatalog.js:1515`. Tohle je
   nejdůležitější část — bez ní je zbytek dohad.
2. **Návrh, jak do té cesty dostat uložený cíl** z `body_metrics.*_target_g`
   — a co se stane, když uložený cíl chybí. Starší účty ho nemají a fallback
   nesmí být tichý.
3. **Nedělej z maker tvrdou podmínku bez rozmyslu.** Katalog má omezený počet
   receptů (viz `dieta_pod_kritickym_poctem` ve watchdogu); tvrdý filtr na tři
   makra najednou může skončit tím, že se plán nesestaví vůbec. Navrhni, jak
   to ošetřit — tolerance, priorita bílkovin před ostatními, nebo něco jiného.
   Zdůvodni.
4. **Jaká tolerance je poctivá** pro součet maker dne kolem cíle a proč
   zrovna ta. Napiš i to, jestli jde z kódu zjistit, kolik receptů v katalogu
   ji dnes vůbec umožňuje splnit. Když to bez produkce nejde, napiš, jaké
   číslo ti mám změřit — změřím ho a dostaneš ho hotové.
5. **Co z toho patří do `conditions_json`** u `target_changed` (navazuje na
   Fázi A, bod 4): jak velká změna cíle vůbec stojí za reakci.

Konec Fáze B = ten dokument a stop. Kód do generátoru přijde samostatnou
session, až návrh projde. **Radši dobrý návrh než rychlá změna
v generátoru** — je to nejcitlivější místo v celé appce.

---

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
