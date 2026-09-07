# Další krok pro Claude Code

## Pravidla, která platí nade vším

- **Neměř produkci.** Žádné dotazy do DB, žádné Vercel MCP, žádné volání
  produkčních endpointů. Čísla dostaneš hotová.
- **Migrace píšeš jako soubor, NEAPLIKUJEŠ ji.** Nasazuje ji Honzův druhý
  Claude, a když ji kód potřebuje, tak před mergem.
- Eslint na `src/` nespouštěj, repo ho tam nemá.
- **ZADÁNÍ NENÍ PŘÍKAZ. Autor zadání se plete pravidelně.** Když v něm něco
  nesedí — čísla si odporují, odkaz míří jinam, vzorec dá nesmyslný
  výsledek — ZASTAV SE a napiš to, místo abys to poslušně implementoval.
  Tohle pravidlo vzniklo 7. 9. 2026 po bodu 9.1: v zadání stálo
  „TDEE = BMR × koeficient_aktivity, už existuje". Ten koeficient ale vrací
  0,95, takže vzorec dal cíl POD bazálním metabolismem — 1377 kcal pro
  ženu, jejíž BMR je 1449. Zadání bylo špatně, implementace věrná.
- **Po každém výpočtu si spočítej jeden případ ručně a podívej se, jestli
  výsledek dává smysl.** Ne jestli prošel test — jestli to číslo může být
  pravda. Kalorický cíl pod bazálem, porce 2 kg, trénink o 14 cvicích:
  takové výsledky se hlásí, ne odevzdávají.
- Bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná mock data, žádný
  Next.js, jeden zdroj pravdy.
- **Před „hotovo" spusť celou sadu**, ne jen `test:src`:
  `npm run test:unit`, `npm run test:src`, `npx tsc --noEmit`,
  `npm run lint:copy`, `npm run build`.
  (`build` proto, že modul z `lib/` se od 8.2 importuje i do SPA.)
- Konec = diff a čekání na „schvaluji". **Necommituj sám** — a to platí
  i proti pokynu v chatu.

---

## 9.6 PLÁN MÁ BĚŽET 7 DNÍ OD REGISTRACE — DNES SE KOTVA POSOUVÁ PO VÝPADKU

Změřeno 7. 9. 2026 na účtu janprikopa@gmail.com. Dnes je **pondělí**,
aplikace ukazuje týdenní jídelníček od **čtvrtka 3. 9.**

    plan 5d7dea6e  valid_from 2026-09-03 (Ct)  valid_until 2026-09-09 (St)
                   generated_by  ai-task:weekly_plan_update
                   created_at    2026-09-01    updated_at 2026-09-03 22:05

Historie plánů toho účtu:

    2026-08-03  pondeli
    2026-08-13  ctvrtek     <- tady se kotva rozjela
    2026-08-20  ctvrtek
    2026-08-27  ctvrtek
    2026-09-03  ctvrtek

### Proč

Řetěz je funkčně v pořádku a je spojitý. `computeTargetFrom()`
v `lib/weeklyPlanProducer.js` počítá `max(valid_until + 1, dnešek)`, takže
plán navazuje den po předchozím. `executeTrainerTask` ten `target_from`
respektuje (ověřeno v kódu — má přednost před odvozením z `latestPlan`).

**OPRAVA MOJÍ VLASTNÍ DIAGNÓZY (7. 9. 2026 večer).** Napsal jsem, že kotvu
rozjelo `force_regenerate` 13. 8. To je špatně — data říkají něco jiného
a je to důležitější:

    valid_from  den  generated_by                  vzniklo
    2026-08-03  Mon  admin-regenerate-user-plan    2026-08-02
    2026-08-13  Thu  ai-task:weekly_plan_update    2026-08-13   <- tady
    2026-08-20  Thu  admin-regen-ulozeny-cil       2026-08-13
    2026-08-27  Thu  unified-pipeline-email        2026-08-14
    2026-09-03  Thu  ai-task:weekly_plan_update    2026-09-01

Plán 13. 8. vyrobila **normální weekly úloha**, ne force. Předchozí plán
skončil v neděli 9. 8., producent doběhl až ve čtvrtek 13. 8. — a
`computeTargetFrom` vzal `max(valid_until + 1, dnešek) = max(10. 8., 13. 8.)
= 13. 8.` To je jeho **doběhové pravidlo** a je napsané schválně (viz
komentář v `weeklyPlanProducer.js`: kdo přišel o týden, dostane plán od
dneška, zmeškané týdny se zpětně negenerují).

Jenže tím se kotva **přepíše natrvalo**. Tři dny výpadku producenta v srpnu
posunuly celý cyklus z pondělí na čtvrtek — a od té doby ho každý další
běh poctivě posouvá o 7 dní. Nic to nikdy nevrátí zpátky.

### DRUHÁ OPRAVA (7. 9. 2026): TEN PLÁN NENÍ ŠPATNĚ

Honza doplnil, že cyklus je navázaný na **týden zdarma a placení od 8. dne**.
To mění závěr celého bodu — dohledáno v kódu i v datech:

- `membershipFromRegistration()` zakládá `status: 'pending_payment'`,
  `trial_ends_at: null`. **Trial drží Stripe** (`trial_period_days = 7`
  v `api/stripe/create-checkout-session.js`), a začíná až checkoutem.
  Registrace plán vygeneruje, ale **zamčený**.
- Honzova membership: `started_at = 2026-08-13 16:31`, tier START,
  status active. Tedy odemkl 13. 8.

A teď to podstatné. Cyklus od 13. 8. po sedmi dnech:

    13. 8. -> 20. 8. -> 27. 8. -> 3. 9. -> 10. 9.

**Plán 3.–9. 9., který v aplikaci je, na té mřížce přesně sedí.** Není
posunutý o čtyři dny — je správně. Začíná ve čtvrtek proto, že Honza
odemkl ve čtvrtek, a to je přesně to, co jeho vlastní pravidlo říká.

Cyklus se 13. 8. nerozjel náhodou. Přeskočil na den, kdy začalo
předplatné, protože do té doby žádný weekly plán vzniknout NESMĚL —
`canRenewPlanForMembership` vrací u `pending_payment`
`allowed: false`. Díra 10.–12. 8. tedy není výpadek producenta, ale
zamčený účet. Doběhové pravidlo `max(valid_until + 1, dnešek)` pak
kotvu srovnalo na den odemčení. Udělalo správnou věc.

**Takže: měřením potvrzený stav je, že tenhle konkrétní plán je v pořádku
a moje původní diagnóza byla dvakrát vedle.** Nejdřív jsem svaloval na
`force_regenerate`, pak na výpadek producenta. Ani jedno.

Změřeno na všech pěti neteestovacích účtech:

    email                          registrace  predplatne  odstup  prvni plan
    janprikopa@gmail.com           2026-08-03  2026-08-13   10 dnu  2026-08-03
    vikyklajnik@gmail.com          2026-08-03  2026-08-03    0      2026-08-03
    ondra.novak18@gmail.com        2026-08-14  2026-08-14    0      2026-08-14
    ondranovak24@gmail.com         2026-08-21  2026-08-21    0      2026-08-21
    ondrej.novak.trener@gmail.com  2026-09-03  2026-09-03    0      2026-09-03

U čtyř z pěti je **registrace = odemčení = start plánu**, takže „7 dní od
registrace" a „7 dní od začátku placeného týdne" je totéž. Odstup má
jediný účet — Honzův, a to proto, že testoval.

### CO Z TOHO ZBÝVÁ OPRAVIT

Dvě věci, obě měřitelné, ani jedna urgentní:

**1. Kotva se pořád může utrhnout.** Doběhové pravidlo bere `dnešek`,
takže když producent zaspí u PLATÍCÍHO účtu (kde už plán vzniknout smí),
cyklus se posune mimo mřížku předplatného a zůstane tam. 13. 8. to
vyšlo dobře náhodou — kotva se trefila na den odemčení. Příště nemusí.
Řešení je pořád stejné jako níž, jen se mřížka počítá z
`memberships.started_at`, NE z `bm.created_at`: u Honzy jsou to různá data
(3. 8. vs 13. 8.) a správné je to druhé, protože podle něj se i účtuje.

**2. Plán vygenerovaný při registraci se dá „propásnout".** Vzniká
s `valid_from` = den registrace, ale je zamčený do checkoutu. Kdo odemkne
za 10 dní (jako Honza), odemyká plán, který už týden neplatí. Kdo odemkne
třetí den, dostane ze slíbených 7 dní zdarma reálně 4. Slib v lifecycle
e-mailu zní „prvních 7 dní zdarma, platíš až 8. den" — a ten se počítá od
checkoutu, ne od registrace. **Čistá varianta: při přechodu na `active`
plán překotvit na den odemčení.** Je to ale změna produktového chování
a peněz se dotýká, takže čeká na Honzovo rozhodnutí, ne na Code.

### PŮVODNÍ ROZHODNUTÍ HONZY 7. 9. 2026 — KOTVA JE REGISTRACE, NE PONDĚLÍ

> „Pokud se registruji ve středu, tak to není pondělí, takže je potřeba ty
> plány mít nastavené tak, že je to vždy 7 dní od dané registrace a ne od
> toho, kdy začíná týden."

**Zarovnání na pondělí je tím zamítnuté.** `nextMondayStartIsoPrague()`
v `lib/czechCalendar.js` (dodnes nikým nevolaná — grep přes `lib/`, `api/`,
`src/`, `scripts/` najde jen definici) se tedy zapojovat NEBUDE.

To pravidlo dává cyklům přesnou definici: **`registrace + 7k`.** Plán
`initial_plan` už dnes startuje dnem registrace
(`initialPlanWeekRangeFromRegistration`), takže u nového uživatele je
chování správné. Rozbíjí ho až doběhové pravidlo v `computeTargetFrom`.

Změřeno na účtu janprikopa@gmail.com:

    registrace           2026-08-03 (pondeli, cas prazsky)
    dnu od registrace    35   =  přesně 5 cyklů, zbytek 0
    cyklus bezici dnes   2026-09-07 - 2026-09-13
    plan v aplikaci      2026-09-03 - 2026-09-09     <- posunuty o 4 dny

Honzova intuice („dneska je pondělí, mělo by to navazovat") a jeho pravidlo
si tedy odpovídají — registroval se v pondělí, takže cyklus vychází na
pondělí. U uživatele registrovaného ve středu bude cyklus středa–úterý a
bude to tak správně.

### Co udělat

Doběhové pravidlo v `computeTargetFrom()` nesmí kotvu přepisovat. Místo
`max(valid_until + 1, dnešek)` se má **přichytit na mřížku
`registrace + 7k`**:

- Plán ještě běží nebo právě skončil → `valid_until + 1`. To už na mřížce
  je a nic se nemění.
- Producent zaspal a `valid_until + 1` je v minulosti → vzít **začátek
  cyklu, ve kterém je dnešek**, tedy
  `registrace + 7 * floor((dnešek − registrace) / 7)`. NE dnešek.

Tím se zmeškané cykly pořád zpětně negenerují (to pravidlo platí dál a je
správné), ale mřížka přežije. Po výpadku se cyklus sám vrátí tam, kam
patří, místo aby se posunul napořád.

**Vědomý kompromis, který v tom je:** když producent zaspí do půlky cyklu,
plán začne v minulosti a uživateli zbyde jen zbytek cyklu — ne celých 7
dní. To je záměr, ne chyba. Alternativa (posunout start na dnešek) je
přesně to, co kotvu rozbilo; alternativa „počkat na další cyklus" by
nechala díru bez plánu. Krátký plán je z těch tří nejmenší zlo a další
už zase sedí. **Napiš to do komentáře**, ať to za měsíc nikdo „neopraví".

**Zdroj kotvy je `memberships.started_at`, NE `bm.created_at`.** Viz druhá
oprava výš: u Honzy jsou to různá data (3. 8. registrace vs 13. 8. začátek
předplatného) a správné je to druhé — podle něj běží placený cyklus i
Stripe. U ostatních čtyř účtů se obě data shodují, takže na nich rozdíl
vidět nebude; testuj proto i na tom rozdílu, ne jen na shodě.

Když `started_at` chybí, chová se `computeTargetFrom` jako dosud
(`max(valid_until + 1, dnešek)`) — bez kotvy není mřížku z čeho počítat
a hádat se nemá.

Pozor na `idempotency_key` (`weekly:<user>:<target_from>`) a
`UNIQUE(user_id, target_from)`: hodnota `target_from` se změní, takže po
nasazení může vzniknout úloha na nové datum vedle staré pendingové na
datum staré. UNIQUE to nezachytí (jiné datum). **Pendingové úlohy uklidím
já**, ty jen napiš, že to je potřeba.

### Testy

`computeTargetFrom` je čistá funkce bez DB — testuje se chováním, ne
tvarem zdrojáku:

- Plán běží → `valid_until + 1`, kotva se nepoužije.
- Producent zaspal o 3 dny (přesně případ z 13. 8.: registrace pondělí,
  `valid_until` neděle, dnešek čtvrtek) → vyjde **pondělí**, ne čtvrtek.
  Tenhle test je celý smysl bodu — kdyby padl, kotva se rozjede znovu.
- Registrace ve **středu** → cyklus je středa–úterý a při výpadku se vrací
  na středu. Pondělí se nesmí objevit nikde.
- Výpadek delší než týden → vezme se cyklus obsahující dnešek, ne první
  zmeškaný. Zmeškané cykly se negenerují.
- Chybí `bm.created_at` → chování jako dosud.

### Nedělat

- **Neměnit `sevenDayRangeFromTodayIso`** — je to fallback pro
  `force_regenerate` a pro účty bez předchozího plánu a zůstává „od
  dneška". Kdo si vynutí přegenerování, chce plán od dneška.
- **Nezapojovat `nextMondayStartIsoPrague`.** Honza zarovnání na pondělí
  zamítl. Nemazat ji ale — napiš do ní komentář, že se nepoužívá a proč
  (rozhodnutí 7. 9. 2026, kotva je registrace).
- Negenerovat zmeškané cykly zpětně. Jídelníček na minulé úterý nikomu
  nepomůže a stojí stejně jako dnešní.
- Neopravovat data existujících plánů ani pendingové úlohy. To udělám já.

---

## 9.5 — HOTOVO A NASAZENO (PR #169, 4a343d7). NEŘEŠ ZNOVU.

Migrace `20260907150000` aplikovaná a orazítkovaná 7. 9. 2026.

    pouzitelnych dotazu v rotaci     14  ->  57
    radku vraceno na offset 0                58
    slouceno s dvojcetem                      1
    radek s rt=40 (id 2745)             netknuty

**První běh po rozšíření se ještě nestihl** — denní rozpočet bodů byl už
vyčerpaný dvěma dnešními běhy (`import_denni_rozpocet_vycerpan`, info).
Skutečná čísla „kolik receptů to přineslo" budou až po cronu v 03:00 UTC.

Hlídka po nasazení: `import_nebezel` i `import_rotace_vycerpana` **zmizely**
(import dneska běžel, pool má 57 dotazů). Nový `import_nizka_kvota`
(warning, quota_left 19.2) je správně a je to informace, ne porucha.
Falešný critical z `budget_exhausted` NEVZNIKL — ta větev má vlastní
`info` hlášku, na rozdíl od toho, čeho se bál komentář v 9.3.

### Tři věci, které se ukázaly až při aplikaci na produkci

Zadání i implementace je minuly. Zapsané, ať se neopakují:

1. **Čas se smí jen zvyšovat.** Řádek id=2745
   `main course|carb=40|kcal=400-800|rt=40|slot=obed` měl `maxReadyTime`
   **40**, tedy víc než cílových 35. Dosadit mu cíl by dotaz ZÚŽILO a
   navrch shodilo jeho `next_offset` (36) na nulu. Migrace proto používá
   `GREATEST` a post-check porovnává „aspoň cíl", ne rovnost. Je to táž
   úvaha, kterou Code správně použil na řádky bez `maxReadyTime` — jen ji
   nikdo nedotáhl na řádky, které jsou širší už teď.

2. **Rozšířením mohou dva dotazy splynout v jeden.** `query_signature` má
   UNIQUE index a `rt=` je jeho součástí, takže dotazy lišící se JEN časem
   mají po zvýšení tentýž podpis. Na produkci to nastalo jednou:
   id 2732 (`rt=30`) vs. id 2754 (`rt=35`), jinak identické. Migrace na to
   původně spadla na constraintu. Teď kolizi detekuje a druhý z dvojice
   trvale vyřadí jako `merged_after_widening`.

3. **CHECK na `retired_reason` trvalý důvod vůbec nepřipouštěl.** Znělo to

        CHECK (retired_reason IS NULL OR retired_reason IN ('pool_exhausted','pool_empty'))

   — tedy PŘESNĚ hodnoty z `DOCASNE_DUVODY_VYRAZENI`. Komentář
   v `lib/spoonacular/importQueryRotation.js` (z bodu 9.3, PR #166) přitom
   slibuje: „JAKÝKOLI JINÝ důvod znamená trvalé ruční vyřazení — takový
   dotaz se znovu NEOTVÍRÁ." Jenže žádný jiný důvod nešlo do sloupce
   zapsat, takže ta větev hlídala stav, který DB nedovolila vzniknout, a
   po 30 dnech se do rotace vracelo úplně všechno. CHECK je rozšířený,
   slib teď platí a `merged_after_widening` je jeho první skutečný případ.

   **Kdo bude přidávat další trvalý důvod, přidá ho do CHECKu a NEPŘIDÁ
   ho do `DOCASNE_DUVODY_VYRAZENI`.**

Původní zadání níž.

## 9.5 (PŮVODNÍ ZADÁNÍ)

Rozhodnutí Honzy 7. 9. 2026: **„není důležitý čas, ale jednoduchost."**
Uvolnit čas na 35 minut a zvednout i strop kroků, ať je receptů co nejvíc.

Podklad je v sekci 9.3 výš (první ostrý běh: 70 receptů staženo, 0
vloženo, 19 z 37 zamítnutí bylo `too_many_steps`; `total_results` u dotazů
0–44).

### Kde se ta čísla berou — POZOR, JSOU NA DVOU MÍSTECH

1. **Pravidla po stažení** — `lib/spoonacular/catalogImportGate.js`, řádky
   20–23:

        snidane: { maxMainIngredients: 10, maxReadyTime: 20, maxSteps: 12 }
        svacina: { maxMainIngredients: 10, maxReadyTime: 15, maxSteps: 99 }
        obed:    { maxMainIngredients: 10, maxReadyTime: 30, maxSteps: 8 }
        vecere:  { maxMainIngredients: 10, maxReadyTime: 30, maxSteps: 6 }

2. **Parametry samotného dotazu na API** — sloupec `params`
   v `spoonacular_import_queries`, například:

        {"type":"main course","maxCalories":900,"minCalories":520,"maxReadyTime":20}
        query_signature: "main course|di=|rt=20|slot=obed"

   `mergeFiltersWithMealRules()` dosazuje pravidlo jen tehdy, když filtr
   chybí (`if (merged.maxReadyTime == null)`). **Řádky v DB jsou tedy
   přísnější než tabulka pravidel a přebíjejí ji.** Kdo změní jen tabulku,
   nezmění nic — API se pořád zeptá na `maxReadyTime=20`.

### Cílové hodnoty

        snidane: maxReadyTime 25, maxSteps 14
        svacina: maxReadyTime 20, maxSteps 99   (kroky beze změny)
        obed:    maxReadyTime 35, maxSteps 12
        vecere:  maxReadyTime 35, maxSteps 12

Proč se u kroků nebojím o „jednoduchost": Spoonacular krájí instrukce
extrémně jemně — „Preheat the oven" a „Chop the onion" jsou dva kroky.
Počet kroků tedy měří hlavně upovídanost receptu. Skutečné pojistky
jednoduchosti zůstávají nedotčené a **nesahej na ně**:
`maxMainIngredients: 10` a `COMPLEX_PREP_REGEX` v `catalogSimplicity.js`
(marinovat přes noc, tlakový hrnec, fritování, cukrářský teploměr).

### Migrace na řádky dotazů

Napiš migraci, která u `spoonacular_import_queries`:

- zvýší `params->>'maxReadyTime'` na cílovou hodnotu podle slotu
  (slot je v `query_signature` za `slot=`, a je i ve sloupci
  `catalog_meal_type`),
- přepíše `query_signature`, aby v něm `rt=` odpovídalo nové hodnotě,
- **resetuje `next_offset` na 0** u každého řádku, kterému se
  `maxReadyTime` změnil, a zároveň vynuluje `exhausted_at`,
  `retired_reason` a `empty_streak`.

Reset offsetu je nutný, ne volitelný: širší dotaz vrací jinou a větší
množinu v jiném pořadí, takže staré `next_offset` (u obědu 44) ukazuje
doprostřed něčeho, co už neexistuje. Jednorázově to znamená víc duplicit
při prvním běhu — to je zaplacená cena, ne chyba. Napiš to do komentáře
migrace, ať to za měsíc nikdo „neopraví" zpátky.

Migrace musí být idempotentní a po sobě si ověřit, že
`query_signature` a `params->>'maxReadyTime'` spolu souhlasí u všech 66
řádků.

### Testy

- Tabulka pravidel má nové hodnoty a `svacina.maxSteps` zůstalo 99.
- `mergeFiltersWithMealRules()` pořád nechává explicitní filtr vyhrát nad
  pravidlem (to chování se nemění, jen se posouvají čísla).
- `COMPLEX_PREP_REGEX` a `maxMainIngredients` beze změny — test, který to
  hlídá, ať existuje, protože právě tudy by se dovnitř dostala složitost.
- Migrace: `rt=` v podpisu odpovídá `params`, offsety vynulované.

### Nedělat

- Neměnit `minProtein` (5) ani `maxSugar` (30). Ty zamítly dohromady 4
  recepty ze 70 — nejsou to úzké hrdlo.
- Nezakládat nové dotazy do rotace. Nejdřív chci vidět, kolik přinese
  rozšíření těch stávajících.
- Nesahat na denní rozpočet bodů ani na `MAX_QUERIES_PER_RUN`.
- Neaplikovat migraci. Píšeš soubor.

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

## 9.3 — HOTOVO A NASAZENO (PR #166). NEŘEŠ ZNOVU.

Migrace `20260907130000` aplikovaná a orazítkovaná 7. 9. 2026.
Ověřeno hned po ní na produkci — obě větve už mluví:

- `import_nebezel` = **warning**, „Spoonacular import 48 h nebezel, pool
  dotazu je prazdny", poslední běh 2026-08-20 03:00. Předtím ji umlčoval
  právě prázdný pool.
- `import_rotace_vycerpana` = **warning** (bylo `info`), 66× vyčerpaný
  dotaz, 0 použitelných.

Změřený dopad znovuotevírání: z 66 dotazů se při nejbližším běhu vrátí do
rotace **36** (vyčerpané před 8. 8., tedy dřív než před 30 dny). Zbylých 30
(vyčerpané 8.–20. 8.) doputuje za lhůtu postupně během následujících týdnů.
Trvale ručně vyřazený dotaz se neotevře žádný — všech 66 má
`retired_reason` buď NULL (3×), `pool_exhausted` (55×) nebo `pool_empty`
(8×), což jsou důvody automatu.

Náklad znovuotevření: dotaz, který po návratu do rotace zase nic nenajde,
spotřebuje jednu stránku (~1 bod) a zavře se na další měsíc. Při 66
dotazech je to ~66 bodů měsíčně — proti dennímu rozpočtu zanedbatelné.

### CO UKÁZAL PRVNÍ OSTRÝ BĚH — MECHANIKA FUNGUJE, KATALOG NEROSTE

Cron spuštěný ručně hned po nasazení (7. 9. 2026 17:44, první běh od
20. 8.):

    dotazu probehlo     22
    receptu stazeno     70
    VLOZENO             0
    duplicit            33
    zahozeno filtrem    37  (too_many_steps 19, too_complex 8,
                             not_a_recipe 4, max_sugar 3,
                             protected 2, min_protein 1)
    API requestu        11
    bodu                17.7   (dosly, beh se zastavil na rozpoctu)

Znovuotevření tedy prokazatelně funguje — import po 18 dnech zase běžel.
**Nepřineslo to ani jeden recept a příště nepřinese taky.** Důvod je
v `total_results` u dotazů, které doběhly:

    main course|di=|rt=20|slot=obed        44
    main course|di=|rt=20|slot=vecere      44
    main course|di=gluten free|slot=obed    9
    breakfast|di=|rt=15|slot=snidane        6
    salad|di=vegetarian|rt=20|slot=obed     3
    soup|di=vegetarian|rt=20|slot=obed      0
    salad|di=vegan|rt=20|slot=obed          0
    soup|di=vegan|rt=20|slot=vecere         0

To NENÍ „došli jsme na konec stránkování a za měsíc přibude". To je celý
výsledek, který Spoonacular pro ten dotaz má. Nejštědřejší dotaz z celé
rotace vrací 44 receptů — a ty už v katalogu jsou (proto 33 duplicit ze
70). Osm z 22 dotazů vrací dlouhodobě nulu.

**Závěr: rotace 66 dotazů je vyčerpaná u zdroje, ne v našem stránkování.**
121 běhů → 47 receptů za celou historii. Katalog má dnes 895 aktivních
a 209 neaktivních receptů; Spoonacular k tomu už nic nepřidá, dokud se
nezmění SAMY DOTAZY.

Kde je prostor (změřeno, ne odhad):

1. **Dotazy jsou moc úzké.** `readyInMinutes` 15–20 minut × dieta × slot
   dělá kombinace, které v Spoonacularu skoro nic nemají (vegan polévka
   do 20 minut = 0). Uvolnit čas na 30–35 minut u obědů a večeří je
   jediná změna, která zvětší zdrojovou množinu řádově.
2. **`too_many_steps` zahodilo 19 ze 70 (27 %)** — nejsilnější filtr ze
   všech. Práh je v `getMealSimplicityRules()`
   (`lib/spoonacular/catalogSimplicity.js`). Stojí za to změřit, kolik
   receptů by prošlo při prahu o 2 kroky vyšším, než ho měnit naslepo.

Obojí je rozhodnutí o produktu (jak složité jídlo ještě chceme uživateli
dát), ne technická oprava — proto to tady jen leží změřené a čeká na
Honzu. **Nedělej z toho úkol pro Code sám od sebe.**

Původní zadání níž.

## 9.3 (PŮVODNÍ ZADÁNÍ)

Změřeno 7. 9. 2026.

    posledni beh importu      2026-08-20 03:00     (pred 18 dny)
    behu celkem               121
    vlozeno celkem            47 receptu
    behu za posledni tyden    0

Cron je přitom nastavený správně — `vercel.json`, `/api/cron/import-spoonacular`,
`0 3 * * *`, jednou denně. Spustí se, nenajde co dělat a skončí, aniž by
o běhu vznikl záznam.

### Proč

Všech 66 řádků v `spoonacular_import_queries` je mimo hru:

    meal_type      dotazu   vyrazenych   duvody
    main course      25        24        pool_empty, pool_exhausted
    snack            10        10        pool_exhausted
    breakfast         9         8        pool_empty, pool_exhausted
    salad             8         7        pool_empty, pool_exhausted
    soup              8         8        pool_empty, pool_exhausted
    dessert           4         4        pool_empty, pool_exhausted
    appetizer         2         2        pool_exhausted

    pouzitelnych: 0

Rotace dotazů se vyčerpala a nikdo ji nedoplnil. Katalog tudy přestal růst.

### Proč se to nedozvíme

Dvě větve hlídky se navzájem umlčí:

- `import_rotace_vycerpana` má severity **`info`** — „není co importovat".
- `import_nebezel` (warning) má v podmínce
  `EXISTS (SELECT 1 FROM spoonacular_import_queries WHERE exhausted_at IS NULL
  AND retired_reason IS NULL)` — tedy **nehlásí nic, právě když je pool prázdný**.

Takže stav „import osmnáct dní nic nedělá" se hlásí jako informace, ne jako
problém. Stejný vzorec jako falešný `critical` u 8.19, jen obráceně: tam
křičelo něco funkčního, tady mlčí něco rozbitého.

### CO UDĚLAT

**1) Rotace se musí umět doplnit sama.**

Dnes je seznam dotazů jednorázová dávka, kterou někdo nasypal a která došla.
Navrhni mechanismus, který ji drží živou, a v shrnutí popiš, PROČ zrovna ten.
Možnosti, mezi kterými se rozhoduj (můžeš i jinou, když ji obhájíš):

- **Znovuotevření po čase.** `exhausted_at` neznamená „navždy prázdné" —
  Spoonacular přidává recepty průběžně, takže dotaz vyčerpaný před měsícem
  může dnes vracet nové. Znovu otevřít dotaz, který je `exhausted` déle než
  N dní, a začít od `next_offset`.
- **Generování kombinací.** Dotazy jsou `params` v jsonb. Z uzavřených
  seznamů (typ jídla × kuchyně × hlavní surovina × kalorické pásmo) jde
  vyrobit řádově víc kombinací, než jich je dnes 66.

`retired_reason` respektuj — dotaz vyřazený natrvalo se znovu neotevírá.
Rozliš to od `exhausted_at`, to jsou dvě různé věci a dnes se chovají stejně.

**2) Prázdný pool musí být vidět jako problém, ne jako informace.**

Uprav větve v `system_health_alerts_zaklad`:

- `import_rotace_vycerpana` — zvedni ze `info` na `warning`. Když není co
  importovat, katalog neroste, a to je provozní problém.
- `import_nebezel` — dnes se schválně vypne, když je pool prázdný. To je
  přesně naopak, než má být. Ať hlásí i tehdy, jen s jiným textem
  („import 48 h neběžel, pool dotazů je prázdný").

Aktuální definici pohledu vytáhni přes `pg_get_viewdef`, měň VÝHRADNĚ tyhle
dvě větve, zbytek znak po znaku stejný, a obnov `security_invoker`
(viz migrace 20260907110000).

**3) Import ať zapíše běh i když nic neudělal.**

Dnes při prázdném poolu nevznikne řádek v `spoonacular_import_runs`, takže
z dat nejde poznat rozdíl mezi „cron neběžel" a „cron běžel a neměl co
dělat". Zapiš běh vždycky, s důvodem přeskočení — stejně, jako to od 26. 8.
dělá generátor receptů (`lib/recipeGeneratorRun.js`, zápis o běhu i když
nic nevzniklo).

### NEDĚLAT

- Neměň rozvrh cronu. `0 3 * * *`, jednou denně, je správně a je to
  pravidlo — Honza to potvrdil 7. 9.
- Nezvyšuj počet importovaných receptů na běh. Cílem je, aby import zase
  měl co dělat, ne aby bral víc najednou.
- Nesahej na denní rozpočet ani na `budget_exhausted` větev.
- Nespouštěj migraci. Píšeš jen soubory.
- Neměř produkci. Čísla výš jsou změřená.

---

## 9.2 — HOTOVO A NASAZENO (PR #166). NEŘEŠ ZNOVU.

Migrace `20260907140000` aplikovaná a orazítkovaná 7. 9. 2026.
Po ní `registrations_viselec` z `system_health_alerts` **zmizel** — všech
16 falešných warningů je pryč, řádky v `registrations` zůstaly.

Ověřeno v produkci, že `delete_user_data` má opravdu podpis
`(target_user_id uuid, target_email text DEFAULT NULL)` — jediný overload,
žádný drift — a že větev podle e-mailu maže z `registrations`, `waitlist`
i `users` přes `lower(email)`. Bez `target_email` se ta větev nespustí,
proto ta změna v `api/delete-account.js` není kosmetika.

Původní zadání níž.

## 9.2 (PŮVODNÍ ZADÁNÍ)

Objeveno 7. 9. 2026 hodinu po tom, co dostalo `ai_generated_plans` cizí klíč
(bod 9.1/E). Smazal jsem 16 testovacích účtů a v hlídce vyskočilo:

    warning  registrations_viselec  "Registrace ulozena, ucet nevznikl"  16x
             janprikopa+r01@gmail.com, janprikopa+r02@gmail.com, ...

Přesně těch 16, co jsem smazal. Alert tvrdí opak toho, co se stalo.

### Proč

Větev `registrations_viselec` v `system_health_alerts_zaklad` porovnává
tabulku `registrations` proti `profiles`:

```sql
FROM registrations r
LEFT JOIN profiles pr ON lower(pr.email) = lower(r.email)
WHERE pr.id IS NULL AND NOT je_testovaci_email(r.email)
```

Řádek v `registrations` po smazání účtu zůstává, protože `registrations`
vzniká PŘED účtem — cizí klíč na `auth.users` tam z principu nepatří, na
rozdíl od `ai_generated_plans`. Pro pohled je pak „smazaný účet" a „účet
nikdy nevznikl" totéž.

Naměřeno: 36 registrací celkem, 21 bez profilu. Z toho 16 je
`janprikopa+*` (smazané testy) a 5 je `info+bm-*@bodyandmindon.cz`,
které `je_testovaci_email()` správně odfiltruje.

### Proč to není kosmetika

`registrations_viselec` má odhalit, že se registrační flow rozbil a lidem
nevznikají účty. To chceš vědět hned. Když v ní trvale svítí šestnáct
falešných záznamů, tak až se to opravdu stane, zapadne to mezi ně — stejný
mechanismus jako u falešného `critical` v bodu 8.19. Navíc se to bude
opakovat po KAŽDÉM úklidu testovacích účtů.

### CO UDĚLAT

**1) `api/delete-account.js` ať smaže i řádek v `registrations`.**

Zjisti si, jak dnes maže (podle 9.1/E prochází dynamicky tabulky se
sloupcem `user_id`). `registrations` se klíčuje e-mailem, ne `user_id`,
takže ji ta smyčka minula. Doplň explicitní smazání podle e-mailu mazaného
uživatele.

Je to ZÁMĚRNÉ smazání, ne cizí klíč — napiš k tomu do kódu proč, ať to
někdo nepřidá do FK smyčky a nerozbije tím registraci, která zatím účet
nemá.

**2) `je_testovaci_email()` ať zná `+` aliasy.**

Dnešní tvar zná jen `info+`/`smoketest+` na doméně `bodyandmindon.cz`,
`@example.*` a `bm-smoke-*`. Testuje se ale běžně přes `janprikopa+u01@`
a podobné aliasy na Gmailu — a ty hlídka bere jako skutečné lidi.

Rozšiř funkci tak, aby za testovací považovala i adresu s `+` značkou,
která začíná na `t`, `r`, `u` nebo `test`. Nedávej tam natvrdo Honzův
e-mail — to je konfigurace osoby, ne pravidlo systému.

Migrace, `CREATE OR REPLACE FUNCTION`. Signatura ani návratový typ se
nemění, takže projde. Do migrace dej `DO $$` blok, který ověří, že
`janprikopa+u01@gmail.com` je nově testovací a `janprikopa@gmail.com`
(bez značky) NENÍ.

**3) Ať `registrations_viselec` nekřičí donekonečna.**

I po opravě 1) a 2) zůstane pohled slepý k rozdílu mezi „účet smazán" a
„účet nevznikl" u budoucích případů. Přidej do té větve časové omezení:
zajímá nás registrace z posledních 7 dnů. Starší už není živý problém.

Aktuální definici pohledu si vytáhni přes `pg_get_viewdef`, ne ze staré
migrace, a měň VÝHRADNĚ větev `registrations_viselec` — zbytek musí zůstat
znak po znaku stejný. `CREATE OR REPLACE VIEW` shazuje `security_invoker`,
takže ho obnov explicitně (viz jak to řeší migrace 20260907110000).

### NEDĚLAT

- Nepřidávej cizí klíč na `registrations`. Registrace vzniká před účtem,
  klíč by rozbil legitimní stav.
- Neměň větev `registrace_selhava` (ta s `HAVING count(*) >= 2`) — hlídá
  něco jiného a funguje.
- Nemaž existující řádky z `registrations` v migraci. Po opravě 3) přestanou
  vadit samy a jsou to jediná stopa po tom, že ty registrace proběhly.
- Nespouštěj migraci. Píšeš jen soubory.
- Neměř produkci. Čísla výš jsou změřená.

---

## 9.1 — HOTOVO A NASAZENO (PR #162, c313555). NEŘEŠ ZNOVU.

Změřeno 7. 9. 2026 na deseti čerstvých registracích přes produkční
`POST /api/body-metrics` (stejná cesta jako formulář), profily se skutečným
rozptylem: obě pohlaví, věk 22–64, BMI 19,6–35,5, pět diet, tři prostředí.

### Co při tom vyšlo dobře - NESAHAT NA TO

    kalorie plánu vs. cíl        98,4-103,8 %  u všech deseti
    dietní soulad                0 porušení ze 175 jídel
    tréninky - počet a dny       sedí 10/10
    cviky se sériemi a ukázkou   170/170
    struktura                    7 dní, 4-6 jídel podle cíle

Plánovač trefuje KALORICKÝ cíl přesně a dietní bránu neobchází. Problém je
v tom, JAKÝ cíl dostane zadaný.

---

### A) TUK JE VŽDY 28 % ENERGIE, I U NÍZKOSACHARIDOVÉ DIETY

`lib/nutritionTargets.js`, `calculateNutritionTargets()`:

```
protein = váha × {2,0 nabírání | 1,8 redukce | 1,6 udržování}
fat     = calories × 0,28 / 9        <- konstanta, dieta se nečte
carbs   = zbytek energie
```

`diet_type` do výpočtu maker nevstupuje vůbec. Uživatel, který si zvolí
**nízkosacharidovou dietu, dostane cíl 239 g sacharidů**, tedy 51 % energie
ze sacharidů. To je proti smyslu té diety.

Naměřený dopad (účet u07, low_carb): plánovač cíl trefit nemůže, protože
z low_carb receptů 239 g sacharidů neposkládá. Výsledek za týden:

    sacharidy  -66 %      tuky  +81 %      bílkoviny  +55 %

**CO UDĚLAT:** makro rozpad musí znát `diet_type`. Pro `low_carb` nastav
podíl sacharidů na 20-25 % energie a zbytek po bílkovinách dej do tuku.
Ostatní diety (`vegetarian`, `gluten_free`, `lactose_free`) rozpad NEMĚNÍ -
nejsou to makro diety, jejich cíl je správný (viz bod B2 níž).

Konstantu 0,28 nenechávej zadrátovanou v těle funkce - pojmenuj podíly
na jednom místě jako tabulku `dieta -> {sacharidy, tuk}` s výchozí větví.

---

### B1) KALORICKÝ CÍL SE POČÍTÁ Z VÁHY, NE Z METABOLISMU

Tentýž soubor:

```
calories = váha × {28-300 redukce | 30 udržování | 32+200 nabírání}
           × koeficient_aktivity   (velmi 1,08 / středně 1,0 / jinak 0,95)
           + 100 při ≥5 trénincích
```

Výška, věk ani pohlaví do cíle NEVSTUPUJÍ. Vstupují jen do spodní hranice
(`minimalniKalorickyCil`, max z 1200 ♀ / 1500 ♂ a 0,8 × BMR).

Přitom `bmrMifflinStJeor()` je ve STEJNÉM souboru, je správně napsaná
(ověřeno testem `lib/__tests__/calorieFloor.test.mjs`) a používá se výhradně
na tu podlahu.

Důsledek - naměřeno na profilech z testu, aktivita „středně":

    profil                              cíl    TDEE   rozdíl
    muž 27 l., 190 cm, 72 kg, nabírání  2504   2755   -251   <- hubnul by
    žena 22 l., 158 cm, 50 kg, nabírání 1800   1886    -86   <- hubnula by
    žena 57 l., 160 cm, 79 kg, redukce  1912   2083   -171   <- skoro nic
    muž 27 l., 190 cm, 72 kg, redukce   1716   2755  -1039   <- moc agresivní

Vzorec z váhy dává u štíhlých vysokých lidí OPAK toho, co si zvolili, a
u zavalitých málo aktivních lidí příliš mírný deficit.

**CO UDĚLAT:** odvoď cíl z TDEE, ne z váhy.

```
BMR  = bmrMifflinStJeor({weightKg, heightCm, age, gender})   // už existuje
TDEE = BMR × koeficient_aktivity                             // už existuje
redukce      = TDEE × 0,80
udrzovani    = TDEE
nabirani     = TDEE × 1,10
```

Procenta drž jako pojmenované konstanty, ne magická čísla v podmínce.

TŘI VĚCI, KTERÉ MUSÍ ZŮSTAT:
1. **Spodní hranice `minimalniKalorickyCil()` platí dál** a aplikuje se AŽ
   NAKONEC, stejně jako dnes. Nesahej na ni.
2. **Uložený `calories_target` má dál přednost.** Větev, která přebírá už
   uloženou hodnotu (`!forceRecalculate && registrationCalories != null`),
   zůstává beze změny - jinak by se všem stávajícím lidem cíl skokem změnil.
   Nový vzorec se projeví jen u NOVÝCH registrací a při `forceRecalculate`.
3. **Bonus +100 za ≥5 tréninků a jeho podmínka `cilOdvozen`** zůstávají.
   Komentář u nich popisuje reálný incident ze 17.-18. 8., kdy se bonus
   sčítal třikrát. Nerozbij to.

BMR nejde spočítat bez výšky a věku - `bmrMifflinStJeor` v tom případě vrací
`null`. Když se to stane, spadni na dnešní vzorec z váhy a zaloguj to.
Nedohaduj výšku ani věk.

---

### B2) PLÁNOVAČ MÍJÍ MAKRA U OMEZENÝCH DIET - NEJDŘÍV MĚŘIT

U vegetariánů a bezlepkové diety je CÍL správný, ale plán ho nesplní:

    účet  dieta        bílkoviny  sacharidy  tuky
    u03   vegetarián      -15 %      +5 %    +16 %
    u10   vegetarián      -21 %      -9 %    +41 %
    u04   bez lepku       +14 %     -33 %    +55 %
    u05   bez laktózy      +8 %      -8 %    +11 %
    bez diety           +2 až +12 %  ±6 %   -9 až +12 %

Bez diety to sedí, s dietou se to rozjíždí a rozdíl pohltí tuk.

**NEOPRAVUJ TO TEĎ.** Je to buď málo receptů v katalogu pro danou dietu,
nebo váhy ve výběru - a z dat to dnes nejde rozlišit. Udělej jen měření:
do logu `[catalog-resolve] complete` (lib/recipesCatalog.js) přidej, o kolik
se výsledný den liší od cíle v každém ze tří maker, a kolik kandidátů bylo
k dispozici po dietním filtru. Čísla vyhodnotíme, pak se rozhodne.

---

### C) NEPLATNÝ VSTUP SE TIŠE PŘEPÍŠE NA VÝCHOZÍ

`POST /api/body-metrics` přijme neznámou hodnotu a mlčky dosadí výchozí:

    goal:     cokoli mimo výčet          -> 'udrzovani'
    activity: cokoli mimo výčet          -> koeficient 0,95
    workout_days: den mimo 0-6           -> zahodí se bez hlášky

Ověřeno: poslal jsem `goal='lose_weight'` a dostal plán na udržování;
poslal jsem neděli jako `7` (formulář ji posílá jako `0`) a systém den
zahodil a doplnil si místo něj pondělí.

Přes formulář se to stát nemůže - `src/components/registrace/volby.ts`
posílá správné hodnoty. Přes API ano, a tichá záměna je horší než chyba:
uživatel dostane plán na jiný cíl, než o jaký požádal, a nikde se to
nedozví.

**CO UDĚLAT:** `lib/validation/onboardingSchema.js` už seznam `GOALS` má.
Rozšiř validaci tak, aby neznámý `goal`, `activity` nebo den mimo rozsah
vrátily 400 s konkrétní hláškou, ne aby se tiše nahradily. Formuláře se to
nedotkne - ty posílají platné hodnoty.

---

### D) MODUL NÁVYKŮ SE NIKDY NEDOKONČÍ

Odpověď registrace (diagnostika v těle odpovědi):

    "required_modules":  ["nutrition", "training", "habits"]
    "completed_modules": ["nutrition", "training"]

Stejné u všech deseti registrací. Buď se `habits` nemá v `required_modules`
vůbec objevit, nebo se má dokončovat a nedokončuje se. Zjisti které a sjednoť
to - dnes to hlásí nedokončený stav u KAŽDÉ úspěšné registrace, takže se
podle toho nedá poznat skutečný problém.

---

### E) SMAZÁNÍ ÚČTU NESMAŽE PLÁNY - CHYBÍ CIZÍ KLÍČ

`ai_generated_plans.user_id` nemá cizí klíč na `auth.users`. Ověřeno:
po smazání 16 testovacích účtů zůstalo v tabulce **32 osiřelých plánů**
i s kalorickými cíli a údaji o těch lidech.

`profiles`, `ai_tasks`, `memberships` i `workouts` mají `ON DELETE CASCADE`
správně. `ai_generated_plans` na ten seznam nepatří omylem.

Není to jen nepořádek - je to GDPR problém. „Smažte můj účet" dnes nesmaže
plán, který o člověku ví váhu, cíl i jídelníček.

**CO UDĚLAT:** migrace, která osiřelé řádky nejdřív smaže a pak přidá
`FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`.
Zkontroluj přitom `api/delete-account.js` - jestli plány maže ručně, po
přidání klíče je ta část zbytečná a má zmizet, ať nezůstanou dvě pravdy.

Projdi i ostatní tabulky s `user_id` ze seznamu v `information_schema` a
ověř, že žádná další cizí klíč nepostrádá. Co najdeš, zapiš do shrnutí -
neopravuj to bez odsouhlasení, ať migrace nebobtná.

---

### POŘADÍ A ROZSAH

Tři samostatné commity, ne jeden:

    1. A + B1     lib/nutritionTargets.js + testy      (jeden soubor, jedno téma)
    2. C + D      validace vstupu a modul návyků
    3. E          migrace s cizím klíčem

### NEDĚLAT

- Neměň `minimalniKalorickyCil()`, `bmrMifflinStJeor()` ani konstanty
  `MIN_KCAL_ZENA` / `MIN_KCAL_MUZ` / `MIN_PODIL_BMR`.
- Neměň větev, která přebírá uložený `calories_target`.
- Neopravuj B2 - jen měř.
- Nesahej na dietní bránu ani na aktivační bránu receptů. Fungují.
- Nespouštěj migraci. Píšeš jen soubor.
- Neměř produkci. Všechna čísla výš jsou změřená, ber je jako zadání.

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

### 9.4 - osa grafu zdravi ukazovala americke datum

Osa X u HRV / klidoveho tepu / kroku / energie v profilu psala
`09.01 … 09.07`. Zdroj: `src/data/adapteryZdravi.ts`, funkce `trend()`:

```js
day: (r.local_date || '').slice(5).replace('-', '.'),
```

Z `2026-09-01` vypadlo `09.01`, tedy **mesic-den**. Uzivatel to cetl jako
9. ledna. O par centimetru vedle pritom graf vahy (`WeightChart.tsx`,
`kratkeDatum()`) psal spravne `1. 9.` - dve funkce, dva formaty.

**Provereno cele UI, ne jen tenhle graf.** Prohledany `src/`, `lib/`, `api/`
na `toLocale*String`, `Intl.DateTimeFormat` a rucni skladani datumu:

- Jediny americky tvar v zivem kodu byl ten jeden radek. `slice(5)` se
  nikde jinde nevyskytuje.
- Vsechny ostatni viditelne datumy uz cs-CZ maji spravne poradi:
  `ProfileSection.tsx` (`7. 9. 2026`), `TrialPaywallCard.tsx` (`7. zari`),
  `adapteryZdravi.ts` radek „Aktualizovano" (`7. 9. 18:23`),
  `lib/plan/structuredWeekSource.js`, `lib/planPdf.js`,
  `WeightChart.kratkeDatum`.
- `en-CA` / `sv-SE` / `en-US` v `lib/czechCalendar.js`, `lib/health/guards.ts`,
  `lib/coachChatKontext.js`, `api/habits.js`, `api/coach-chat.js`
  **NEJSOU chyba a nesahat na ne** - vyrabi strojove `YYYY-MM-DD` a nazvy
  dnu pro vnitrni mapovani, nic z toho uzivatel nevidi.
- `lib/profileDates.js` a `lib/profile/telesneMetriky.js` importuje uz jen
  `_legacy-next/` - mrtvy kod, neresi se.

Oprava: novy `src/lib/datum.ts` s `kratkeDatumCS()` (den prvni, retezec se
jen deli, **neparsuje se pres `new Date()`** - hole `YYYY-MM-DD` je pulnoc
UTC a v zapadni zone by popisek spadl o den zpatky). Pouzivaji ho oba grafy.

Rok se do osy nedava zamerne: 7 popisku na sirku tydne uz ted sotva prolezou
a rok je v hlavicce filtru. Plne `DD. MM. YYYY` je vsude, kde datum stoji
samo (profil, PDF, platnost planu).

Pozor pri dalsi praci s `WeightChart`: filtr **1R** si po synchronizaci
prepisuje `record.date` na `09.2026` (`syncEngine.applyWeightRecord`). To
neni ISO a `kratkeDatumCS` na nej vraci prazdno - proto ma `kratkeDatum()`
ve `WeightChart.tsx` fallback na puvodni retezec. Bez nej by se osa 1R
vyprazdnila.

Testy: `src/lib/datum.test.ts` (zaregistrovan v `test:src`, hlida i to, ze
vysledek **nikdy** nezacina nulou-mesicem) + assert na `t.day`
v `src/data/adapteryZdravi.test.ts`.

### 8.18 - registr cviku prestal lhat o naradi (PR #156, 63bd520)

Změřeno v produkci 6. 9. 2026 nad `exercise_asset_registry`: 225 řádků,
209 s `usable_in_plan = true`.

### Proč to není kosmetika

`lib/exerciseCatalogPool.js` má v hlavičce vlastní varování:

> VYBAVENÍ SI HLÍDÁME SAMI. Nabídku nelze jen rozšířit a spolehnout se, že ji
> `adaptExerciseForTrainingEnvironment()` dorovná - ta funkce pracuje s natvrdo
> vypsanými seznamy kanonických klíčů a NEZNÁMÝ KLÍČ PROPUSTÍ BEZE ZMĚNY.

Filtr `.in('equipment_class', tridy)` v `nactiKatalogovouZasobu()` je tedy
**jediná pojistka**. Když je `equipment_class` v registru špatně, cvik projde
až do tréninku uživatele. Zároveň `equipment_class` řídí štítek „Nářadí"
v profilu (`lib/profile/treninkPopis.js`) a `primary_muscle` popis
procvičených svalů (`lib/profile/svalyDoPlanu.js`).

### A) Osm cviků potřebuje hrazdu nebo lavici, ale jsou v třídě `body_weight`

Uživatel s prostředím `home_bodyweight` je může dostat do plánu:

    pull_up                        Shyby / Přítahy              hrazda
    chin_up                        Shyby podhmatem              hrazda
    bench_dips                     Tricepsové kliky na bradlech lavice
    bench_jump                     Výskoky na lavici            lavice
    incline_push_up                Kliky na šikmé lavici        lavice
    incline_push_up_medium         Kliky na šikmé lavici        lavice
    incline_push_up_close_grip     Kliky na šikmé lavici úzkým  lavice
    incline_push_up_reverse_grip   Kliky na šikmé lavici podhm. lavice

### B) `plank` je označené jako činkový cvik

    canonical_key   equipment   equipment_class   správně
    plank           weighted    dumbbell          body_weight

Registr se trefil do „weighted plank". Důsledky jsou dva a oba jsou vidět:
prkno je v šablonách `HOME_BW_A` i `HOME_BW_C`, takže uživateli bez vybavení
svítí v profilu u prkna „Nářadí: jednoručky"; a do náhrad se prkno nabízí jen
lidem s činkami.

### C) Tři řádky nejsou cviky, ale jsou v zásobě

    warmup     Rozcvička              primary_muscle full_body
    rest       Odpočinek / Procházka  primary_muscle glutes
    cooldown   Závěr / Strečink       primary_muscle triceps

Všechny tři mají `usable_in_plan = true`, takže je `nactiKatalogovouZasobu()`
načte jako plnohodnotné cviky. `rest` navíc tvrdí, že procvičuje hýždě, a
`cooldown` tricepsy - to jde rovnou do popisu tréninku v profilu.

### D) `superman` má špatný sval

    canonical_key   primary_muscle   target       body_part   správně
    superman        chest            pectorals    chest       lower_back

Superman je zádový cvik. Je v `HOME_BW_A` i `HOME_BW_B`, takže profil hlásí
špatně procvičený sval u dvou ze čtyř domácích variant.

### CO UDĚLAT

Napiš JEDNU migraci, která opraví data v `exercise_asset_registry`:

1. Osmi klíčům z bodu A) nastav `equipment_class`:
   - `pull_up`, `chin_up` -> nová hodnota pro hrazdu
   - `bench_dips`, `bench_jump`, `incline_push_up*` (čtyři klíče) -> hodnota
     pro lavici

   POZOR: `equipment_class` má povolené hodnoty. Podívej se do
   `TRIDY_VYBAVENI` v `lib/exerciseImportQueue.js` a do `NACINI_NA_TRIDU`
   a `TRIDY_V_POSILOVNE` v `lib/exerciseCatalogPool.js`, co je dnes dovolené.
   Jestli tam pro hrazdu ani lavici třída NENÍ, nevymýšlej novou hodnotu na
   vlastní pěst - navrhni mi v shrnutí dvě varianty (přidat třídy vs. dát
   těmhle osmi `usable_in_plan = false`) a čekej. Nová třída znamená doplnit
   ji i do těch tří seznamů v JS, jinak by cviky zmizely i z posilovny.

2. `plank`: `equipment_class = 'body_weight'`, `equipment = 'body weight'`.

3. `warmup`, `rest`, `cooldown`: `usable_in_plan = false`. Zůstávají v tabulce
   kvůli médiím a popiskům, jen se přestanou nabízet jako cviky.

4. `superman`: `primary_muscle`, `target` a `body_part` na zádové hodnoty.
   Použij takové řetězce, jaké registr používá u jiných zádových cviků -
   nevymýšlej vlastní. Zjisti si je z existujících řádků v migracích.

5. Do migrace přidej `DO $$` blok, který po opravě ověří, že:
   - žádný řádek s `usable_in_plan = true` a `equipment_class = 'body_weight'`
     nemá v `canonical_key` ani `display_name_cs` slovo naznačující hrazdu
     nebo lavici,
   - `plank` má `body_weight`,
   - `warmup`, `rest`, `cooldown` mají `usable_in_plan = false`.

### NEDĚLAT

- Neměň `lib/workoutStartProgram.js`. Šablony jsou po 8.16 v pořádku, tohle je
  chyba dat v registru.
- Nepřidávej novou hodnotu `equipment_class` bez odsouhlasení (viz bod 1).
- Nespouštěj migraci. Píšeš jen soubor.
- Neměř produkci. Čísla výš jsou změřená, ber je jako zadání.

### 8.19 - hlidka prestala kricet critical (PR #157, a60535b)

Změřeno v produkci 6. 9. 2026.

### A) `generator_nedodava` je falešný poplach

Pohled `system_health_alerts` hlásí **critical**: „Generator nevyrobil zadny
recept 20 h, posledni: 2026-09-06 03:18".

Skutečnost z `ai_runs` (`purpose = 'recipe_generator_beh'`):

    6. 9. 03:18   zapsano 12, zahozeno 93   (bezel)
    6. 9. 11:15   reason: denni_strop_vycerpan, skipped: true
    6. 9. 19:15   reason: denni_strop_vycerpan, skipped: true

Generátor tedy **nespadl** - narazil na denní strop, který je v produkci
nastavený přes `RECIPE_GEN_MAX_PER_DAY` (podle chování na 20; hodnota je
ve Vercelu zašifrovaná). `vyrobenoZa24h()` v `lib/recipeGenerator.js`
počítá `recipes_catalog` se `source = 'llm_generated'` za 24 h - naměřeno
20 v okně, takže `zbyvaDnes = 0` a běh se korektně přeskočí.

To je navržené chování, ne porucha. Ale hlídka ho hlásí jako `critical`,
takže:

- `critical` v tomhle systému přestává něco znamenat - je tam pořád,
- až generátor opravdu spadne, nikdo si toho nevšimne.

Falešný poplach na kritické úrovni je horší než žádný poplach.

**CO UDĚLAT:** větev `generator_nedodava` v pohledu `system_health_alerts`
nesmí hlásit nic, když poslední záznam `recipe_generator_beh` v `ai_runs`
má `result->>'reason' = 'denni_strop_vycerpan'` nebo
`result->>'skipped' = 'true'`. Tehdy je stav normální.

`critical` ať zůstane jen pro skutečný výpadek - tzn. žádný běh vůbec
(ani přeskočený), nebo běh s `error`. Když chceš stav „strop vyčerpán"
zviditelnit, dej ho jako `info`, ne jako `warning` ani `critical`.

Napiš to jako migraci, která pohled přepíše. Zbytek větví pohledu nech
znak po znaku stejný - vytáhni si aktuální definici přes
`pg_get_viewdef`, ne ze staré migrace.

### B) Nevíme, proč padá 90 % dávky

    beh            zapsano   zahozeno   vyteznost
    6. 9. 03:18       12        93        11 %
    5. 9. 19:19        8        98         8 %
    4. 9. 22:09       12        56        18 %

Na osm až devět zahozených kandidátů připadá jeden zapsaný recept. To je
osminásobek nákladů na model, než by muselo být.

**Podezření je, že to NENÍ tuk.** Jednotlivá volání (`purpose =
'recipe_generation'`) hlásí `zahozeno_nad_stropem_tuku` jen 0-2 na volání,
a `validacniStropTuku()` stejně zvedá strop na 0,45, i když objednávka
říká 0,30. Hlavní důvod bude jinde - dedup, kalorické pásmo, bílkoviny
nebo nedohledané suroviny - ale z dat to dnes NEJDE poznat, protože
`zahozeno` na úrovni běhu je jedno slepené číslo.

**CO UDĚLAT:** rozpad, ne oprava. V `provedBeh()` v
`lib/recipeGeneratorRun.js` už existují dílčí počítadla
(`nadStropemTuku`, `podCilemBilkovin`, `mimoBilkovinu`, `nedohledane`).
Doplň k nim zbylé důvody zahození tak, aby jejich součet dal `zahozeno`,
a všechna je zapiš do `ai_runs.result` u `recipe_generator_beh` - stejně,
jako tam 8.13 přidala `zahozeno_nad_stropem_tuku`.

Ať z jednoho běhu jde přečíst věta „z 93 zahozených bylo X duplicit,
Y mimo kalorické pásmo, Z pod bílkovinami, W nedohledaná surovina".

NEOPRAVUJ zatím žádný z těch důvodů a neměň žádnou validaci ani prompt.
Nejdřív chci vidět čísla, pak se rozhodne, co se povolí.

### NEDĚLAT

- Neměň `validacniStropTuku()`, `receptNepresahujeStropTuku()` ani
  `MIN_TVRDY_STROP_TUKU`. Strop tuku z 8.13 zůstává.
- Neměň prompt generátoru ani jeho JSON schéma.
- Nesahej na `RECIPE_GEN_MAX_PER_DAY` ani jinou konfiguraci prostředí.
- Nespouštěj migraci. Píšeš jen soubor.
- Neměř produkci. Čísla výš jsou změřená.


### 8.17 - vlakninu pocita trigger (PR #150 + #151, e9346b8)

Stav k 6. 9. 2026: `recipes_catalog.fiber_g` je null u **488 z 875** aktivních
receptů a u **463 z 513** `llm_generated`. Appka i týdenní e-mail vlákninu
zobrazují (`lib/mealDisplayModel.js`, `src/data/adaptery.ts`), takže uživatel
u devíti z deseti jídel vidí "Vláknina —".

### Kde je příčina

Není v generátoru promptu. Makra nepočítá LLM - `lib/recipeGeneratorRun.js:428`
volá RPC `compute_nutrition_for_ingredients(p_ingredients)` a bere z něj
`kcal`, `protein_g`, `carbs_g`, `fat_g`. Ta funkce vlákninu nesčítá, i když
`ingredients_nutrition.fiber_g_per_100g` existuje.

### Data jsou doplněná, dělat je nemusíš

Migrace `20260906180000_vlaknina_surovin.sql` je **už aplikovaná v produkci
a orazítkovaná**. Doplnila `fiber_g_per_100g` u 112 surovin:

| | před | po |
|---|---|---|
| surovin s vlákninou ve slovníku | 34 | 146 |
| pokrytí použití v katalogu | 32 % | **94,8 %** |

Nesahej na tu migraci a nepiš k ní žádnou další.

### CO UDĚLAT

**1) Nová SQL funkce - jako samostatný soubor migrace, NEAPLIKUJ ji.**

`compute_nutrition_for_ingredients` má osmisloupcový `RETURNS TABLE`.
`CREATE OR REPLACE FUNCTION` návratový typ změnit NEUMÍ (chyba 42P13) a
`DROP` neprojde, protože na `compute_recipe_nutrition` visí view
`system_health_alerts_zaklad`. Tohle je přesně past, na kterou najel bod 8.9.

Proto přidej **novou samostatnou** funkci, stávající nech být:

```
public.compute_fiber_for_ingredients(p_ingredients jsonb) returns numeric
```

Matchování surovin i převod jednotek zkopíruj 1:1 z
`compute_nutrition_for_ingredients` (`pg_get_functiondef` ti dá zdroj) -
tedy `lower(extensions.unaccent(...))`, `ingredient_aliases`,
`unit_conversions` se čtyřmi fallbacky, `search_path` na prázdno, `stable`.
Liší se jen tím, co sčítá.

Návratová hodnota:
- součet `fiber_g_per_100g * gramů / 100`, zaokrouhlený na 1 desetinné místo,
  přes suroviny, kde je surovina i gramáž známá **a `fiber_g_per_100g` není null**
- `null`, když ani jedna surovina receptu nemá data o vláknině - tzn.
  nerozlišitelné od "nespočítáno". Nula smí vyjít jen tehdy, když data
  opravdu jsou a součet je nula (olej + sůl + kuřecí prsa).

**2) Generátor ať výsledek zapisuje.**

V `lib/recipeGeneratorRun.js` přidej druhé RPC volání hned za to stávající a
`fiber_g` doplň do objektu, který se zapisuje do `recipes_catalog` (kolem
řádku 532, vedle `kcal`, `protein_g`, `carbs_g`, `fat_g`).

Když druhé RPC selže, recept se **musí uložit dál** - jen bez vlákniny.
Vláknina není důvod zahodit jinak platný recept. Chybu zaloguj do
`ai_runs.result` jako počítadlo `vlaknina_nespoctena`, stejným způsobem, jakým
tam 8.13 přidala `zahozeno_nad_stropem_tuku`.

**3) Testy.**

Unit test na to, že se `fiber_g` propíše do zapisovaného objektu a že selhání
druhého RPC recept nezahodí. Neposílej dotazy do produkce.

### NEDĚLAT

- Neměň `compute_nutrition_for_ingredients` ani `compute_recipe_nutrition`.
  Ani signaturu, ani tělo.
- Nepřidávej `fiber_g` do JSON schématu, které dostává LLM. Vlákninu si model
  vymýšlí, u makra proto celý systém stojí na výpočtu ze surovin - a to je
  správně.
- Nedělej dávkový přepočet existujících 488 receptů. To spustím já zvlášť, až
  bude funkce nasazená.
- Nespouštěj migraci. Píšeš jen soubor.


### 8.16 - doma bez vybaveni rotuje 15 cviku misto 9 (PR #149, 4c11c26)

**8.15 rozšířila rotaci na všechny čtyři varianty. U dvou prostředí to
zabralo, u třetího ne:**

```
za 4 týdny, různých cviků      před 8.15    po 8.15
  gym                              9          14
  home_equipment                   9          13
  home_bodyweight                  9           9    ← beze změny
```

### Proč

Varianty A–D pro `home_bodyweight` sdílejí skoro všechno:

```
A: squat, pushup, superman, glute_bridge, plank
B: lunges, pushup, superman, russian_twist, plank_side
C: squat, lunges, glute_bridge, dead_bug, plank
D: pushup, squat, superman, dead_bug, plank_side
```

Dvacet pozic, devět unikátních cviků. `pushup`, `squat` a `superman`
každý 3×. Rotace nemá co rotovat.

### Zásoba je k dispozici

`exercise_asset_registry` má **29 cviků s `equipment_class = 'body_weight'`,
všechny s vizuálem**. Šest z nich jde doma bez jakéhokoli vybavení a
v šablonách nejsou:

```
bent_knee_hip_raise    Zvedání pánve s pokrčenými koleny   abs
crunch_hands_overhead  Zkracovačky nad hlavou              abs
mountain_climber       Mountain climber                    core/cardio
glute_kickback         Zapažování                          glutes
calf_raise             Zvedání na špičky                   calves
single_leg_butt_kick   Kopy jednonož                       quads
```

### Co udělat

Rozšířit varianty C a D pro `home_bodyweight` tak, aby se překryv s A/B
zmenšil — cíl je **aspoň 13 unikátních cviků za čtyři týdny**, tedy na
úrovni ostatních dvou prostředí.

Drž se pravidel, která ty šablony už mají:
- pět cviků na jednotku, ne šest
- každá jednotka pokrývá vzory (tlak, tah, nohy, core), ne partie
- progrese: každý cvik musí mít pravidlo (`upravProCil`, `sets`,
  `reps_min/max` nebo `duration_sec`) — existující test
  „všechny cviky mají pravidlo progrese" to hlídá

### Co v tomhle bodě NEDĚLAT

- **Nesahej na `gym` ani `home_equipment`.** Tam 8.15 zabrala.
- **Nepřidávej cviky, které potřebují vybavení.** `pull_up`, `chin_up`,
  `bench_dips`, `incline_push_up*` a `bench_jump` mají v registru
  `body_weight`, ale potřebují hrazdu nebo lavici — doma bez vybavení
  nejdou. Ověř `equipment_class` i to, co cvik reálně potřebuje.
- **`warmup`, `rest` a `cooldown` nejsou cviky**, i když jsou v registru.
- **Neměň A a B.** Ty jsou odladěné a lidé na nich mají progresi.

### Vedlejší nález — neopravovat tady, jen zapsat

`exercise_asset_registry.primary_muscle` je u některých řádků nesmysl:
`rest` má `glutes`, `cooldown` má `triceps`. Nikde to nic neláme
(ty klíče se do plánu nedostanou), ale kdyby se někdy `primary_muscle`
použil k výběru cviků, bude to zdroj chyb.

- **8.15** rotace přes všechny čtyři varianty i při 3 trénincích týdně
  (`PRAH_ROZSIRENE_ROTACE` zrušen). Za 4 týdny: gym 14 různých cviků,
  home_equipment 13, home_bodyweight 9. Progrese pokračuje podle
  `canonical_key`, ne podle varianty. Nasazeno 5. 9., `2da9748` (#148).
- **8.14** profil ukazuje celý týden: rozpis tréninků má všech sedm dnů
  (volno neklikací), nákupní seznam je sbalený, „Celý týdenní jídelníček"
  zobrazuje sedm sbalených dnů místo jednoho. `treninkoveDny()` je jediné
  místo, které odlišuje trénink od volna. Nasazeno 5. 9., `9974d01` (#147).
- **8.13** tvrdá validace tuku ve výrobě (`nad_stropem_tuku`, strop
  `max(fat_hint, 0,45)`). Nasazeno 5. 9., `31a641e` (#146). Účinek se měří
  po prvním běhu generátoru.
- **8.12** úklid fronty: CHECK na `protein_hint` zpřísněn na 0,25, stav
  `nadbytecna` pro duplicity (56 řádků), „černý pepř" do spíže. Migrace
  `20260904150000` aplikovaná a orazítkovaná.
- **8.11** makra ve výběru: `STROP_TUKU_VYBERU` 0,35, přednostní pool,
  nouzová větev konečně zná makra. Změřeno: tuk v týdenním plánu 43 % → 22 %
  (cíl 28 %), bílkoviny 31 % proti cíli 32 %.
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

**`equipment_class` nemá hodnotu pro hrazdu ani lavici** — 8.18 (6.–7. 9.
2026). Osm cviků v `exercise_asset_registry` (`pull_up`, `chin_up`,
`bench_dips`, `bench_jump`, `incline_push_up` + tři varianty) skutečně
potřebuje hrazdu nebo lavici, ale `equipment_class` dnes zná jen sedm
hodnot (`body_weight, dumbbell, barbell, cable, machine, kettlebell, band`
— `TRIDY_VYBAVENI` v `lib/exerciseImportQueue.js`, `TRIDY_V_POSILOVNE`
v `lib/exerciseCatalogPool.js`) a žádná neznamená ani jedno. 8.18 to řešila
tak, že těmhle osmi nastavila `usable_in_plan = false` (přes
`equipment_class = NULL`, migrace `20260907100000`) — bezpečnější než cvik
nabízet s lživým „vlastní váha".

Návrh na později, kdyby se hrazda/lavice měly nabízet doma jako skutečné
vybavení (dnes `pullup_bar` a `bench` v `EQUIPMENT_LABELS`,
`lib/trainingEnvironment.js`, existují jako volby vybavení, ale na žádnou
třídu cviků se nenapojují):

- přidat `equipment_class` hodnoty `pullup_bar` a `bench`,
- rozšířit `TRIDY_VYBAVENI` (`lib/exerciseImportQueue.js`) a
  `TRIDY_V_POSILOVNE` (`lib/exerciseCatalogPool.js`) o obě,
- doplnit `NACINI_NA_TRIDU` (`lib/exerciseCatalogPool.js`) o
  `pullup_bar: 'pullup_bar', bench: 'bench'` — dnes mapuje jen
  `dumbbells`/`kettlebell`/`bands`, takže i uživatel, který hrazdu nebo
  lavici doma skutečně má, by bez týhle úpravy cviky nedostal,
- **a hlavně** rozšířit hardcoded seznam sedmi hodnot přímo v SQL triggeru
  `enforce_exercise_registry_rules()` (samostatná migrace) — `equipment_class`
  nemá na úrovni tabulky CHECK constraint, těch sedm hodnot vynucuje jen
  tenhle trigger, a bez jeho úpravy by nová třída dostala `usable_in_plan
  = false` úplně všude, včetně posilovny.
