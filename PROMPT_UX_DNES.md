# Zadání: přeskládat záložku Dnes a dodělat UX drobnosti

Datum: 2026-09-18
Samostatný kus práce, vlastní větev. `PROMPT_NAKLADY_AI.md` a `PROMPT_PRO_CODE.md`
běží nezávisle.

---

## Diagnóza — proč Dnes nedává smysl

Pořadí sekcí v `src/App.tsx` (řádky ~1074–1152) je dnes:

```
ProfilHlavicka → DnesniPrehled → TrialPaywallCard → OverviewBentoGrid
→ DenniCheckin → PropojenaZarizeniSection → UcetASpravaSection
```

Tři sekce ukazují totéž a jedna je uprostřed cesty špatně:

1. **`DnesniPrehled`** říká „Jídla — 0 z 6 zaznamenáno".
2. **`OverviewBentoGrid`** říká znovu „0 z 6 jídel zaznamenáno" a teprve pak ta jídla
   vypíše.
3. **`TrialPaywallCard`** sedí **mezi nimi** a ukazuje jídelníček na **PŘÍŠTÍ** týden.

Uživatel tedy scrolluje: souhrn dneška → menu příštího týdne (zamčené) → menu dneška.
Budoucnost přerušuje přítomnost. To je hlavní chyba, ne kosmetika.

K tomu se na Dnes zdvojuje obsah záložek:

- „Aktuální váha / Cílová hmotnost" = záložka **Tělo & Váha**
- „Nastavené denní cíle & Makroživiny" = záložka **Jídelníček & Makra**

Když je všechno na Dnes, záložky ztrácejí smysl a stránka je zbytečně dlouhá.

**Pravidlo, podle kterého to přeskládat:** *Dnes odpovídá na jedinou otázku — co mám
dneska dělat.* Referenční hodnoty (cíle, historie váhy, zařízení, účet) patří do svých
záložek. Prodej nepatří doprostřed.

---

## A. Nové pořadí na Dnes

1. **Hlavička** — beze změny.
2. **Úzký prodejní pruh pod hlavičkou** — jeden řádek: „Zkušební období končí za 13 dní"
   + tlačítko „Odemknout". Žádná karta, žádné ceny, výška do 48 px. Tohle je jediný
   prodej v horní části stránky.
3. **Dnešek** — jedna sloučená karta místo dnešních dvou:
   - nahoře pruh kcal a makra (dnešní příjem proti cíli)
   - pod ním **všech 6 jídel** (dnes se ukazují jen 3 — „Zobrazeny 3 z 5 jídel"),
     každé rozklikávací do detailu receptu
   - pak řádek trénink (nebo „Dnes volno") s odkazem do plánu
   - Sloučí `DnesniPrehled` a jídelní část `OverviewBentoGrid`. Jeden seznam, jedno místo.
4. **Jak ti dnešek seděl?** — `DenniCheckin` hned po dni, je to jeho uzavření.
5. **Nákupní seznam** — jednořádkový vstup („79 položek →"), otevře modál.
6. **Tvůj další týden** — `TrialPaywallCard`, ale **sbalený a bez cen**. Jen datum,
   počet jídel a věta, že se odemkne s členstvím. Rozbalí se na klik.
7. **Propojená zařízení** — beze změny.
8. **Účet a předplatné** — a **uvnitř** něj plné srovnání START / ON CLUB (bod C).

**Přesunout pryč z Dnes:**
- „Aktuální váha / Cílová hmotnost" → do **Tělo & Váha** (bod D)
- „Nastavené denní cíle & Makroživiny" → do **Jídelníček & Makra**

---

## B. Zarovnat názvy jídel

V seznamech jídel (v „Dnešek" i v „Tvůj další týden") dnes stojí štítek a název ve
flexu za sebou, takže název začíná pokaždé jinde — „SNÍDANĚ" a „DOPOLEDNÍ SVAČINA" mají
jinou šířku.

Použij **grid o třech sloupcích**: štítek (pevná šířka), název (`1fr`), kcal (auto,
zarovnané doprava). Na mobilu štítek nad názvem, kcal pořád vpravo.

Jídla v „Tvůj další týden" musí jít **rozkliknout do detailu receptu** stejně jako
dnešní — teď nejdou vůbec.

---

## C. Proč si to koupit

Dnešní odrážky u STARTu jsou výčet funkcí, ne důvod: „Osobní tréninkový plán / Týdenní
jídelníček / Týdenní automatická úprava plánu".

Nahraď je důvody. Drž tón značky — konkrétně, bez přehnaných slibů, bez superlativů:

```
START — 599 Kč/měsíc, 7 dní zdarma

· Jídelníček i trénink podle tvých čísel, ne obecná tabulka
· Každý týden se plán přepočítá podle toho, jak ti šel ten minulý
· Jídlo, které ti nesedí, vyměníš jedním klikem — kalorie dne zůstanou sedět
· Nákupní seznam se poskládá sám z tvého jídelníčku
· TED odpovídá na tvůj konkrétní plán, ne obecně
· Zrušíš kdykoli. Ve zkušebním období neplatíš nic.
```

Poslední odrážka tam patří vždycky a až úplně dole — sundává riziko z rozhodnutí.

U ON CLUB nech dnešní odrážky, jen doplň stejnou větu o zrušení.

Tenhle blok je **na dvou místech a nikde jinde**: v „Účet a předplatné" (plný) a jako
úzký pruh pod hlavičkou (jen countdown + tlačítko).

---

## D. Tělo & Váha — doplnit cílovou váhu

Na záložce je jen „Váha: 78,0 kg". Cílová hmotnost (82 kg) je dnes na Dnes, kam nepatří.

Přesuň ji sem a ukaž ji **jako postup, ne jako druhé číslo**: aktuální, cílová, rozdíl
(„+4,0 kg do cíle") a jednoduchý ukazatel. Když cíl není nastavený, zůstane „Nastavit cíl".

---

## E. Nákupní seznam — zaškrtnout vše a tisk

`ShoppingListModal.tsx`:

1. **„Zaškrtnout vše"** vedle počtu položek. Když je vše zaškrtnuté, přepne se na
   „Odškrtnout vše". **Jedno dávkové volání na server, ne 59 jednotlivých** — projdi,
   jak se ukládá jedna položka, a udělej k tomu hromadnou variantu.
2. **„Tisk / PDF"**. Ano, jde to a nepotřebuje žádnou knihovnu: stejný vzor jako
   `ExportMealPlanModal.tsx`, který používá `window.print()` a `@media print` styl.
   V tiskovém dialogu je „Uložit jako PDF" a hotovo. Tiskni seznam po kategoriích,
   s množstvím, bez navigace a tlačítek.

---

## F. Mobil — karta cviku

Na mobilu se v `WorkoutSection.tsx` rozpadá karta cviku: odznak „4 × 6–8" se láme do
tří řádků a „Jak na to" taky. Je to vodorovný flex, který se pod `sm` nezalomí.

Pod `sm` udělej z karty svislé rozvržení: název a partie přes celou šířku, pod tím
řádek s odznakem série×opakování a tlačítkem vedle sebe. Tlačítku dej `whitespace-nowrap`
a `shrink-0`, ať se nikdy neláme. Zkontroluj to na šířce 360 px.

Projdi při té příležitosti i ostatní karty na mobilu (jídlo, check-in, zařízení) a kde
se něco láme stejně, sjednoť to.

---

## Co musí platit

- `npm run check` zelený (pouští i typecheck a build)
- testy na nové chování: pořadí sekcí na Dnes, grid zarovnání jídel, „zaškrtnout vše"
  jako jedno volání, tisk seznamu, mobilní rozvržení karty cviku
- žádná sekce se neukazuje dvakrát — po přesunu zkontroluj, že váha a makro cíle jsou
  jen na svých záložkách

## Pravidla

- **Nekomituj, neotvírej PR, neměř produkci.** Nahlas a čekej.
- Texty piš v tónu značky: stručně, konkrétně, bez přehnaných slibů a bez superlativů.
- Když ti u některého bodu přijde lepší jiné řešení, řekni to a zdůvodni — nepřepisuj
  zadání potichu.
