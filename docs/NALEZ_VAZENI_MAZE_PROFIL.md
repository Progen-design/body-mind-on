# Zápis váhy smaže část profilu — nález 29. 8. 2026

Nejzávažnější věc z celého dnešního průchodu. Spouští ji úplně běžná akce:
uživatel se zváží.

## Důkaz

Účet `janprikopa+t6@gmail.com`. Registrace v 01:54, ruční zápis váhy
61,4 kg přes tlačítko „Nové vážení" v 02:07. V `body_metrics` jsou po
tom **dva řádky** — starý se nepřepsal, vznikl nový:

```
vzniklo               váha    workout_days  diet_type    protein_g  kalorie
2026-08-29 01:54:47   62.00   1,3,5         vegetarian   112        1436
2026-08-29 02:07:36   61.40   NULL          NULL         NULL       1537
```

Novější řádek přišel o:

- **`diet_type`** — z `vegetarian` na `NULL`
- **`workout_days`** — z `1,3,5` na `NULL`
- **`protein_target_g`** — ze 112 na `NULL`

a `calories_target` **vyskočil z 1436 na 1537**, přestože uživatelka zhubla.
Při redukci má cíl klesat, ne růst o sto kalorií.

## Proč je to vážné

Generátor plánu čte poslední řádek `body_metrics`. Příští týdenní plán téhle
uživatelky se tedy vyrobí **bez vegetariánské diety, bez tréninkových dnů
a s vyšším kalorickým cílem**.

Vegetariánka, která si stoupne na váhu, přijde o vegetariánství. Celý dnešek
jsme opravovali dietní bránu — a tohle ji obejde tím, že dietu smaže.

Ostatní účty mají po jednom řádku, protože u nich vážení nikdo nezkoušel.
Není to tedy okrajový případ, jen ho zatím nikdo nespustil.

## Co ověřit před opravou

1. Kde vzniká ten druhý řádek — endpoint za tlačítkem „Nové vážení"
   (`POST` z `handleZapisVahy` v `src/App.tsx`) a co posílá.
2. Jestli je `insert` místo `update` záměr (historie měření) nebo chyba.
   Pokud záměr, musí nový řádek **zdědit všechna pole**, ne jen váhu.
3. Odkud se vzal cíl 1537 kcal. Přepočet při nižší váze má dát nižší číslo;
   podezření padá na chybějící `goal`/`diet_type` v tom novém řádku.
4. Jestli totéž dělá i synchronizace z Withings, nebo jen ruční zápis.

Teprve pak psát kód. Je to datová cesta, ne UI.
