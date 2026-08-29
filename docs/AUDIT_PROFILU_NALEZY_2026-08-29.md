# Průchod profilem klik po kliku — 29. 8. 2026

Testováno na živém trial účtu `janprikopa+t6@gmail.com` (žena, 165 cm, 62 kg,
redukce, vegetarián, doma s vybavením: jednoručky + odporové gumy,
2–3× týdně Po/St/Pá). Všech pět záložek, rychlé akce, zápis dat.

## Co funguje

- Všech pět záložek se přepíná a obsah odpovídá.
- Odznak `TRIAL · 7 DNÍ` svítí na profilu i ve sticky hlavičce ostatních
  záložek.
- **Ruční zápis váhy funguje.** 61,4 kg se okamžitě promítlo do karty,
  grafu i hlavičky. V databázi sedí (`user_checkins`).
- **AI trenér TED odpovídá.** Česky, věcně, se skutečným cílem bílkovin
  a odůvodněním podle cíle redukce.
- Prázdné stavy jsou poctivé: regenerace, HRV, spánek i cílová hmotnost
  ukazují „—", nikde vymyšlená nula.
- Tréninkový rozpis odpovídá zadání: Po/St/Pá, střídání jednotek A/B,
  5 cviků s odkazem „Jak na to".
- Jídelníček: 4 jídla na den s makry, recepty, PDF, nákupní seznam.

## Vady, v pořadí podle závažnosti

### 1. Karta Withings na záložce Tělo & Váha si vymýšlí

Účet nemá žádné připojení (`withings_connections` = 0 řádků). Karta přesto
hlásí:

```
Withings          Online
Poslední úspěšná synchronizace:   dnes v 04:07
```

Při jiném načtení téže stránky tam stálo `dnes v 08:45` — v době, kdy byly
čtyři hodiny ráno. Číslo se mění podle okamžiku vykreslení, není naměřené.

Táž věc na záložce Můj profil hlásí správně „Zatím žádné měření, stahuje
server sám, zatím ale žádné stažení neproběhlo". Dvě místa v jedné aplikaci,
dvě různé pravdy — a to horší z nich je vymyšlené.

### 2. Tréninkový plán ignoruje zvolené vybavení

Zadáno: doma s vybavením, **jednoručky a odporové gumy**.

Plán předepisuje:

```
Nářadí: jednoručky, velká činka, vlastní váha
2. Bench press          3 × 14-16
3. Přítahy v předklonu  3 × 14-16
```

Velkou činku ani lavici uživatelka nemá a nezadala. Odporové gumy se
nepoužily ani jednou. Plán, který nejde odcvičit, je horší než žádný.

### 3. Trial nemá kde zaplatit dřív než tři dny před koncem

Paywall se váže na zamčenou ukázku a ta vzniká až tři dny před koncem
běžícího plánu (`ZAMCENY_PLAN_LEAD_DNI = 3`). Kdo se rozhodne zaplatit
první den trialu, nemá v aplikaci kam kliknout.

### 4. „Dnešní trénink" ukazuje pondělní jednotku v sobotu

Dlaždice na záložce Můj profil je nadepsaná „Dnešní trénink" a pod ní
„Pondělí — Trénink A", přestože je sobota. Na záložce Tréninkový plán je
tatáž věc popsaná správně: „NEJBLIŽŠÍ TRÉNINK V PLÁNU (PONDĚLÍ)".

### 5. Záložka Apple Watch je slepá ulička

Text vyzývá „Připoj Apple Health a uvidíš tu regeneraci, tep a spánek",
ale na stránce není žádné tlačítko ani odkaz, kterým to jde udělat.

### 6. Nákupní seznam má rozsypané kategorie

„Ořechy, Tuky & Ostatní" je koš na všechno: parmezán, čočka, fazole,
jahody, broskve, hummus, tofu, celer, červená řepa, sojová omáčka —
a **voda**. Voda na nákupním seznamu.

Naopak mandlové mléko a kokosové mléko spadly do „Mléčné výrobky & Vejce",
což je u bezlaktózového uživatele přímo zavádějící.

Nekonzistence i uvnitř ovoce: maliny v „Zelenina & Ovoce", borůvky
v „Ořechy, Tuky & Ostatní".

### 7. Nesmyslná množství a dvojí jednotky

```
sůl              74 g      na týden
pepř             69 g      na týden
borůvky          90 g + 110 ml
javorový sirup   15 ml + 30 g
```

Koření se nemá počítat jako surovina k nákupu (pantry logika existuje, sem
nedosáhla) a položka se dvěma jednotkami se nesečetla.

### 8. Ruční váha neaktualizuje `body_metrics`

Zápis šel do `user_checkins` (61,4 kg), ale `body_metrics.weight_kg` zůstalo
62,00. Kalorický cíl se počítá z registračních metrik, takže hubnutí se do
něj nepromítne — pokud to nedělá jiná úloha. **K prověření, ne tvrzení.**

### 9. Navigační záložky nemají přístupné jméno

V accessibility stromu jsou všechny čtyři záložky jen `button` bez popisku.
Odečítač obrazovky je nepřečte.

### 10. Drobnost: 111 vs 112 g bílkovin

Karta makroživin říká 111 g, TED v odpovědi 112 g. Zaokrouhlení na dvou
místech.
