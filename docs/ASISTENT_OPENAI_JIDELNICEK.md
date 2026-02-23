# Asistent OpenAI – jídelníček (JSON výstup)

Tento dokument popisuje **aktuální implementaci** asistenta v `lib/generatePlan.js`, který sestavuje plán a vrací JSON s `bmr`, `tdee`, `calories`, `protein_g`, `html` atd. Aplikace parsuje plán v `PlanViewer.js` (nákupní seznam, mindset).

**Viz také:** `docs/OPENAI_ASSISTANT_ANALYZA.md` – kompletní rozbor napojení.

---

## 1. Implementováno (únor 2025)

- **Formát odpovědi:** `{"ok":true,"metrics":{...},"html":"..."}` – JSON výstup, parsování v `extractJsonFromAiOutput()`
- **VSTUP:** `diet_type`, `preferences` – absolutní filtr
- **DIET_TYPE:** standard | vegetarian | vegan – včetně med, želatina pro vegan
- **PREFERENCES:** nikdy nezařazuj zakázané potraviny, makra neměň
- **Makra:** přesně dle výpočtů, kalorie zaokrouhlené na 50 kcal
- **Suplementace:** povinný blok dle diet_type (D3, Omega 3, B12 u veg, DHA/EPA z řas u vegan)
- **Kontrola před odesláním:** `planViolatesDiet()` – při porušení přegenerování

---

## 2. HTML sekce (povinné pro aplikaci)

Aplikace parsuje z `html` sekce **Nákupní seznam na týden** a **Mindset na tento týden**. Bez nich se v profilu nezobrazí odpovídající bloky (nebo jen fallback ze receptů).

Do HTML výstupu **přidej tyto dvě sekce** (stejná struktura jako v hlavním plánu v `lib/generatePlan.js`):

### Nákupní seznam na týden

- Nadpis: přesně **„Nákupní seznam na týden“** (nebo text obsahující „Nákupní seznam“).
- Formát: jeden sloučený seznam surovin pro všechny recepty v týdnu.
- HTML: `<h3>Nákupní seznam na týden</h3><ul><li>položka 1</li><li>položka 2</li></ul>`.
- Položky s množstvím, pokud dává smysl (např. 200 g rýže, 1 cibule). Běžné věci (sůl, olej) na konci. Bez zbytečných duplicit.

### Mindset na tento týden

- Nadpis: přesně **„Mindset na tento týden“** (aplikace hledá tento text).
- Obsah: jedna krátká motivační nebo zklidňující věta (1–2 věty). Téma: odpočinek, trpělivost, malé kroky, tělo a mysl.
- HTML: `<h3>Mindset na tento týden</h3><p>Jedna věta zde.</p>`.

**Pořadí v HTML:** Obojí může být např. za jídelníčkem a před Tréninkem / Suplementací, nebo za Recepty. Důležité je, aby v `html` byly oba bloky – aplikace je vyhledá podle `<h3>`.

---

## 3. Volitelné rozšíření JSON (pro budoucí použití)

Pokud bude aplikace brát plán z tohoto asistenta (ne z hlavního HTML generátoru), můžeš do JSON přidat:

- **`mindset_tip`** (string) – jedna motivační věta (stejný obsah jako v `<h3>Mindset na tento týden</h3><p>...</p>`).
- **`shopping_list`** (array of strings) – seznam položek nákupního seznamu, např. `["200 g rýže", "1 cibule", ...]`.

Pak aplikace nemusí parsovat HTML a může zobrazit bloky přímo z JSON. V současné verzi se ale plán generuje v `lib/generatePlan.js` a ukládá se `plan_html` z něj; tento JSON asistent je tedy spíš pro jiný kanál nebo budoucí sjednocení.

---

## 4. SYS prompt

Kompletní prompt je v **`lib/generatePlan.js`** – konstanta `SYS`. Zahrnuje:
- JSON výstup s metrics (bmr, tdee, calories, protein_g, carbs_g, fat_g)
- DIET_TYPE pravidla (včetně med, želatina pro vegan)
- Suplementace dle diet_type
- HTML struktura bez Receptů (stručné jídelníček 7 dní)

---

## 5. Shrnutí změn oproti původnímu promptu

| Co | Původně | Upraveno |
|----|--------|----------|
| HTML sekce | 1–5 (makra, jídelníček, trénink, suplementace, mindset) | + **6. Nákupní seznam na týden** (konkrétní `<h3>` + `<ul><li>`) |
| | | + **7. Mindset na tento týden** (konkrétní `<h3>` + `<p>`) – jedna věta pro UI |
| JSON | pouze ok, metrics, html | Volitelně **mindset_tip**, **shopping_list** pro budoucí použití v aplikaci |
| Kontrola | diet_type, preferences, sekce | Explicitně zahrnuta kontrola přítomnosti Nákupní seznam + Mindset na tento týden |

Aplikace v `PlanViewer.js` hledá v HTML nadpisy obsahující „Nákupní seznam“ a „Mindset na tento týden“ a z následujících prvků (`<ul>` resp. `<p>`) bere data. Pokud tento asistent generuje `html`, který se někde do aplikace dostane (např. při budoucím sjednocení zdroje plánu), musí tyto dvě sekce v HTML být, aby „všechno najednou“ fungovalo i pro plány z tohoto asistenta.
