# Etapa 4 — co klientovi v aplikaci chybí

Pořadí práce: **4.0, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, pak 4.1–4.3.**
Zbytek (4.4–4.6) až po schválení.
Postupuj po jednom bodu, po každém ukaž diff a počkej na „schvaluji".

U bodů 4.9–4.12 platí navíc: **nejdřív nález a návrh s čísly, teprve po
schválení implementace.** Nezačínej kódovat proti nezměřenému odhadu.

Platí pravidla z `claude/BMON_PROMPT_KOMPLETACE_2026-08-23.md`:
bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná mock data, žádný Next.js,
jeden zdroj pravdy, `lib/` je čisté JS s explicitními `.js` importy.

---

## PRAVIDLO RECEPTŮ (Honza, 25. 8. 2026)

Plné znění je v projektu jako `claude/BMON_PRAVIDLA_RECEPTU.md`. Tady je proto,
že **mění brány katalogu** — kdo sahá na `enforce_recipe_catalog_rules` nebo na
import, musí ho znát.

**PRIORITA: hodně jídel, jednoduchých, rychlých. V tomhle pořadí.**

- **Počet surovin NENÍ omezení.** Honza výslovně: „je mi jedno, z kolika se to
  skládá surovin." Recept o deseti surovinách hotový za deset minut je lepší
  než recept o pěti, co se dělá hodinu.
- **Čas JE omezení.** „Nic extra složitého, na co zabere hodně času."
- **Složitost postupu JE omezení** — počet úkonů a nádobí, ne délka seznamu
  surovin.

Co se tím NEUVOLŇUJE: dietní brána, alergeny, lepek, kalorické pásmo a trefa
do maker zůstávají beze změny. Uvolnění se týká jen pohodlí vaření.

---

## 4.0 Watchdog `nenormalizovana_surovina` hlásí falešné poplachy — HOTOVO

Změřeno v produkci 25. 8. 2026: hlásil 13 surovin (agáve, bazalka, granola,
ricotta, tymián, edamame, ostružiny, červená řepa, hroznové víno, chilli
vločky, sezamová semínka, sójové maso, balsamico ocet) a všech 13 mělo
kanonický název přímo v `ingredients_nutrition`.

Dvě příčiny, obě opravené:

1. **Větev se ptala jen na `ingredient_aliases`.** Název, který JE kanonický,
   alias nepotřebuje — je normalizovaný z definice. Self-aliasů chybí 271
   z 308, takže hlídka by křičela u každé další suroviny.
2. **Log plnil cron podle špatného slovníku.** `resolveCanonicalName().matched`
   se databáze neptá vůbec — porovnává proti konstantě v
   `lib/ingredientAliasSeed.js` (74 klíčů), zatímco v DB je 376 surovin
   a 503 aliasů. Kdyby se opravila jen větev, log by se plnil dál.

Otázku „zná slovník tuhle surovinu?" teď zodpovídá jedno místo:
`public.je_ve_slovniku()` (migrace `20260825090000`). Watchdog ji volá přímo,
cron přes `suroviny_mimo_slovnik()`.

Po opravě hlásí watchdog **0**. `resolveCanonicalName` zůstává beze změny —
odpovídá na jinou otázku (klíč pro slučování položek nákupního seznamu).

## 4.7 Profilová fotka se nenačte

Změřeno v produkci 24. 8. 2026 00:35 na `app.bodyandmindon.cz`: v hlavičce
profilu se vykresluje alt text „Jan Přikopa" místo obrázku.

Zjisti, odkud se avatar bere a proč request selže. Když zdroj chybí nebo se
nenačte, vykresli **iniciály**, ne rozbitý obrázek. Rozbitý `<img>` je horší
než žádný — vypadá jako chyba aplikace.

## 4.8 Karta Apple Health tvrdí něco, co není změřené

Karta píše „Odesílá tvůj iPhone každou hodinu" a stav **„Aktuální"** u
synchronizace staré hodinu a půl. To je konfigurovaný záměr, ne naměřený fakt,
a porušuje to pravidlo „bez dat žádný závěr".

Změř skutečný odstup od poslední dávky a napiš ho: „Poslední odeslání před
1 h 26 min". Stav odvoď z toho odstupu, ne z nastavení.

Data k ověření (24. 8. 08:20): 45 payloadů, posledních 8 přišlo mezi 23:07:00
a 23:08:08 — tedy jedna dávka za 68 sekund, ne hodinová úloha. Od 23:08 do
08:20 nepřišlo nic, propadlo devět hodinových slotů. Spojení je `active`,
`last_sync_error` `null`, všech 45 zpracovaných bez chyby.

Totéž zkontroluj u karty Withings — jestli i ona tvrdí interval místo měření.

## 4.9 Průtok generátoru

Fronta si říká o 2 079 kusů, generátor dělá 20 denně — 104 dní, a fronta roste
při každém generování plánu. Nikdy se nevyprázdní. Nic to nezastaví, jen se
plán opakuje a hůř trefuje makra.

Zjistit a napsat **čísly**: kolik receptů vyrobí jeden běh, co ten strop určuje
(limit v kódu? `maxDuration`? cena?), a kolik stojí jeden recept v OpenAI
kreditech. Bez ceny za kus se o zrychlení nedá rozhodnout.

Zvlášť prověřit 14 položek ve stavu `failed` (bylo 9). Co je shodilo.

### Rozhodnuto 25. 8. 2026, pořadí prací

**1. Zastropovat frontu.** Schváleno v obou částech:
   - **1a** `pozadovano` na položku zastropovat,
   - **1b** slučovat duplicitní poptávku na **(slot, dieta)** s kanonickým
     pásmem slotu z `ROZSAHY_CHODU`. Uživatelské pásmo z objednávky mizí —
     katalog je sdílený a pásmo si vybírá plánovač při skládání.
     Naměřeno: 2 042 kusů ve 100 položkách → **112 v 16 položkách**.
   - **1c** **Uvolnit strop na počet surovin.** `countMainIngredients` dnes
     tvrdě odmítá 11+ hlavních surovin, což podle pravidla recepty výš
     neodpovídá zadání a zahazuje jídla, za která jsme zaplatili. Změřeno:
     v katalogu je 174 aktivních receptů s 8+ surovinami a čas je přesto
     v pořádku (max 30 min) — korelace „hodně surovin = dlouhé vaření"
     neplatí. Nejdřív zjistit, **kolik receptů ten strop za poslední měsíc
     odmítl**; když málo, neřešit a říct to. Když hodně, strop zvednout nebo
     zrušit a nahradit limitem na **čas** a **počet kroků postupu**,
     navrženým z naměřených dat.

**2. Zjistit, proč model vrací míň, než se žádá.** Strop `RECIPE_GEN_MAX_OUTPUT_TOKENS`
   to NENÍ — naměřeno 25. 8.: nejdelší odpověď za celou historii měla 1 518
   tokenů ze 4 000, u stropu neskončilo ani jedno z 329 volání. Navíc se
   o pět často vůbec nežádá (`Math.min(pozadovano - vyrobeno, 5, zbyva)`)
   a `ai_runs` nelogují, kolik se žádalo. **Nejdřív dologovat `zadano`,
   změřit skutečný poměr, teprve pak sahat na prompt.**

**3. Zmenšit prompt.** Do každého volání jde seznam všech názvů slotu —
   5,2 k tokenů při 600 receptech, 6,8 k při 930, roste lineárně s katalogem.
   Schváleno předem: **A** vzorek ~80 názvů místo úplného seznamu + **C**
   opřít dedup o `DEDUP_JACCARD_THRESHOLD` proti DB místo prosby v promptu.
   Ukázat naměřenou úsporu.

**Strop 50/den se nezvedá**, dokud není hotový bod 2.

## 4.10 Spoonacular je vyschlý — UZAVŘENO: KONEC ZDROJE

**Rozhodnuto 25. 8. 2026: Spoonacular je dojetý. Růst katalogu visí na
generátoru. Novou dávku dotazů nezkoušet.**

Naměřeno 25. 8. 2026:

```
66 dotazů, 66 vyčerpaných, 63 vyřazených, 0 použitelných
API status 200, kvóta zbývá 20–28  →  nejde o limit ani o klíč
poslední běh 20. 8.
```

Výnos posledních dnů:

| den | kandidátů | vloženo | duplicit |
|---|---|---|---|
| 17. 8. | 103 | 31 | 72 |
| 18. 8. | 87 | **0** | 87 |
| 19. 8. | 81 | 3 | 78 |
| 20. 8. | 72 | **0** | 72 |

API odpovídá a kvóta je — jen všechno, co těch 66 dotazů vrátí, už v katalogu
máme. Tři vložené recepty za tři dny nestojí za údržbu rotace.

Důsledek pro plánování: **jediný zdroj růstu je generátor**, takže na 4.9
závisí celý katalog. `import-spoonacular` zatím běží dál a nic nekazí (jen
vyhodnocuje duplicity), vypnutí crona je samostatné rozhodnutí.

## 4.11 Slovník surovin

44 receptů přišlo o `gluten_free` kvůli surovině mimo slovník. Watchdog
`surovina_blokuje_dietni_tag` (migrace `20260825...`, viz 4.0 a Etapa 3) je
vypisuje. Doplnit je — většina jsou triviální aliasy na věci, které ve slovníku
už jsou (mleté hovězí, fettuccine, kukuřičné tortilly, listová kapusta…).

U každé doplněné suroviny musí být jasné, **jestli obsahuje lepek**. Když si
nejsi jistý, veď ji jako lepkovou a nahlas ji zvlášť — u celiaka je zbytečná
přísnost levnější než omyl.

Po doplnění ukázat, kolik receptů tag získalo zpátky.

## 4.12 Cviky bez vizuálu

14 cviků nemá GIF ani obrázek. Dnes žádný z nich není v aktivním plánu, takže
to nikdo nevidí — ale až na ně generátor tréninku sáhne, tlačítko „Jak na to"
bude prázdné.

Zjistit, odkud se vizuály berou (`exercise_asset_registry`, cron
`/api/cron/import-exercises`) a proč těmhle čtrnácti chybí. Doplnit je, nebo —
když zdroj nemá — zajistit, že se u nich tlačítko nezobrazí a generátor je
nepreferuje.

## 4.1 Náhrada jídla

`lib/planMealReplace.js` existuje, UI komponenta ne. Když klientovi jídlo
nesedí, nemá co dělat.

Přidej do `NutritionSection` u každého jídla akci „Vyměnit": náhrada ze
stejného slotu, stejné kalorické pásmo, **stejný nebo lepší podíl bílkovin**,
dietní brána platí. Náhrada se ukládá do plánu, ne do lokálního state.

## 4.2 Výběr dne v jídelníčku

Dnes je vidět jen dnešek plus modal s celým týdnem. Přidej přepínač dne
stejného tvaru, jaký už má tréninkový plán — **jedna komponenta, ne dvě
implementace**.

## 4.3 Trefa do maker v UI

`_diag.protein_trefa` se počítá a klient ho nevidí. Ukaž u denního souhrnu,
kolik bílkovin plán dnes dává proti cíli. Pod 85 % to řekni rovnou a nabídni
výměnu jídla (4.1).

Stav 23. 8.: trefa 89 %, cíl 185 g, plán dává 166 g, kalorie 99 %.

Tohle je ta věc, kterou konkurence nemá — plán, který přizná, že netrefil.

---

## 4.4 Progrese tréninku (až po schválení)

Zápis tréninku funguje (`WorkoutLoggerModal`, `POST /api/workouts`), ale nikde
se nezobrazuje vývoj. Doplň u cviku poslední zapsané váhy a opakování. Bez dat
nevykresluj nic.

## 4.5 Cviky bez vizuálu (až po schválení)

Tlačítko „Jak na to" je nasazené, ale 14 cviků v registru nemá `gif_url` ani
`image_url`: `box_jump`, `bulgarian_squat`, `chest_fly`, `crunch`, `dips`,
`dumbbell_press`, `dumbbell_row`, `face_pull`, `hip_thrust`,
`incline_bench_press`, `jumping_jack`, `leg_raise`, `step_up`, `tricep_dip`.

Žádný z nich není v aktivním plánu (watchdog větev `cvik_v_planu_bez_media`
mlčí), takže to dnes nikoho netrápí — proto je to až tady.

Zjisti, odkud se vizuály berou (`exercise_asset_registry`, cron
`/api/cron/import-exercises`), a doplň je. U cviku bez vizuálu tlačítko
nezobrazuj.

## 4.6 Variabilita tréninku (návrh, pak schválení)

Pořád A/B donekonečna, žádná progrese v čase. Navrhni model progrese (objem,
intenzita, obtížnost) a **počkej na schválení**, než začneš implementovat.
