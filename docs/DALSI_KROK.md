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

## Zadání pro další session

Momentálně žádné. Body 6.1 až 6.11 jsou hotové a nasazené. Otevřené věci
jsou v „Vědomě odloženo" níž — než z nich něco vytáhneš, počkej na zadání.

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
