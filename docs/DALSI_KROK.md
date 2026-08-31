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

## 6.5 VÝŠKA SE UKLÁDÁ TAM, KDE JI NIKDO NEČTE

Změřeno na produkci 31. 8., účet `janprikopa@gmail.com`. Uživatel uložil
v modalu „Nastavení profilu" výšku 194 cm. Výsledek:

```
auth.users.user_metadata.height_cm   194   změnilo se
body_metrics.height_cm               182   NEZMĚNILO se
tdee                                3101   beze změny
calories_target                     2164   beze změny
bmi                                31,64   pořád ze 182 cm
```

Hlavička profilu čte `user.height_cm` z metadat (`api/profile.js` ~ř. 577,
`adaptery.ts`: `odpoved.user?.height_cm ?? bm.height_cm`), takže ukazuje 194.
Generátor plánu a výpočet kalorií čtou `body_metrics.height_cm`, tedy 182.

Rozdíl dvanácti centimetrů dělá na BMR zhruba 75 kcal (2001 vs 2076 podle
Mifflin–St Jeor při 104,8 kg a 38 letech) a promítá se i do maker. Uživateli
se tedy od 2. srpna skládá jídelníček na výšku, kterou nemá.

### Příčina

Na výšku existují dva endpointy:

```
api/profile-body-data.js   zapisuje do body_metrics I do metadat   správně
api/profile-settings.js    zapisuje JEN do metadat                 tudy jde modal
```

`PreferencesModal.tsx` to má i v komentáři: „Cílová váha a výška zůstaly, ale
jdou přes `/api/profile-settings`", s odůvodněním „bez regenerace plánu".

### Nejdřív nález a návrh, kód až po schválení

1. Proč výška vede přes `profile-settings` a ne `profile-body-data`. Bylo to
   kvůli tomu, aby se nepřegeneroval plán? Jde to splnit i tak, že se výška
   uloží správně, jen se nespustí regenerace?

2. Návrh, kde má výška bydlet. Chci **jeden zdroj pravdy**. Metadata smí být
   kopie pro rychlé čtení, ale nesmí být místo, kde hodnota končí.

3. Když se výška změní, **musí se přepočítat `calories_target` a makra** — z
   výšky se počítá BMR. Je to vědomá cesta ve smyslu pravidla z etapy 6.4
   (`lib/quickWeightRow.js`), ne automatický přepočet při vážení. Napiš, kde
   ten přepočet má viset.

4. **Cílová váha je jiný případ** — do výpočtu se nepromítá a „uloží se
   rovnou" je u ní správně. Neslučuj je do jedné cesty bez rozmyslu.

5. Endpointy se neshodnou na mezích: `profile-settings` bere 100–250 cm,
   `profile-body-data` 120–230. Sjednotit a vzít meze ze sdíleného modulu,
   stejně jako to dělá `lib/vahaMeze.js` u váhy.

6. Text v modalu „Tyhle dva údaje plán nepřegenerují — uloží se rovnou" po
   opravě nebude pro výšku platit. Navrhni, co tam má stát.

---

## 6.6 CHAT S TEDEM: STEJNÁ ODPOVĚĎ, POSUNUTÉ ČASY, CHYBĚJÍCÍ DATUM

Změřeno 31. 8. na produkci, účet `janprikopa@gmail.com`, tabulka
`coach_chat_messages`.

### a) TED vrací na různé otázky doslova stejnou odpověď

```
23:26:11  user  "co bxch mel udelat proto abych zhubnul"
23:26:11  ted   "Abychom dosáhli úbytku hmotnosti, je důležité dodržovat…"
23:26:56  user  "over to s mym profilem"
23:26:56  ted   "Abychom dosáhli úbytku hmotnosti, je důležité dodržovat…"
```

Dvě různé otázky, odpověď znak po znaku totožná. Uživatel to hlásí slovy
„když se zeptám, odpovídá pořád stejně". Zjisti, jestli je to cache odpovědi,
nezahrnutá historie konverzace v promptu, nebo něco třetího.

### b) Časy v chatu jsou o dvě hodiny napřed

```
DB 2026-08-23 01:17:07  →  UI ukazuje 03:17
DB 2026-08-30 23:26:11  →  UI ukazuje 01:26
```

Přesně +2 h, tedy pražský offset. `coach_chat_messages.created_at` je
`timestamp without time zone` s uloženým UTC; klient ho bere jako lokální čas
a offset přičte podruhé. Ověř, jestli tentýž vzorec nemají i jiná místa, kde
se zobrazuje čas z `timestamp without time zone`.

### c) V chatu chybí datum, jen čas

Zpráva z 23. 8. se v panelu tváří jako dnešní („03:17"). To je hlavní důvod,
proč uživatel čte starou odpověď jako novou. U zprávy starší než dnešek se
musí zobrazit i datum.

### d) Nákupní seznam sedí vizuálně uvnitř panelu „AI Trenér TED"

Karta „Nákupní seznam · 72 položek" je vykreslená ve stejném rámci jako AI
trenér. Se seznamem k nákupu nemá TED nic společného — patří k jídelníčku.

### e) „Dnešní trénink" ukazuje pátek v neděli

Potvrzeno podruhé, teď na druhém účtu (tréninkové dny po/st/pá, zobrazeno
30. 8., což byla neděle, s nadpisem „Dnešní trénink" a štítkem „Pátek").
Na záložce Tréninkový plán je tatáž věc popsaná správně jako „nejbližší
trénink v plánu".

### Co je naopak v pořádku (needit, jen ať to neopravuješ zbytečně)

HRV 55,5 ms a klidový tep 61 bpm na kartě Regenerace sedí s
`apple_health_daily` pro 30. 8. přesně. Spánek „—" je správně, data nejsou.
Kalorie 2164 a makra 184/206/67 g sedí s `body_metrics` i s procenty
34/38/28. Čísla z Withings na kartě Tělo & váha sedí se snapshotem.
Rozdílná čísla HRV v TEDově zprávě (51 ms, tep 75) nejsou chyba — jsou
z 23. 8. a pro ten den v DB sedí. Vypadají špatně jen kvůli bodu (c).

---

## 6.7 ZMĚNA VÝŠKY NEPŘEPOČÍTÁ MAKRA A NEJDE ULOŽIT NEZMĚNĚNOU HODNOTU

Dva zbytky po etapě 6.5, oba změřené na produkci 31. 8.

### a) Makra zůstanou po změně výšky stará

`buildHeightUpdatePatch()` vrací `height_cm`, `bmi` a `calories_target`, ale
NE `protein_target_g` / `carbs_target_g` / `fat_target_g`. Po opravě výšky
u účtu `janprikopa@gmail.com`:

```
calories_target   2164 → 2634   přepočítáno
protein_target_g  185           beze změny
carbs_target_g    205           beze změny
fat_target_g      67            beze změny
```

185 × 4 + 205 × 4 + 67 × 9 = 2163 kcal. Uložená makra tedy sedí na starý cíl
2164, ne na nový 2634 — řádek si sám odporuje. Nikdo si toho zatím nevšiml,
protože UI si gramy dopočítává z procent a kalorií (`src/data/adaptery.ts`),
ale `protein_target_g` se čte i jinde (`adaptery.ts:727`) a zapisuje se při
týdenním přepočtu (`lib/weeklyWeightRecalc.js:138`) — do té doby je v DB
nekonzistence.

Přepočítat makra stejnou cestou jako `calories_target`, ne druhým vzorcem.
`lib/nutritionTargets.js` je už umí, používá je registrace i týdenní přepočet.

### b) Nezměněnou hodnotu modal vůbec neodešle

Uživatel měl v `user_metadata` výšku 194, v `body_metrics` 182. Modal načetl
194 z metadat, uživatel klikl Uložit — a **na server nešlo nic**, protože pole
nebylo „dirty". Rozjetý stav mezi zrcadlem a zdrojem pravdy se tedy přes UI
nedal opravit vůbec: člověk vidí správné číslo, uloží ho a nic se nestane.

Ověřeno protikladem: tentýž endpoint zavolaný přímo s `height_cm` funguje
(testovací účet, 165 → 170, BMI 22,33 → 20,83, cíl 1436 → 1386).

Návrh: buď posílat hodnoty vždy, ne jen změněné, nebo (lépe) po načtení
profilu porovnat metadata proti `body_metrics` a rozdíl srovnat — uživatel
by o tom vůbec neměl vědět.

---

## Hotovo a nasazeno — NEŘEŠ ZNOVU

- **6.1** máslo neprojde bezlaktózovou bránou — `4415955`
- **6.2** karta Withings už netvrdí, co nemá z dat — `24f20a4` (PR #110)
- **6.4** ruční vážení už nesmaže zbytek profilu — `0187255` (PR #111)
- **6.3** doma s vybavením už nehlásí velkou činku — `24eccd5` (PR #112),
  migrace `20260830120000` nasazená a ověřená: očekávaných klíčů 48,
  registry 221 řádků, 0 očekávaných klíčů bez řádku, `cvik_bez_vizualu`
  14 → 15 podle předpokladu.

---

## Vědomě odloženo

**Trial nemá kde zaplatit dřív než 3 dny před koncem.** Honza 29. 8.: je to
v pořádku, dřív připomínat netřeba.

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

**„Dnešní trénink" na profilu ukazuje pondělní jednotku i v sobotu.**

**Navigační záložky nemají přístupné jméno** pro odečítače obrazovky.
