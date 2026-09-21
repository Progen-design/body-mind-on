# Doladění po #244 — mobil, pravdivé texty, web

Založ větev `feat/ux-doladeni` z aktuálního `main` (po #245). Necommituj, nepushuj,
neotvírej PR. Dvě repa: body-mind-on (bod A–F) a bodyandmindon-web (bod G).

Všechno níž jsem ověřil na produkci 20. 9. — na desktopu i v mobilním viewportu
390 px (iframe se stejnou session). Nálezy jsou reálné, ne odhad.

---

## A. Mobil: názvy jídel v „Dnešek" jsou useknuté (NEJDŮLEŽITĚJŠÍ)

Na 390 px je v řádku jídla zaškrtávátko + štítek/název + kcal + tlačítko
„Recept". Na název zbyde ~90 px, takže uživatel vidí „Ovesná kaš…",
„Cottage s p…", „Kuře s rýži…". Nepřečte, co má jíst.

Oprava (vzor MyFitnessPal / Yazio — celý řádek je tap na detail):
- **celý řádek jídla** (mimo zaškrtávátko) otevře recept — `onSelectRecipe(meal)`.
  Je to `<button>` nebo má `role="button"`, `tabIndex`, Enter/Space, a
  viditelný focus. Tohle zároveň řeší Honzovu původní výtku „jídlo nejde
  rozkliknout" — teď jde jen malé tlačítko vpravo, klik na název nedělá nic
  (ověřeno: název nemá žádného klikacího předka).
- tlačítko „Recept" **pod `sm` schovej** (`hidden sm:inline-flex`). Na
  desktopu může zůstat jako vizuální nápověda.
- **Zaškrtávátko nesmí otevřít recept** — `stopPropagation` na jeho kliku.
  Pozor na vnořený `<button>` v `<button>`: to je nevalidní HTML. Buď je
  řádek `div role="button"` se zaškrtávátkem jako skutečným buttonem, nebo
  zaškrtávátko stojí vedle řádku, ne uvnitř.
- Na mobilu musí být název **celý nebo aspoň do dvou řádků** (`line-clamp-2`
  místo `truncate`), ne useknutý na jednom.
- Stejné platí pro `RadekJidlaGrid` v „Tvůj další týden" — tam klik vede na
  náhled zamčeného jídla (`onSelectRecipe` z `TrialPaywallCard`).

Test: nový test v `src/components/`, který hlídá, že řádek jídla je klikací
a „Recept" je pod `sm` skrytý.

## B. Den volna: pryč s „Prohlédnout tréninkový plán"

Honza to napsal výslovně: *„když je tam prohlédnout si tréninkový plán i když
ho daný den nemám, je blbost."* #241 to zdegradovalo na sekundární tlačítko,
ale pořád tam je (ověřeno dnes, neděle = volno). Ve dni volna ho **odstraň
úplně**. Řádek „Trénink — Dnes volno" nad tím už informaci nese a záložka
Tréninkový plán je o kus výš. Uprav `dnesniPrehled.test.ts` (řádek 55–72),
ať hlídá, že ve dni volna tlačítko NENÍ.

## C. Gramatika u cviků s „na stranu"

`lib/profile/treninkPopis.js:148` skládá
`${s} ${serieSlovo} po ${opakovaniText} opakováních` — u jednostranných cviků
je `opakovaniText` = „14–16 na stranu", takže vznikne
**„3 série po 14–16 na stranu opakováních"** (Dead bug, ověřeno na produkci).
Má být „3 série po 14–16 opakováních na stranu". Oddělit „na stranu" z
`opakovaniText` a přidat ho za slovo „opakováních". Test s „na stranu" do
stávajícího testu `treninkPopis`.

## D. Rozpor u TEDa v ceníku

`lib/pricing.ts:91` u ON CLUB: **„AI trenér TED 24/7 (brzy)"**. Přitom TED je
živý ve všech tarifech (web commit f0eaaf3 „TED je živý ve všech tarifech"),
v appce je v hlavičce „Zeptat se TEDa" a `START_REASONS` ho slibuje už v
STARTu. Placená karta tvrdí, že to, co člověk už má, přijde „brzy". Oprav
tak, aby odrážka říkala pravdu — buď ji z ON CLUB vyhoď (je to v „VŠE ze
START +"), nebo tam dej, čím se ON CLUB u TEDa skutečně liší. Když nevíš, co
je pravda, **nepiš nic a napiš mi to jako otázku** — nevymýšlej funkci.

## E. Nepravdivý důvod ke koupi

`START_REASONS` v `lib/pricing.ts`: **„Každý týden se plán přepočítá podle
toho, jak ti šel ten minulý."** Ověřil jsem: týdenní přepočet
(`lib/weeklyWeightRecalc.js`) jede podle **sedmidenního mediánu váhy**.
Denní check-in, odškrtaná jídla ani odcvičené tréninky do plánu nevstupují
(`daily_checkins` čte jen `inactivity-reminder` a `profile`). Přepiš na
pravdivé, např. „Každý týden se kalorie přepočítají podle tvé aktuální váhy".
Brand pravidlo: bez přehnaných slibů.

## F. Podtitulek sekce Účet

`UcetASpravaSection.tsx:99`: „Zrušení předplatného, smazání účtu a právní
dokumenty". Sekce teď začíná výběrem členství, podtitulek o něm mlčí —
Honza nabídku přehlédl a myslel si, že tam není. Např. „Členství,
zrušení předplatného a smazání účtu".

---

## G. Web bodyandmindon.cz — dlaždice „Mysl a regenerace" → AI trenér TED

Repo `C:\Users\prikopa\Documents\GitHub\bodyandmindon-web`, soubor
`lib/content.ts:263`. Sekce „Čtyři pilíře" slibuje **„Spánek, návyky a
motivace jako součást plánu"** — návyky jsme z appky vyřadili, takže web
slibuje funkci, která není. Honza chce místo ní **AI trenér TED**.

- nahraď dlaždici TEDem: krátký titulek + jedna věta, co TED dělá **na
  tvém konkrétním plánu** (to je rozdíl proti obecnému chatbotu). Tón podle
  značky — stručně, prakticky, bez přehnaných slibů. Neslibuj nic, co TED
  neumí; když nevíš, podívej se do `lib/coachChat*` v body-mind-on.
- ikonu vyber ze stávající sady `glyph` v tom souboru.
- projdi celý `lib/content.ts` a web, jestli „návyky" nejsou slíbené ještě
  jinde (hero „Jídelníček, trénink i návyky na jednom místě" — ano, je).
  Každý výskyt uprav nebo mi ho vypiš.

**POZOR:** v bodyandmindon-web jsou necommitnuté cizí změny v
`app/faq/page.tsx`, `components/faq-accordion.tsx`,
`components/weight-chart.tsx`. **Nesahej na ně**, nepřidávej je do ničeho.
Založ vlastní větev a měň jen to, co patří k bodu G.

---

## Ověření

body-mind-on: `npm run check` exit 0.
bodyandmindon-web: jeho vlastní build/lint (najdi v `package.json`).

## Výstup

Po bodech A–G: co jsi změnil, v kterém souboru, a jaký test to hlídá. U D a G
výslovně napiš, co jsi ověřil o TEDovi a odkud. Co jsi NEudělal a proč.
