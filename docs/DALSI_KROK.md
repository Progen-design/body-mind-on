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

## 8.7 CENA A TRIAL NEJSOU V REGISTRACI NIKDE VIDĚT — BLOCKER SPUŠTĚNÍ

Změřeno 3. 9. 2026. Hledání `599` a `1499` napříč všemi `.tsx` v `src/`
nevrátilo **nic**. Registrace má pět kroků (`REGISTRATION_STEPS`,
`src/components/registrace/StartRegistrace.tsx`, názvy v `volby.ts`)
a v žádném z nich se cena ani délka trialu neobjeví.

Na webu (`bodyandmindon.cz`) přitom stojí, ověřeno průchodem:

```
START      599 Kč / měsíc
ON CLUB  1 499 Kč / měsíc
"7 dní zdarma · platíš až 8. den · zrušíš kdykoli"
"První platba: 8. den"
```

Člověk tedy vidí cenu na webu, projde pěti kroky registrace, kde už ji
nikde nemá, a založí si předplatné. To je u placené služby se zkušební
dobou věc, kterou je potřeba mít vyřešenou dřív, než přijde první platící
člověk — ne kvůli hezčímu UX, ale proto, že si zákazník musí být jistý,
co a kdy zaplatí.

### Co udělat

1. **Do posledního kroku registrace (`krok5`) doplň shrnutí:** co člověk
   dostává, kolik to stojí, kdy proběhne první platba a že může zrušit.
   Text ber doslova z webu, ať se ty dvě čísla nikdy nerozejdou —
   599 Kč / měsíc, 7 dní zdarma, první platba 8. den, zrušíš kdykoli.

2. **Ceny NEPIŠ natvrdo do komponenty.** Vznikl by třetí zdroj pravdy
   (web, Stripe, appka) a jednou se rozejdou. Najdi, odkud appka bere
   cenu pro Stripe checkout, a použij tentýž zdroj. Jestli žádný sdílený
   zdroj neexistuje, **napiš to a navrhni ho** — jeden modul s cenami,
   ze kterého čte appka i checkout. Nezakládej ho, dokud to neschválím.

3. **Zkontroluj, co přesně říká Stripe.** Sedí délka trialu v kódu
   (`trial_period_days` nebo ekvivalent) s tím, co slibuje web?
   Jestli ne, je to nález a nahlas ho — neopravuj to potichu.

4. **Text piš podle `bmon-copy`** (dovednost v repu), ne vlastním
   stylem. Stručně, bez omáčky, bez vykřičníků.

### Co v tomhle bodě NEDĚLAT

Neměň ceny ani délku trialu — jen je zobraz. Nesahej na Stripe
konfiguraci. Nedělej redesign registrace, jen doplň, co chybí.

---

## 8.8 TUKOVÝ CÍL DO VÝROBY RECEPTŮ — JEDINÁ CESTA, JAK SROVNAT MAKRA

**Tenhle bod jsem sám dvakrát odložil. Teď na něj došlo a je potřeba
vědět proč, ať se to nezruší potřetí.**

### Proč teď a ne dřív

Odkládal jsem ho, protože přidat druhé tvrdé kritérium do fronty, která
tehdy pouštěla 17 %, by ji srazilo na nulu. To už neplatí:

- 8.5 zastropovalo `{"podil": X}` na 0,25 a rozbilo eskalující smyčku,
- 8.6a dalo modelu do promptu kombinace surovin, které v katalogu už jsou,
- **měřeno 3. 9.: běh zapsal 10 receptů proti dřívějšímu 1**, brzdou je
  teď denní strop 20, ne zamítání.

Fronta má prostor unést další kritérium.

### Proč to nejde vyřešit řazením

8.4 nasadilo tukovou penaltu do výběru a změřilo, že nestačí:

```
napříč 20 plány, 140 dnů    tuky 149 % cíle, v ±10 % jen 11 ze 140 dnů
r09 (bílkoviny na 108 %)    tuk 132 % → 124 %
r02 (bílkoviny na 67 %)     tuk 154 % → 154 %
```

Rozpad po slotech u r02: oběd **58,2 %** kalorií z tuku proti cíli 28 %.
Řazení nevybere recept, který v katalogu není — a medián receptu má
32–46 % kalorií z tuku. **Katalog je systematicky tučnější, než na co
appka cílí, a sám se v tom zhoršuje:** `llm_generated` (jediný živý zdroj,
+20 receptů denně) má 44–48 % kalorií z tuku, ručně naseedovaný
`coach_seed_v1` má 20–24 %.

Dokud generátor cíl na tuk nezná, každý den katalog zhoršuje.

### Co udělat

1. **Tukový cíl do objednávky a do promptu.** Obdoba `protein_hint`:
   nový sloupec v `recipe_generation_queue` (**migrace jako soubor,
   NEAPLIKUJ**), promítnutí do promptu, validace stejně jako u kalorií.

2. **SE STROPEM, od začátku.** Tohle je poučení z 8.5, kde neomezený
   podíl bílkovin frontu zabil: podíl 0,25 → 67 % úspěšnost, 0,30 → 3 %,
   0,40 a výš → 0 ze 145. Navrhni strop pro tuk a **zdůvodni ho** —
   u tuku je to horní mez („nejvýš tolik"), ne dolní, takže se chová
   opačně a nesmyslně nízký strop je stejně nesplnitelný jako byl vysoký
   u bílkovin. Cíl je 27–28 % kalorií; kolik je rozumné žádat po modelu,
   aby to ještě dodal?

3. **Nezahazuj recept jen kvůli tuku.** Kalorie a bílkoviny už zamítají;
   třetí tvrdá podmínka je přesně to, co srazilo propustnost naposled.
   Navrhni, jestli má být tuk tvrdá validace, nebo jen instrukce
   v promptu bez zamítnutí — a rozhodni to z čísel z 8.5, ne od oka.

4. **Změř dopad na vzorku.** Po nasazení nech doběhnout jeden běh
   a vypiš podíl tuku u nově vyrobených receptů proti dnešním 44–48 %.

### Co v tomhle bodě NEDĚLAT

Nezvyšuj denní strop 20 (Honzovo rozhodnutí, „to bude stačit").
Nesahej na `cilTukuSlotu.js` z 8.4 — ten je nasazený a funguje, jen
nemá z čeho vybírat. Nesahej na sacharidy. Neřeš obrázky (Honza 3. 9.:
„zatím řešit nebudeme").

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
