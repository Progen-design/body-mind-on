# Další krok pro Claude Code

## Pravidla, která platí nade vším

- **Neměř produkci.** Žádné dotazy do DB, žádné Vercel MCP, žádné volání
  produkčních endpointů. Čísla dostaneš hotová.
- **Nikdy `supabase db push` ani `apply_migration`.** Migrace nasazuje
  Honzův druhý Claude.
- **Jeden bod na jednu session.** Po dokončení `/clear`.
- **Model Sonnet.** Eslint na `src/` nespouštěj, repo ho tam nemá.
- Bez dat žádný závěr, `null` je „—" a nikdy `0`, žádná mock data, žádný
  Next.js, jeden zdroj pravdy.
- Konec = diff a čekání na „schvaluji". Necommituj sám.

---

## 6.4 ZÁPIS VÁHY SMAŽE ČÁST PROFILU — DĚLEJ TOHLE PRVNÍ

Změřeno 29. 8. na účtu `janprikopa+t6@gmail.com`. Registrace v 01:54, ruční
zápis váhy 61,4 kg tlačítkem „Nové vážení" v 02:07. Starý řádek
`body_metrics` se nepřepsal — vznikl druhý, a ten přišel o data:

```
vzniklo               váha    workout_days  diet_type    protein_g  kalorie
2026-08-29 01:54:47   62.00   1,3,5         vegetarian   112        1436
2026-08-29 02:07:36   61.40   NULL          NULL         NULL       1537
```

Ztraceno: `diet_type` (vegetarian → NULL), `workout_days` (1,3,5 → NULL),
`protein_target_g` (112 → NULL). A `calories_target` vyskočil z 1436 na
1537, přestože uživatelka zhubla — při redukci má klesat.

Generátor plánu čte poslední řádek `body_metrics`. Příští týdenní plán se
tedy vyrobí bez vegetariánské diety, bez tréninkových dnů a s vyšším
příjmem. Vegetariánka, která se zváží, přijde o vegetariánství.

Ostatní účty mají po jednom řádku jen proto, že u nich vážení nikdo
nezkoušel. Není to okrajový případ.

**Pozn.: netýká se to chytré váhy ani hodinek.** Withings a Apple Health má
zatím připojený jenom Honza na svém účtu a pro projekt to zatím není
směrodatné. Tohle spouští obyčejné ruční vážení v UI.

### Nejdřív nález, pak čekej na schválení

1. Endpoint za tlačítkem „Nové vážení" — co posílá a co s tím server dělá.
   Kde přesně vzniká druhý řádek `body_metrics`.
2. Jestli je `insert` místo `update` záměr (historie měření) nebo chyba.
   Pokud záměr, musí nový řádek zdědit VŠECHNA pole, ne jen váhu.
3. Odkud se vzalo 1537 kcal. Nižší váha má dát nižší cíl; podezření padá na
   chybějící `goal` nebo `diet_type` v tom novém řádku.
4. Jestli totéž dělá i synchronizace z Withings, nebo jen ruční zápis.

Je to datová cesta, ne UI. Kód až po schválení návrhu.

---

## 6.2 KARTA WITHINGS — HOTOVO, NASAZENO (PR #110). NEŘEŠ, JE TU JEN PRO HISTORII.

`src/components/WithingsCard.tsx` lže třikrát. Změřeno 29. 8. na účtu,
který **nemá jediný řádek ve `withings_connections`**.

**a) Odznak „Online" je natvrdo v JSX** (ř. 52–57). Nikdy se neptá na stav
připojení. Svítí i účtu bez zařízení.

**b) Čas poslední synchronizace je výchozí hodnota:**

```js
lastSyncedText = 'dnes v 08:45'
```

Na produkci se v jednom načtení zobrazilo `dnes v 08:45`, o chvíli později
`dnes v 04:07` — ve čtyři ráno. Číslo se nebere z měření.

**c) Tlačítko hlásí úspěch, i když se nic nestalo** (ř. 27–31):

```js
await new Promise((res) => setTimeout(res, 1200)); // Simulated sync animation
setSyncSuccess(true);
```

„Aktualizováno!" se zobrazí bez ohledu na výsledek `onSync()`.

### Co změnit

Karta nesmí tvrdit nic, co nemá z dat. Rozšířit props o skutečný stav
připojení a skutečný čas posledního stažení, obojí z profilu (`api/profile.js`
už `has_withings_connection` a `withings_last_sync_at` vrací — ověř grepem,
nedomýšlej).

- **Bez připojení:** místo „Online" stav, který odpovídá skutečnosti, a
  místo řádku o poslední synchronizaci výzva k propojení. Tlačítko
  „Synchronizovat teď" v tomhle stavu nedává smysl.
- **S připojením:** „Online" jen když spojení opravdu je, a čas z
  `withings_last_sync_at`. Když je `null`, píše se „—", nikdy vymyšlený čas.
- **Výsledek synchronizace:** „Aktualizováno!" jen když `onSync()` doběhne
  bez chyby. Když selže, řekni to. Umělé čekání 1200 ms zrušit.

Vzor pro formulaci odstupu je na kartě Apple Health na záložce Můj profil —
ta odstup měří správně (`před 17 min`) a text nelže. Použij tutéž pomocnou
funkci, nepiš druhou.

### Testy

Do `lib/__tests__/` přidat případy nad tou pomocnou funkcí a nad logikou
stavu karty: bez připojení, s připojením a `null` časem, s připojením a
časem. Vzor pro pojmenování je `withingsConnectedUi.test.mjs`.

---

## 6.3 REGISTRACE ZAHODÍ ZVOLENÉ VYBAVENÍ — PŮVODNÍ DIAGNÓZA BYLA ŠPATNĚ

Změřeno 29. 8. Účet, který v registraci vybral **doma s vybavením:
jednoručky + odporové gumy**, dostal tréninkový plán s:

```
Nářadí: jednoručky, velká činka, vlastní váha
2. Bench press          3 × 14-16
3. Přítahy v předklonu  3 × 14-16
```

Velkou činku ani lavici nemá a nezadala je.

### Co se čekalo (chybně) a co je skutečně

Původní zápis níž předpokládal, že chybí sloupce `training_environment` a
`available_equipment` v `body_metrics`, a že se proto data ztrácí v
`lib/registration/bodyMetricsRegistration.js` ř. 275–276
(`delete insertPayload.available_equipment`). **Sloupce v DB skutečně
nejsou** (ověřeno), ale ztráta dat to není a migrace bug neopraví.

`lib/trainingEnvironment.js` ř. 2 to říká rovnou: „bez DB migrace — ukládá
se do notes". Hodnota se PŘED insertem vloží jako text do `payload.notes`
(`trainingEnvironmentNotesSuffix`) a při čtení plánu se regexem parsuje
zpátky (`parseTrainingEnvironment`/`parseAvailableEquipment`). Ověřeno
spuštěním skutečného kódu (registrace → DB round-trip přes `notes` → re-parse):

```
notesFinal = "Kde cvičí: Doma s vybavením. Pomůcky: Jednoručky, Odporové gumy"
parseTrainingEnvironment → home_equipment
parseAvailableEquipment  → ['dumbbells', 'bands']
```

Vybavení se tedy zachová celou cestou až do `planOrchestrator.js`.

### Kde je skutečná chyba

`filterWorkoutPlanForTrainingEnvironment()` → `adaptExerciseForTrainingEnvironment()`
v `lib/trainingEnvironment.js`. Ověřeno přímým voláním s
`env='home_equipment'`, `equipment=['dumbbells','bands']`:

```
bench_press adapted    → beze změny (zůstává Bench press)
bent_over_row adapted  → beze změny (zůstává Přítahy v předklonu)
```

Přesně reprodukuje produkční nález. Pro `home_equipment` (ř. 373–385) se na
náhradu (`resolveHomeEquipmentReplacement`) posílá jen `GYM_MACHINE_ONLY`
(`leg_press, lat_pulldown, chest_press, hamstring_curl, hip_thrust`) +
`goblet_squat`. Zbytek `GYM_ONLY_CANONICAL` — **`bench_press`,
`bent_over_row`, `romanian_deadlift`, `overhead_press`, `lateral_raise`,
`bicep_curl`, `tricep_extension`** — touhle větví vůbec neprojde a padne jen
na obecnou kontrolu `EQUIPMENT_REQUIRES` (ř. 113–123). Ta bere seznam jako
„stačí libovolná jedna položka" (`equipmentHas` = `.some()`):
`bench_press: Set(['bench','dumbbells'])` tak projde se samotnými
jednoručkami, bez lavice — což neplatí, bench press bez lavice nejde.

Zůstává tak výchozí **barbellová** varianta (`lib/exerciseCanonicalMap.js`:
`bench_press`/`bent_over_row` mají `equipment: 'barbell'`) — proto plán
ukazuje „velká činka", i když „barbell" není ani mezi možnostmi, které si
uživatel v registraci může zvolit (`EQUIPMENT_LABELS` nabízí jen
dumbbells/bands/pullup_bar/kettlebell/bench/trx/other).

Existující test `scripts/verify-training-environment-strictness.mjs`
ř. 73–84 („home_equipment without gear") staví plán s `bench_press` +
`available_equipment: ['dumbbells']`, ale assertuje jen na `pull_up` —
`bench_press` se nekontroluje, proto regrese prošla testem.

### Co udělat

**Žádná migrace.** `body_metrics.notes` fallback funguje a je to vědomá
volba v repu. Oprava patří do `lib/trainingEnvironment.js`:

1. Rozšířit `adaptExerciseForTrainingEnvironment()` pro `home_equipment` tak,
   aby přes `resolveHomeEquipmentReplacement` (nebo obdobu) procházela celá
   `GYM_ONLY_CANONICAL` sada, ne jen `GYM_MACHINE_ONLY`.
2. Opravit `EQUIPMENT_REQUIRES['bench_press']` — potřebuje lavici *a*
   nějakou zátěž, ne libovolnou jednu položku ze setu.
3. Doplnit `scripts/verify-training-environment-strictness.mjs`, ať
   „home_equipment without gear" test skutečně assertuje na `bench_press`
   (a případně `bent_over_row`, `romanian_deadlift`, `overhead_press`),
   ne jen na `pull_up`.

Kód se zatím nepíše — čeká na schválení.

---

## Vyřešeno

**6.1** — máslo neprojde bezlaktózovou bránou. Nasazeno `4415955`.

## Vědomě odloženo

**Trial nemá kde zaplatit dřív než 3 dny před koncem.** Honza 29. 8.:
je to v pořádku, dřív připomínat netřeba.

**Interní názvy receptů** („Tuňák s pečivem — sytá svačina — XL").

**Nákupní seznam:** rozsypané kategorie, sůl 74 g a pepř 69 g na týden,
položky se dvěma jednotkami. Podrobnosti v
`docs/AUDIT_PROFILU_NALEZY_2026-08-29.md`.
