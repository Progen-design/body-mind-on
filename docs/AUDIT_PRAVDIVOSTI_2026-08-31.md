# Audit pravdivosti dat na profilu — 31. 8. 2026

Průchod `https://app.bodyandmindon.cz/profil` v Chrome, účet
`janprikopa@gmail.com`, všechny čtyři záložky. Každé číslo na obrazovce
porovnané se zdrojem v DB. Kontrolováno ve 21:20–21:25.

## Co SEDÍ — ověřeno proti zdroji

Tělesné složení odpovídá `withings_body_snapshots` pro 31. 8. 19:17
**do poslední číslice**:

```
obrazovka        zdroj
105,7 kg         weight_kg 105.7
10,6 %           fat_percent 10.6
11,2 kg          fat_mass_kg 11.2
91,5 kg          muscle_mass_kg 91.5
3,0 kg           bone_mass_kg 3.0
64,3 kg          hydration_kg 64.3
2,4              visceral_fat 2.4
2826 kcal        basal_metabolic_rate 2826
28,1             bmi 28.1
```

Rozdíly „od minula" taky sedí: předchozí měření 30. 8. 22:43 mělo
12,4 % tuku a 88,1 kg svalů → −1,8 % a +3,4 kg. Správně spočítané.

Ostatní ověřené údaje:

- věk 38, výška 194 cm, člen od 3. 8. 2026 (registrace 2. 8. 22:50 UTC
  = 3. 8. 00:50 v Praze — po opravě 6.6 sedí i tohle);
- HRV 11,9 ms = `apple_health_daily` 31. 8.; základna 32,7 ms je průměr
  předchozích sedmi dnů (32,74) — správně;
- klidový tep „—" a spánek „—" jsou v datech opravdu `null`. Poctivé;
- „Server naposled stahoval před 1 h 18 min" — `withings_connections
  .last_sync_at` 20:03, stránka načtená 21:21. Sedí;
- „Poslední odeslání před 21 min" — Apple Health 21:00. Sedí;
- dnešní trénink: pondělí, Trénink B, 5 cviků, 60 min — odpovídá plánu;
- „Splněno 1 z 3 jednotek", pátek ✓ — v `daily_activity_completions`
  je `plan_day=1, activity_key='plan_day'` odškrtnuté 30. 8. ve 23:37;
- nákupní seznam „zbývá 72 z 72" — nic není odškrtnuté;
- nářadí v plánu (kladka, stroj, velká činka) odpovídá
  `Kde cvičí: Posilovna` v `body_metrics.notes`.

**Appka tedy nevymýšlí čísla.** Co ukazuje z Withings a Apple Health,
to tam opravdu je.

## Co NESEDÍ

### 1. Denní cíl 2634 kcal, ale jídelníček je postavený na 2164

```
profil ukazuje            cíl 2 634 kcal
aktivní plán (27.8.–2.9.) daily_calories 2164
5 jídel na dnešek         2151 kcal celkem
```

Uživatel může sníst **celý** denní plán a pořád je 480 kcal pod cílem,
který mu appka sama nastavila. Plán vznikl před opravou výšky (6.5) na
starý cíl a nikdo ho nepřegeneroval.

Watchdog to hlásí sám: `calorie_target_mismatch`, dva účty
(`janprikopa@gmail.com`, `janprikopa+t6@gmail.com`). Alert existuje,
funguje a nikdo ho nečte.

### 2. Makra na obrazovce nejsou makra v databázi

```
uloženo v body_metrics    189 B / 285 S / 82 T
profil ukazuje            191 B / 283 S / 82 T
dnešní jídla dohromady    163 B / 147 S / 106 T
```

UI si gramy dopočítává z procent (29/43/28 %), místo aby ukázalo uloženou
hodnotu. Rozdíl jsou dva gramy — jenže to znamená, že **žádná obrazovka
neukazuje číslo, se kterým se plán skládá**. A skutečný obsah dnešního
jídelníčku je od obou vzdálený o 136 g sacharidů.

### 3. Přehled ukazuje 3 z 5 jídel pod nadpisem „Všechna jídla"

`OverviewBentoGrid.tsx:304`: `meals.slice(0, 3)`. Na kartě je vidět
436 + 604 + 298 = 1338 kcal proti cíli 2634. Chybí odpolední svačina
(305 kcal) a večeře (508 kcal). Na záložce Jídelníček je všech pět.

Není to ztráta dat, je to nadpis, který lže o tom, co je pod ním.

### 4. Historie BMI není srovnatelná sama se sebou

Withings počítá BMI z výšky, kterou má nastavenou. Do 30. 8. to bylo
182 cm, od 31. 8. správných 194:

```
30. 8.  104,8 kg  BMI 31,6
31. 8.  105,7 kg  BMI 28,1
```

Váha stoupla, BMI spadlo o 3,5 bodu. Každý graf BMI přes čas ukáže
zlepšení, které se nestalo. Týká se to všech 44 měření před 31. 8.

### 5. Karta Withings říká připojenému uživateli, ať se připojí

`WithingsCard.tsx:79` — odstavec „Propojte svou chytrou váhu Withings pro
automatickou synchronizaci…" se vykresluje **bez podmínky**, hned pod
odznakem „Online" a pod řádkem „Poslední úspěšná synchronizace: před
1 h 22 min". Odznak i status po opravě 6.2 chodí z dat správně, tenhle
odstavec ne.

### 6. „+3,4 kg svalové hmoty" za 21 hodin jako fakt

Mezi 30. 8. 22:43 a 31. 8. 19:17 appka hlásí +3,4 kg svalů a −1,8 %
tuku. Za den. To není měření, to je šum impedance — v historii kolísá
svalová hmota mezi 81,3 a 92 kg podle toho, jak byl člověk hydratovaný.

Appka to podává bez jediné výhrady jako naměřený pokrok. U produktu,
který má člověka vést, je tohle horší než chybějící údaj.

### 7. Doporučený příjem je pod bazálním metabolismem

Na jednom profilu vedle sebe:

```
Bazální metabolismus (Withings)   2826 kcal
Denní cíl                         2634 kcal
```

Appka doporučuje jíst o 190 kcal míň, než kolik podle ní samé tělo spálí
v klidu. Withingsový BMR je nadsazený (počítá ho z těch 91,5 kg svalů;
Mifflin–St Jeor dá pro 105,7 kg / 194 cm / 38 let asi 2085 kcal), ale
appka obě čísla ukazuje jako fakt a nikde je nesrovná.

### 8. Nákupní seznam

- **kuřecí prsa třikrát pod třemi názvy**: „kuřecí prsa 430 g",
  „kuřecí prso 325 g", „grilovaná kuřecí prsa 170 g" — dohromady 925 g
  rozsypaných do tří řádků;
- **nenakupitelné položky**: „zelenina 835 g", „čerstvé ovoce 220 g";
- **kategorie**: broskev, jahody, ananas, borůvky, hroznové víno,
  brusinky, ostružiny, fíky, tofu, tempeh, čočka, edamame i celozrnný
  toast leží v „Ořechy, Tuky & Ostatní"; chilli vločky v „Přílohy & Pečivo";
- **sůl 52 g a pepř 46 g** na týden;
- **dvě jednotky u jedné položky**: „vejce 3 kusy + 55 g",
  „banán 415 g + 1 kus", „citronová šťáva 20 ml + 5 g".

### 9. Cviky z etapy 6.3 nemají ukázku provedení

Watchdog `cvik_v_planu_bez_media`: `dumbbell_romanian_deadlift`,
`dumbbell_row`. To jsou přesně ty cviky, které jsme přidali v 6.3, aby
domácí prostředí nedostávalo velkou činku. Mají tlačítko „Jak na to",
ale není za ním obrázek.

## Závěr

Data z měřicích zařízení jsou v pořádku — appka je přenáší přesně.
Problém je jinde: **appka si protiřečí sama se sebou.** Cíl 2634 vs.
plán 2164, makra 191 vs. 189 vs. 163, BMI srovnávané přes dvě různé
výšky, doporučený příjem pod bazálem, „Připojte váhu" u připojené váhy.

Kdyby to dnes četl platící zákazník, nenachytá appku na vymyšleném
čísle. Nachytá ji na tom, že každá obrazovka říká něco jiného.
