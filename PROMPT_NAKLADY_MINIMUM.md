# OpenAI náklady na minimum — všechny funkce musí dál fungovat

Založ větev `feat/naklady-minimum` z aktuálního `main`. Necommituj, nepushuj,
neotvírej PR, migrace nepouštěj. Na `feat/dnes-hero` nesahej.

## Změřeno 21. 9. (produkční DB, ne odhad)

| co | volání / 30 dní | cena / 30 dní |
|---|---|---|
| generátor receptů (`recipe_generation`, **gpt-4o**) | 743 | **$19.04** |
| TED + coach + trainer + onboarding (`ai_logs`) | 134 | **$0.04** |

- 99 % útraty BMON je **generátor receptů**. TED stojí haléře.
- Generátor: ~6 400 vstupních a ~700 výstupních tokenů na volání, ~$0,023 za volání,
  cron `15 3,11,19 * * *` (3× denně).
- **Fronta: 63 done, 106 failed, 67 nadbytečná, 20 pending.** Víc objednávek spadne
  („model vrátil dávku, ale žádný recept neprošel validací") než projde — za tokeny
  těch 106 se platilo a nevzniklo nic.
- Katalog už má **1 202 receptů** (635 od generátoru, 360 Spoonacular, 153 coach seed,
  30 meal_cache, 24 simple_start). Před spuštěním s pár testovacími uživateli není
  důvod ho doplňovat 3× denně.

## Cíl

Útrata BMON za OpenAI **≤ $3 / měsíc** v předspouštěcí fázi, bez ztráty funkce: TED
odpovídá, záměna jídla funguje, plány se generují, generátor jde spustit, když je potřeba.

## Co udělat

### 1. Generátor: levnější model, měřitelně
- `RECIPE_GEN_MODEL` (`lib/recipeGenerator.js`) z `gpt-4o` na **`gpt-4.1-mini`**
  (sazba v `lib/openai.js` je $0.40/$1.60 za 1M proti $2.50/$10 — ~6× levnější).
- Model čitelný z env `RECIPE_GEN_MODEL` s tímhle defaultem, ať jde vrátit bez deploye.
- Do diagnostického řádku `recipe_generation_vysledek` přidej `model` — ať jde po
  týdnu spočítat **úspěšnost validace podle modelu** (vraceno vs. zapsáno). Když mini
  výrazně padá víc než 4o, je to nález, ne důvod potichu vrátit 4o.
- `DOPLNENI_MODEL` (`lib/plan/doplneniPostupuReceptu.js`) z `gpt-4o` na `gpt-4.1-mini`
  stejným způsobem — doplňování postupů je jednoduchá úloha.

### 2. Generátor: přestat platit za neúspěch
- Maximální počet pokusů na položku fronty (návrh: 2). Po vyčerpání → `failed` a
  **už se nebere znovu** automaticky. Zjisti, jestli dnes `failed` položky znovu
  nevstupují do běhu — pokud ano, je to hlavní díra.
- Než se pošle dávka do modelu, zkontroluj, jestli slot pořád potřebuje recept
  (poptávka se mezitím mohla naplnit) — `nadbytecna` už ve frontě existuje, ověř,
  že se kontroluje **před** voláním modelu, ne po.
- Z 106 failed vytáhni rozpad důvodů zahození (`zahozeno_*` v `result`) a napiš mi,
  co nejčastěji padá. Neopravuj validaci naslepo — jen nález.

### 3. Generátor: jen když je potřeba
- Cron `generate-recipes` z 3× denně na **1× týdně** (neděle v noci), a to jen když
  jsou ve frontě `pending` položky s reálnou poptávkou (existující uživatel s dietou,
  pro kterou chybí recepty). Prázdná poptávka = běh skončí bez volání modelu.
- Ruční spuštění musí zůstat (npm skript nebo admin endpoint, co už existuje).

### 4. Prompt caching — TEĎ NEDĚLAT
Odloženo kvůli šetření limitu. Po bodech 1–3 a 5 bude generátor stát pár centů
týdně, caching by ušetřil zlomek z toho. Vrátíme se k tomu po spuštění.

### 5. Pojistka
- Výchozí denní strop `DEFAULT_DAILY_BUDGET_USD` v `lib/openai.js` ze $3 na **$0.50**.
  Strop nesmí zablokovat TEDa: když je rozpočet vyčerpaný generátorem, TED a
  uživatelské akce mají přednost — generátor se zastaví první. Pokud to dnes tak
  není, oddělte rozpočet `batch` (generátor, překlady, doplňování) od `interaktivní`
  (TED, záměna jídla, plán).

## Co NEMĚNIT

- TED (`coach_chat`), záměnu jídla, tvorbu plánu — jsou levné a uživatel je vidí.
  Model TEDa nech (`gpt-4o-mini`).
- Validaci receptů (makra, Atwater, bílkoviny) — nešetřit na kvalitě.
- `feat/dnes-hero`.

## Šetři limit

Pracuj úsporně: čti jen soubory, které potřebuješ, žádný celoprojektový audit.
`npm run check` pusť **jednou na konci**, ne po každé změně. Pokud něco není jasné,
zeptej se jednou větou, nezkoumej to do hloubky.

## Ověření a výstup

`npm run check` exit 0. Napiš:
- odhad útraty za měsíc před / po, s výpočtem (volání × tokeny × sazba),
- rozpad 106 failed podle důvodu,
- jestli failed položky dnes znovu vstupovaly do běhů (ano/ne + kde),
- co jsi NEudělal a proč, název migrace, pokud vznikla.
