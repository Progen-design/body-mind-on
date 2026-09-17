# Zadání: úklid brány kvality (blok 1)

Datum: 2026-09-17
Předchozí zadání `PROMPT_PRO_CODE.md` (kalorická vrstva) **zůstává platné a nedokončené**.
Tohle je jiný, oddělený kus práce — udělá se na `main`, ne na kalorické větvi.

Kontext: projekt ještě není spuštěný, běží v testu. Je to nejlepší možná chvíle na úklid —
žádní reální uživatelé, nic se nerozbije pod rukama.

---

## Proč to děláme

Audit ze 17. 9. (`claude/BMON_AUDIT_CELEHO_SYSTEMU_2026-09-17.md`) zjistil dvě věci:

1. **CI pouští pět věcí** — `test:unit`, `test:health`, `test:src`, `lint:ci`, `lint:copy`.
   Ani jeden ze **71 verify skriptů** neběží v CI a neblokuje merge. Přitom je v nich
   uložená veškerá doménová znalost projektu. Důsledek: `verify-start-calorie-consistency`
   měl na `main` **61 chyb** a nikdo o tom nevěděl.
2. **`_legacy-next/` je 97 souborů mrtvého kódu.** Není ve Vite buildu, neimportuje ho
   `src/`, `api/` ani `lib/` — jediná zmínka v živém kódu je komentář
   v `src/components/TrialPaywallCard.tsx:26`. Poslední změna 24. 8. 2026 v commitu
   „Bez Next.js". **A míří do něj 26 ze 71 verify skriptů**, některé zeleně.

Z 26 padajících skriptů je po ručním přezkoumání jen **2 skutečné vady**. Zbytek je šum,
který přebíjí signál.

---

## Blok 0 — Nejdřív zachránit rozdělanou práci

Na větvi `feat/vysokokaloricke-porce` máš nekomitnutou práci (kaloricky vědomý scheduler,
horní pojistka v add-loopu, nový coverage gate, migrace se třemi recepty). **Nesmí se
ztratit.**

Zacommituj ji na tu větev jako WIP (zprávu si zvol sám, ať je popisná), pushni větev,
a teprve pak přepni na `main`. Nemerguj ji — pořád čeká na dodělání a na moje ověření.

---

## Blok 1 — Smazat `_legacy-next/`

1. Ověř si sám, že je opravdu mrtvý: že se nevyskytuje ve `vite.config.*`, `package.json`
   (kromě verify skriptů), ani jako import kdekoli v `src/`, `api/`, `lib/`. Když najdeš
   živou referenci, **zastav se a řekni to** — neodstraňuj nic, co se používá.
2. Komentář v `TrialPaywallCard.tsx:26` přepiš tak, aby popisoval, co komponenta dělá,
   ne odkud pochází.
3. `git rm -r _legacy-next`.
4. Přidej [Knip](https://knip.dev/) jako dev závislost, nakonfiguruj ho pro Vite + Node
   API funkce a přidej skript `npm run lint:dead`. Pusť ho a **nahlas, co našel** —
   nemaž nic dalšího sám, jen předlož seznam. Nepoužité závislosti v `package.json`
   ale smaž rovnou, ty jsou bezpečné.

---

## Blok 2 — Roztřídit 71 verify skriptů

Projdi všech 71 a zařaď každý do jedné ze tří skupin. Výsledek zapiš do
`docs/BRANY_KVALITY.md` jako tabulku: skript, skupina, důvod jednou větou, vlastník.

**Skupina A — do CI.** Podmínky: hlídá pravidlo, které nesmí padnout; běží bez sítě, bez
`service_role` a bez browseru; je **teď zelený**. Odhadem 10–12 skriptů. Kandidáti podle
mého běhu: `db-schema-contract`, `start-templates-catalog`, `dietary-exclusions`,
`macro-kcal-consistency`, `plan-quality-invariants`, `meal-replacement-actions`,
`stripe-tier-mapping`, `footer-legal-links`, `weekly-structured-source`,
`exercise-integrity`, `start-meals-library-only`, `recipe-from-catalog`.

Zelený v okamžiku zapnutí je tvrdá podmínka. Skript, který smí být červený, je zase jen
šum — do CI nepatří, patří do skupiny B.

**Skupina B — ruční audit.** Potřebuje `service_role`, síť nebo lidské rozhodnutí:
`varianty-cviku`, `audit:*`, `report:*`, `plan-meals`. Nechat mimo CI, ale do
`docs/BRANY_KVALITY.md` napsat, kdo je pouští a jak často.

**Skupina C — smazat.** Všechno, co míří do `_legacy-next/`, na neexistující migrace nebo
na `next.config.js`. Nepřepisovat „někdy" — buď se to přepíše v tomhle PR, nebo pryč.
Smazání skriptu je v pořádku; skript, který nic nehlídá, je horší než žádný.

Zvlášť pozor na tyhle, u nich znám důvod pádu a jsou to zastaralé skripty, ne vady:

- `agent-simple-meals` — čeká 4 jídla/den, kód počítá z kalorického pásma (2400 → 5)
- `ai-instructions` — čeká `PROMPT_VERSION = 9`, v kódu je 10
- `product-consistency` — hledá hardcoded cenu, ta je teď v `lib/pricing.ts`
- `profile-today-ux`, `profile-weekly-days-modern-ui`, `profile-real-user-bugfixes`,
  `profile-layout-focus`, `profile-macro-chart`, `profile-kcal-consistency` — všechny
  grepují CSS třídy a JSX literály, které nepřežily přepis profilu na Tailwind
- `birthdate-persistence` — validace byla vytažena do
  `lib/registration/registrationStepValidation.js`, skript hledá starý literál
- `gluten-free-gate` — drift-guard hlídá `original || name || text`, které bylo záměrně
  zahozeno
- `exercise-assets` — očekávaná cesta importu má o úroveň méně
- `simple-start-meals` — hlídá starý kontrakt vymyšlených maker, fallback teď bere
  reálná makra z katalogu
- `withings-visibility`, `withings-profile-visibility` — kontrolují `_legacy-next`
- `ui-visual-system`, `withings-widget-ux` — Playwright E2E, které startují neexistující
  `npm run start` a čekají na `__NEXT_DATA__`; v Vite SPA nikdy neprojdou

**Zásada pro skupinu C:** když skript hlídal něco smysluplného, přepiš ho na **chování,
ne na markup**. Ne „existuje třída `profile-today-recipe-btn`", ale „na kartě jídla je
prvek, který otevře detail receptu". Selektor se změní, chování ne.

---

## Blok 3 — Sjednotit `check` s CI

Dnes `npm run check` pouští jinou sadu než `.github/workflows/tests.yml` (`check` má
navíc `test:adaptery` a `build`, chybí mu `test:src`). Musí to být **jedna definice**:
`check` ať je přesně to, co běží v CI, a CI ať volá `npm run check`.

Do téhož běhu přidej skupinu A z bloku 2 a `lint:dead` z bloku 1.

---

## Blok 4 — Tři rychlé vady z auditu

1. **`.env.local` má `STRIPE_SECRET_KEY=""`** (prázdný řetězec), takže `verify:paid-path`
   umře v preflightu a netestuje nic. Platný `sk_test_` klíč je v `.env.production.local`,
   který loader nečte. **Klíče nekopíruj ani nevypisuj** — jen uprav
   `loadLocalEnv()` v `scripts/audit-utils.mjs` tak, aby prázdnou hodnotu nebral jako
   nastavenou a spadl na další soubor v pořadí. Do zprávy napiš, co má Honza doplnit.
2. **Withings a Apple Health se zobrazují všem.** Kontrakt v
   `lib/withingsProfileVisibility.js` říká „volitelný modul, defaultně skrytý".
   `shouldShowWithingsSection` se v celém `src/` nevyskytuje — podmínka zůstala jen
   v `_legacy-next`. Ověřeno na datech: Smoke Test má `devices = null` a
   `wants_body_tracking = 'false'` a modul přesto vidí. Přenes tu podmínku do živé
   aplikace (`src/`) — na záložku „Regenerace & Spánek" i na blok „Propojená chytrá
   zařízení" na Dnes. Přidej test.
3. **`verify:start-checkout-preview` a `verify:workout-restore` zakládají účty
   v produkci** a neuklízejí po sobě. Doplň jim úklid na konci běhu (smazat, co
   založily), nebo je označ tak, aby se nepouštěly bez preview prostředí. **Nemaž
   existující účty** — jen zajisti, aby další běh po sobě uklidil.

---

## Co musí platit, než to nahlásíš

- `npm run check` zelený, a je totožný s tím, co dělá CI
- `npm run lint:dead` proběhne a jeho nález je vypsaný ve zprávě
- `docs/BRANY_KVALITY.md` existuje a má všech 71 skriptů zařazených
- `test:unit`, `test:src`, typecheck, lint, lint:copy, build zelené
- Ve zprávě: kolik skriptů šlo do A, kolik do B, kolik se smazalo, a kolik souborů
  a řádků ubylo s `_legacy-next`

---

## Pravidla

- **Nekomituj do `main`, neotvírej PR, nepouštěj migrace, neměř produkci.** Pracuj na
  větvi, nahlas a čekej.
- Blok 0 je výjimka: rozdělanou kalorickou práci zacommituj a pushni na její vlastní
  větev, ať se neztratí.
- Když najdeš živou referenci na `_legacy-next/`, zastav se a řekni to. Radši spor než
  tiché smazání něčeho, co běží.
- Dělej to po blocích (0 → 1 → 2 → 3 → 4) a po každém si nech doběhnout `check`.
