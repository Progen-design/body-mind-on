# Zadání: dostat spotřebu OpenAI pod kontrolu

Datum: 2026-09-17
Samostatný kus práce. `PROMPT_PRO_CODE.md` (kalorická vrstva) a `PROMPT_UKLID.md`
(úklid bran) zůstávají platné — tohle je třetí, nezávislý blok. Dělá se na vlastní větvi.

---

## Změřený stav

OpenAI dashboard, posledních 30 dní:

```
Total Spend      $73,18
Total tokens     34 888 694
Total requests   2 292
```

Z toho průměr **15 222 tokenů na požadavek** a **$2,10 za milion tokenů** — to je
cenová hladina `gpt-4o`, ne `gpt-4.1-mini`.

Co o tom ví náš systém (`openai_daily_usage`, stejné okno):

```
Zaznamenáno     $19,12
Požadavků          782
```

**Nevidíme $54 z $73 (74 %) a 1 510 požadavků z 2 292 (66 %).**

Kontrola po dnech ukazuje, proč: `spent_usd` se každý den **přesně rovná** útratě
generátoru receptů. Měření nevidí nic jiného — ani TEDa, ani překlady, ani generování
plánů, ani odhady doby přípravy.

## Příčina

Účtování je rozeseté po volajících, ne u klienta:

- `recordOpenAIUsage()` volají **dva** soubory: `lib/aiOps.js` a `lib/runAgent.js`
- klienta z `lib/openai.js` importuje **26 souborů**
- `lib/recipeGeneratorRun.js:295` si dokonce vyrábí **vlastního klienta**
  (`new OpenAI({ apiKey: ... })`) a `lib/openai.js` úplně obchází

Dokud se dá zavolat model bez zaúčtování, vždycky někde bude díra. Tohle zadání ji
zavírá jednou provždy tím, že **zaúčtování udělá nemožným obejít**.

---

## A. Jeden instrumentovaný klient

V `lib/openai.js` postav obal, přes který teče **každé** volání modelu. Nesmí jít
zavolat bez `purpose`.

Návrh rozhraní (uprav, když najdeš lepší, ale drž princip):

```js
// purpose je povinný — bez něj to hodí chybu ještě před voláním modelu
await volejModel({ purpose: 'recipe_generation', model, messages, ... })
```

Obal musí po každém volání (i po tom, které skončí chybou nebo timeoutem):

1. spočítat cenu z `usage.prompt_tokens` / `usage.completion_tokens` a sazeb daného
   modelu — sazby drž v jedné tabulce, ne rozeseté po kódu
2. zapsat řádek do `ai_runs` s `purpose`, modelem, tokeny, cenou a případnou chybou
3. zavolat `recordOpenAIUsage()`, ať `openai_daily_usage` sedí

**Cachnuté odpovědi** (`openai_response_cache`) se zapíšou taky, ale s nulovou cenou
a příznakem, že šlo o cache — jinak se nepozná, že cache něco ušetřila.

## B. Převést všech 26 volajících

Projdi je a přepiš na obal z bodu A. Včetně `lib/recipeGeneratorRun.js`, který si dnes
dělá vlastního klienta.

Každému dej **výstižný `purpose`** — ne `other`. Podle toho se bude rozhodovat, kde
šetřit, takže rozlišuj alespoň: generování receptů, překlad receptů, překlad cviků,
doplnění postupu receptu, odhad doby přípravy, generování plánu, obohacení plánu,
varianty cviků, TED / kouč, ostatní agenti.

Tenhle krok je nudný a je na něm celá hodnota zadání — nic nesmí zůstat mimo.

## C. Brána, aby se to nevrátilo

Nový skript `scripts/verify-openai-uctovani.mjs`, který **padne**, když kdekoli
v `api/` nebo `lib/` (mimo `lib/openai.js`):

- je `new OpenAI(`
- je `import OpenAI from 'openai'` nebo `from 'openai'`
- je `openai.chat.completions.create(` nebo přímé volání `api.openai.com`

Přidej ho do `package.json` a do `npm run check`. Bez téhle brány se za měsíc objeví
27. volající a jsme zpátky.

## D. Rozpočtová brzda na jednom místě

`assertOpenAIDailyBudget()` dnes hlídá jen `runAgent()`. Přesuň ji do obalu z bodu A,
ať platí na všechno.

**Strop zatím neměň** a hlavně ho nenastavuj podle dnešní hodnoty. Dnešní $3/den by při
skutečné útrate $2,44/den ($73,18 / 30) sepnul skoro každý den. Napiš do zprávy, jaká
hodnota by dávala smysl, a nech rozhodnutí na mně — až budou čísla z bodu A.

## E. Překladový cron z 5 minut na hodinu

`vercel.json`, `api/cron/translate-recipes`: dnes `*/5 * * * *`, tedy 288 běhů denně,
8 640 měsíčně. Fronta je přitom **prázdná** — 0 receptů a 0 cviků čeká na překlad a za
posledních 24 hodin se nezměnil ani jeden záznam. Změň na `0 * * * *`.

Když narazíš na důvod, proč to musí být po pěti minutách, **řekni to** místo změny.

## F. Přehled, který dává smysl

Rozšiř `npm run audit:unit-economics` (nebo přidej nový skript, když se tam nehodí)
o rozpad za 7 a 30 dní: `purpose`, počet volání, tokeny, cena, průměrná cena za volání
a podíl na celku. Seřaď podle ceny.

Tohle je výstup, podle kterého se bude rozhodovat, takže ať je čitelný v terminálu.

---

## Jak se pozná, že to je hotové

Po nasazení a jednom dni provozu musí **`openai_daily_usage` za ten den sedět
s dashboardem OpenAI v řádu jednotek procent**. Dokud nesedí, něco je pořád mimo obal.

Do zprávy napiš:

- kolik volajících jsi převedl a jaké `purpose` jsi zavedl
- které soubory měly vlastního klienta
- jestli jsi narazil na volání, které se zaúčtovat nedá, a proč
- výstup nového přehledu z bodu F na aktuálních datech
- `verify-openai-uctovani`, `test:unit`, `test:src`, typecheck, lint, lint:copy, build

## Pravidla

- **Nekomituj, neotvírej PR, neměň env proměnné, neměř produkci.** Nahlas a čekej.
- Neměň modely ani prompty kvůli ceně. Nejdřív chceme vidět, kam peníze tečou.
  Levnější model, který vyrobí nepoužitelný výstup, není úspora.
- `gpt-4o` u generátoru receptů nech být — volba je v kódu zdůvodněná.
