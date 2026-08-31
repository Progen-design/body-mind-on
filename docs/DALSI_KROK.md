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

## 6.6 ČASY U ZPRÁV TRENÉRA JSOU O DVĚ HODINY NAPŘED

Změřeno 31. 8. 2026 v 15:15 na produkci, účet `janprikopa+r01@gmail.com`,
odpověď `GET /api/profile`:

```
coach_messages[0].created_at = "2026-08-31T00:04:30.12"
```

Za časem **není žádná zóna**. Prohlížeč takový řetězec bere jako lokální čas,
takže zprávu vzniklou v 00:04 UTC (= 02:04 v Praze) ukáže jako 00:04. Přesně
ten dvouhodinový posun, který Honza viděl.

Příčina je ve schématu, ne v komponentě:

```
ai_messages.created_at          timestamp without time zone   ← zdroj posunu
ai_messages.delivered_at        timestamp without time zone   ← totéž
coach_chat_messages.created_at  timestamp with time zone      ← správně
```

`ai_messages` je jediná tabulka v tomhle řetězci bez zóny. Hodnoty v ní jsou
uložené v UTC (zapisuje je server přes `now()` / JS ISO), takže převod je
jednoznačný.

### Co s tím

1. **Migrace** (napiš soubor, neaplikuj):
   `alter table public.ai_messages alter column created_at type timestamptz
   using created_at at time zone 'utc';` totéž pro `delivered_at`. Zkontroluj
   i `default` u sloupce — ať po převodu není `now()` v jiném významu.

2. **Projdi všechny ostatní `timestamp without time zone`** v `public` a
   napiš seznam: u kterých se hodnota dostane až do UI (a mají tedy stejnou
   vadu) a u kterých ne. Neopravuj je v tomhle bodě, jen je vyjmenuj.

3. **Test, který tenhle tvar chytí.** Datum bez zóny se nesmí dostat do
   `naZpravyTrenera`. Buď to serverem normalizuj na ISO s `Z`, nebo to v
   adaptéru odmítni jako nepoužitelné datum — ale ať to tvrdí test, ne
   komentář.

4. Filtr stáří v `naZpravyTrenera` (`PLATNOST_ZPRAVY_DNI = 7`) počítá s
   `Date.parse` téhož řetězce, takže je i hranice o dvě hodiny vedle. Po
   opravě dat se to spraví samo — ověř to testem, ne pohledem.

### Co v tomhle bodě NEDĚLEJ

**Bod „TED odpovídá na různé otázky stejně" padá — neplatí.** Změřeno dnes
na produkci, dvě různé otázky přes `POST /api/coach-chat`, účet r01:

```
„Co bych měl udělat, abych zhubnul?"   → 2162 kcal, 166 g bílkovin, 1–2× týdně
„Kolik bílkovin mám denně jíst?"       → „denně 166 g bílkovin", nic víc
```

Dvě různé, věcně správné odpovědi s reálnými čísly toho účtu (sedí s
`body_metrics` na jednotku). Původní nález vznikl na dvojici otázek, kde
druhá zněla „over to s mym profilem" — na tak neurčitý dotaz je podobná
odpověď v pořádku. Cache to není. **Neřeš to, nepřepisuj prompt.**

---

## 6.8 NÁKUPNÍ SEZNAM SEDÍ UVNITŘ PANELU „AI TRENÉR TED"

Karta „Nákupní seznam · 72 položek" je vykreslená ve stejném rámci jako AI
trenér. Se seznamem k nákupu nemá TED nic společného — patří k jídelníčku.
Nález z průchodu profilem 29. 8., ověřeno na screenshotech.

Samostatný bod, ne součást 6.6 — je to čistě rozvržení, žádná data.

---

## 6.9 „DNEŠNÍ TRÉNINK" UKAZUJE JINÝ DEN, NEŽ JE DNES

Dvakrát potvrzeno: tréninkové dny po/st/pá, zobrazeno v neděli 30. 8. s
nadpisem „Dnešní trénink" a štítkem „Pátek". Na záložce Tréninkový plán je
tatáž věc popsaná správně jako „nejbližší trénink v plánu".

Buď se má nadpis změnit na to, co karta opravdu ukazuje, nebo se má ve dnech
bez tréninku ukázat, že dnes trénink není. Rozhodni a zdůvodni; nechci
nadpis, který lže.

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
