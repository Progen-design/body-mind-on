# Deset nezávislých registrací na produkci — 31. 8. 2026

Deset různých lidí, deset různých kombinací. Účty
`janprikopa+r01..r10@gmail.com`, heslo `BmonTest2026!`.

Šlo to ostrou registrační cestou `POST /api/body-metrics` — tedy tím samým
jediným požadavkem, který posílá formulář v prohlížeči (`StartRegistrace.tsx`
ř. 171). Klientskou část jsem ověřil zvlášť průchodem UI 29. 8.
(`docs/TEST_UI_REGISTRACE_2026-08-31.md`); deset průchodů klikáním by stálo
násobek a testovalo by potřetí totéž.

## Výsledek: 10 z 10 prošlo

Každý účet dostal členství `trial/START`, tělesné metriky, plán na 7 dní
a e-mail. Trvání 27–33 s, žádný timeout, žádná chyba.

```
        pohlaví  věk  tělo         cíl            dieta          kcal   jídel
r01     muž      41   178 / 92     redukce        —              2162   35
r02     žena     28   162 / 54     nárůst svalů   vegetarián     2182   35
r03     muž      53   185 / 110    redukce        bez lepku      2780   35
r04     žena     36   170 / 78     udržování      bez laktózy    2340   35
r05     muž      22   190 / 75     nárůst svalů   nízkosach.     2908   35
r06     žena     61   158 / 68     redukce        —              1524   28
r07     muž      33   183 / 88     udržování      jiné           2640   35
r08     žena     37   167 / 95     redukce        vegetarián     2242   35
r09     muž      47   176 / 101    nárůst svalů   —              3807   42
r10     žena     24   174 / 61     udržování      nízkosach.     1830   35
```

Počet jídel se škáluje s kalorickým cílem: 28 při 1524 kcal, 35 u většiny,
42 při 3807 kcal. Kalorické cíle odpovídají pohlaví, věku, hmotnosti,
aktivitě i cíli — žádná hodnota nevybočuje.

## Opakování receptů: čisté u všech deseti

```
žádný recept dvakrát v jednom dni     0 / 10 účtů
nejčastější recept za týden           1× nebo 2×
různých receptů v týdnu               21–35
```

Nález z 3. 8. („vejce 6 ze 7 dní, jednou dvakrát v jednom dni") se
nepotvrdil ani jednou.

## Dietní brány drží

**Vegetariáni (r02, r08): nula masitých jídel.** Kontrolováno na názvy
kuře / krůta / hovězí / vepřové / losos / tuňák / krevety / šunka / klobása /
slanina / ryba napříč celým týdnem.

**Bez laktózy (r04): nula mléčných surovin** — ověřeno na úrovni ingrediencí,
ne štítků. Včetně másla, tedy oprava z etapy 6.1 drží i na čerstvém účtu.

**Bez lepku (r03): nula lepkových surovin.** Pro kontrolu opačným směrem:
r03 mléčné výrobky má (správně, není bezlaktózový) a r04 má lepek (správně,
není bezlepkový). Brány se tedy nepřekrývají ani nezapínají zbytečně.

## Jediný nález

**Neznámé klíče návyků server tiše zahodí.** Poslal jsem
`selected_habits: ['zdrava_strava','kvalitni_spanek']`; skutečné klíče jsou
anglické (`healthy_diet`, `quality_sleep`, `hydration`, …). Registrace prošla
bez chyby a `user_habits` zůstalo prázdné u všech deseti.

Uživatele přes formulář se to netýká — ten posílá správné klíče (ověřeno
u účtu t6, který má tři návyky). Ale klient s překlepem nebo starší verze
formuláře by uživateli mlčky snědla celý pátý krok registrace. Server má
neznámý klíč odmítnout, ne ignorovat.
