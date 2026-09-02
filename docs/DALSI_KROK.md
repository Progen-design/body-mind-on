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

## 8.4 TUKOVÝ CÍL: PENALTA TAM, KDE JE Z ČEHO VYBÍRAT

Návrh, ze kterého tenhle bod vychází, je hotový a zmergovaný:
`docs/BMON_MAKRA_V_GENERATORU.md`. **Přečti si ho celý, než začneš** —
tenhle bod je jeho poslední kapitola převedená na práci, ne nové zadání.

Krátce, co z něj platí a co se tím mění:

- Uložený cíl výživy se do generátoru **dostane** (`structured_plan_json.targets`
  se shoduje s `body_metrics` do gramu). Premisa původního 8.3 byla špatná.
- Díra je ve **výběru jídel**. Změřeno na 140 dnech ve 20 aktivních plánech,
  podíl skutečnost/cíl: bílkoviny 94 % (45 % dnů v ±10 %), sacharidy 79 %
  (25 %), **tuky 148 % (10 %)**.
- Tuk nemá dnes na cíl žádnou vazbu. Bílkoviny mají od 23. 8. soft ranking
  (`lib/nutrition/cilBilkovinSlotu.js`), tuk a sacharidy nic.
- **Tolerance u tuku není volba algoritmu — je to strop daný katalogem
  a týdenním stropem opakování** (`MAX_OPAKOVANI_RECEPTU_TYDNE = 2`,
  tvrdé vyloučení, `lib/plan/pestrostReceptu.js:25`).

### Co se dělá

**1. `lib/nutrition/cilTukuSlotu.js`** — zrcadlo `cilBilkovinSlotu.js`,
soft ranking podle podílu tuku na kaloriích, s obrácenou asymetrií vah:
u tuku se penalizuje **přestřelení**, ne podstřelení. Žádný SQL filtr,
žádná tvrdá podmínka. Penalta se přičte do `catalogPickRank()` s nižší
váhou než bílkovinná, aby při konfliktu vyhrály bílkoviny.

**2. Měření zvlášť po `meal_type`, ne jeden průměr.** Pool nízkotučných
receptů v pásmu slotu (cíl ±15 %) je změřený a je dramaticky nerovnoměrný:

```
2634 kcal / 5 jídel     slotů/týden   pool tuk ≤28 %   nutné minimum
oběd                          7             49                4
večeře                        7             33                4
snídaně                       7             11                4
svačina                      14              8                7
```

U oběda a večeře má penalta na čem stavět. U svačiny je pool 6–8 proti
potřebě 14 slotů týdně — a u šestijídlových plánů 7 proti 21 slotům, kde
nutné minimum je 11, tedy **pod hranicí, ne na hraně** (dodatek v návrhu).
Jeden zprůměrovaný výsledek by úspěch u oběda schoval za neúspěch
u svačiny. Test i výstup měření musí být per `meal_type`.

**3. Nesahej na sacharidy.** Návrh tvrdí, že jsou svázané s tukem přes
sdílený energetický rozpočet a mohly by se zlepšit jako vedlejší efekt.
Je to hypotéza, ne fakt. Ověří se **po** nasazení tukové penalty
přeměřením, ne dalším kódem.

**4. Perzistuj diagnostiku.** `trefaBilkovin` (`recipesCatalog.js:1525-1531`)
se dnes počítá a zahazuje. Přidej `protein_trefa` i nový `fat_trefa` do
`planOut._diagnostics` — bez toho se dopad téhle změny nedá změřit jinak
než ručním dotazem do `structured_plan_json`.

### Co v tomhle bodě NEDĚLAT

Nedovážej recepty do katalogu — to je samostatná práce a moje měření
(potřeba: 21 nízkotučných svačin v pásmu, minimum 11). Nesahej na
`conditions_json` ani na `lib/aiDecisionEngine.js`. Nezapínej žádné
pravidlo. Nezaváděj tvrdý filtr na makra do SQL, za žádných okolností —
`fetchCatalogCandidates()` nemá dostat `minProtein`/`maxFat` do `WHERE`.

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
