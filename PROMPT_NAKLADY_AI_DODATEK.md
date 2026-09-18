# Dodatek k PROMPT_NAKLADY_AI.md — oprava dvojího účtování v reportu

Zůstáváš na branchi `feat/openai-naklady-pod-kontrolou`. Necommituj, nepushuj, neotvírej PR.

## Co je špatně

`npm run audit:unit-economics` teď hlásí za 30 dní **$32.05**. Skutečnost je **$19.04**.

Reálná data z `ai_runs` za 30 dní:

| purpose | volání | input_tokens | output_tokens | cost_usd |
|---|---|---|---|---|
| recipe_generation | 743 | 5 567 415 | 512 075 | 19.04 |
| recipe_generator_beh | 65 | 0 | 0 | 13.01 |

`recipe_generator_beh` nejsou jednotlivá volání modelu. Jsou to **souhrnné řádky za celý běh generátoru** — mají nulové tokeny a nesou agregovanou cenu, kterou už jednotlivé řádky `recipe_generation` obsahují. Sečtením obou skupin report započítá tytéž tokeny dvakrát.

View `openai_daily_usage` to řeší správně a vylučuje je:

```sql
FROM ai_runs r WHERE r.purpose IS DISTINCT FROM 'recipe_generator_beh'
UNION ALL SELECT ... FROM ai_logs l
```

`scripts/audit-unit-economics.mjs` stejné vyloučení neaplikuje. Rozpočtová brzda (`assertOpenAIDailyBudget()`) je tedy v pořádku, chybný je jen report. To je přesně ten dvojí součet, který je v `BMON_NAKLADY_OPENAI_2026-09-09.md` popsaný jako opravený 9. 9. — vrátil se.

Tohle není kosmetika. Podle tohoto reportu se rozhoduje, kde se má šetřit; při nadhodnocení o 68 % se optimalizuje špatné místo.

## Co udělat

1. **`scripts/audit-unit-economics.mjs`** — vylučuj `purpose = 'recipe_generator_beh'` ze všech součtů i z rozpadu podle purpose, stejně jako to dělá view. Nejlepší je nespoléhat na to, že si někdo filtr zapamatuje: vyveď seznam „agregačních" purposů do jedné exportované konstanty (např. `export const AGREGACNI_PURPOSY = Object.freeze(['recipe_generator_beh'])`) v `lib/openai.js` a použij ji tady i všude, kde se sčítá cena. Do výstupu přidej jeden řádek, který říká, kolik řádků bylo jako agregační vyloučeno — aby bylo z reportu vidět, že se filtruje, a ne aby to bylo tiché.

2. **Přestaň do `recipe_generator_beh` zapisovat `cost_usd`.** Od `volejModel()` má každé jednotlivé volání vlastní účtenku s tokeny, takže souhrnný řádek už žádnou cenu nést nemusí. Nech ho jako záznam o běhu (počet receptů, trvání, výsledek), ale `cost_usd`, `input_tokens` a `output_tokens` nech NULL. Historické řádky needituj — jen napiš, kolik jich je.

3. **Test**, který tuhle regresi zachytí: unit test nad `audit-unit-economics` logikou, který dostane fixture se dvěma `recipe_generation` řádky a jedním `recipe_generator_beh` řádkem s cenou, a ověří, že součet je jen z prvních dvou. Zařaď do `test:unit`.

4. **Zkontroluj, jestli stejný dvojí součet není ještě někde jinde.** Projdi všechna místa, která sčítají `cost_usd` z `ai_runs` (skripty, API, admin stránky) a u každého napiš, jestli filtr má, nebo ne. Jestli je takových míst víc než dvě, vyveď jeden sdílený helper (`sectiCenuBezAgregaci()`) a použij ho všude.

## Výstup

Napiš:
- opravenou tabulku per purpose za 7 a 30 dní (skutečná čísla po opravě),
- kolik řádků `recipe_generator_beh` v DB nese `cost_usd` (historie),
- seznam všech míst, která sčítají `cost_usd`, a u každého stav filtru,
- výsledek `npm run check` (musí být exit 0),
- co jsi NEudělal a proč.

Nic nemaž bez uvedení v tom seznamu.
