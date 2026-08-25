# Etapa 4 — co klientovi v aplikaci chybí

Pořadí práce: **4.0, 4.7, 4.8, pak 4.1–4.3.** Zbytek (4.4–4.6) až po schválení.
Postupuj po jednom bodu, po každém ukaž diff a počkej na „schvaluji".

Platí pravidla z `claude/BMON_PROMPT_KOMPLETACE_2026-08-23.md`:
bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná mock data, žádný Next.js,
jeden zdroj pravdy, `lib/` je čisté JS s explicitními `.js` importy.

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
