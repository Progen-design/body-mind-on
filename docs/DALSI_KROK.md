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

## 6.8 + 6.9 KARTA 6 A KARTA 4 V OVERVIEWBENTOGRID

Oba body jsou ve stejném souboru (`src/components/OverviewBentoGrid.tsx`),
takže je dělej v jedné session. Jinde nic měnit nemusíš.

### 6.8 Nákupní seznam sedí uvnitř panelu „AI Trenér TED"

Není to omyl v rozvržení — karta 6 je tak postavená schválně. V kódu se
jmenuje `KARTA 6: AI Trenér TED & Rychlý nákup` (ř. 452) a komentář říká
„Kompaktní informativní blok s AI doporučením a nákupním seznamem".

Vadí to proto, že **hlavička karty říká jen „AI Trenér TED"** (ř. 470).
Uživatel tedy vidí seznam k nákupu pod nadpisem, se kterým nemá nic
společného. Rozpor je mezi záměrem a titulkem, ne v samotném umístění.

Rozhodni a zdůvodni jednu z cest:
  a) nákupní pilulku přesunout na kartu 3 (`Jídelníček & Makra dnes`,
     ř. 227) — patří k jídelníčku a ta karta je přes dva sloupce;
  b) nechat ji tam a doplnit hlavičku, ať odpovídá obsahu.

Doporučení psané do zadání: (a). Karta 6 je jediné místo, kde je TED
vidět, a nákup ho tam ředí. Pokud zvolíš (b), napiš proč.

### 6.9 „Dnešní trénink" ukazuje jiný den, než je dnes

Příčina je v `src/lib/trenink.ts` ř. 31:

```ts
export function dnesniTrenink(workouts: WorkoutDay[]): WorkoutDay {
  return workouts.find(w => w.isToday) ?? workouts[0] ?? DEN_BEZ_TRENINKU;
}
```

`isToday` se nastavuje v `src/data/adaptery.ts` ř. 340 jako
`String(d?.date) === dnes` — porovnání data. V den bez tréninku (plán
po/st/pá, zobrazeno v neděli) se tedy netrefí nic a funkce spadne na
`workouts[0]`, tedy na první trénink v plánu. Karta ho pak ukáže pod
nadpisem „Dnešní trénink" se štítkem dne, který dnes není.

`DEN_BEZ_TRENINKU` (`title: 'Dnes bez tréninku'`) v tom souboru existuje,
ale sáhne se po něm jen u úplně prázdného pole.

Fallback na `workouts[0]` vznikl proto, aby komponenty nečetly
`undefined.title` (komentář v App.tsx ř. 745). Ta obrana má zůstat —
ale nesmí vydávat cizí den za dnešek. Zamysli se nad tím, kdo dnes
`dnesniTrenink()` volá: `App.tsx` ř. 748 a `WorkoutSection.tsx` ř. 44
(tam přes `vybranyTrenink`, kde je fallback na dnešek správný, protože
záložka Tréninkový plán o sobě tvrdí „nejbližší trénink v plánu").
Nerozbij druhé volání, když opravíš první.

Ke každé změně test. Chování „v den volna se neukáže cizí trénink" patří
do `src/lib/trenink.test.ts`.

---

## 6.10 DATUM VÁŽENÍ SE MŮŽE TREFIT DO ŠPATNÉHO DNE

Zbytek po 6.6, změřeno 31. 8. na produkci. Odpověď `GET /api/profile`
u účtu r01:

```
body_metrics[0].created_at = "2026-08-31T00:03:59.275"   ← bez zóny
```

`body_metrics.created_at` je pořád `timestamp without time zone`.

Serveru to nevadí — `lib/vahaHistorie.js` staví `weight_history` přes
`calendarDateIsoInPrague()` a Node na Vercelu běží v UTC, takže datum
vychází správně (ověřeno: 00:03 UTC → 2026-08-31, což je v Praze 02:03).

Vadí to **klientskému fallbacku**: `naVazeni()` v `src/data/adaptery.ts`
(~ř. 811) bere `String(m.created_at).slice(0, 10)`, tedy kalendářní datum
přímo z UTC řetězce. Vážení mezi 22:00 a 24:00 UTC (= 00:00–02:00 v Praze)
tak spadne v grafu na předchozí den. Ta větev se použije, když v odpovědi
chybí `weight_history`.

Stejný vzorec jako 6.6, jen o jednu tabulku vedle. Migraci piš stejně
(`at time zone 'utc'`) — že jsou hodnoty v UTC, je ověřené na
`ai_messages` stejnou cestou. Pozor: `body_metrics.created_at` se používá
mnohem víc než `ai_messages` (řazení, `quickWeightRow`, kalorické cesty),
takže napřed vypiš všechna místa, která na něm závisí, a teprve pak navrhni
změnu typu.

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
