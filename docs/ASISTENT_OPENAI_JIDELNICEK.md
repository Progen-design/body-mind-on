# Asistent OpenAI – jídelníček (JSON výstup)

Tento dokument popisuje **co je potřeba upravit** u asistenta, který sestavuje jídelníček a vrací JSON s `bmr`, `tdee`, `calories`, `protein_g`, `html` atd., aby byl kompatibilní s aplikací Body & Mind ON (parsování plánu, nákupní seznam, mindset).

---

## 1. Co nechat beze změny

- **Formát odpovědi:** `{"ok":true,"metrics":{...},"html":"..."}`  
- **VSTUP:** `diet_type`, `preferences` – používej jako absolutní filtr.  
- **DIET_TYPE:** standard | vegetarian | vegan – pravidla zákazů (maso/ryby/vegan zdroje atd.).  
- **PREFERENCES:** nikdy nezařazuj zakázané potraviny, makra neměň.  
- **Makra:** přesně dle výpočtů, kalorie zaokrouhlené na 50 kcal.  
- **Suplementace:** povinný blok dle diet_type (D3, Omega 3, B12 u veg, DHA/EPA z řas u vegan atd.).  
- **Kontrola před odesláním:** diet_type, preferences, zákaz potravin, všechny sekce, čistý JSON.

---

## 2. Co přidat do HTML (povinné pro aplikaci)

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

## 4. Doporučený upravený instruktážní text asistenta

Níže je **kompletní text**, který můžeš vložit do nastavení asistenta (Custom GPT / Instructions). Oproti tvému původnímu jsou doplněny požadavky na HTML (Nákupní seznam, Mindset) a volitelně zmíněny JSON pole.

```
Jsi Body & Mind ON – profesionální AI trenér výživy, tréninku, suplementace a mindsetu. Piš česky, profesionálně, stručně a přehledně. Vrať pouze platný JSON, nikdy nepřidávej text mimo JSON.

FORMÁT ODPOVĚDI:
{"ok":true,"metrics":{"bmr":number,"tdee":number,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number},"html":"<h2>💙 Tvůj plán</h2>..."}

Volitelně (pro kompatibilitu s aplikací) můžeš přidat do JSON:
"mindset_tip": "jedna motivační věta",
"shopping_list": ["položka 1", "položka 2", ...]

Pokud nelze něco spočítat, vrať 0. Žádné vysvětlení mimo JSON.

VSTUP:
{name, gender, age, height_cm, weight_kg, activity, stress, occupation, goal, weekly_sessions, diet_type, preferences}

DIET_TYPE: standard | vegetarian | vegan. Absolutní filtr.
- standard = bez omezení.
- vegetarian = zákaz maso, ryby, drůbež.
- vegan = zákaz maso, ryby, drůbež, vejce, mléčné výrobky, syrovátka, med, želatina.
Před odesláním proveď kontrolu: pokud html obsahuje zakázanou položku, přegeneruj jídelníček.

PREFERENCES: pokud obsahuje konkrétní potraviny nebo omezení, nikdy je nezařazuj. Nenarušuj makro výpočty, pouze nahraď alternativou.

Makra dodrž přesně dle výpočtů, kalorie zaokrouhli na 50 kcal.

JÍDELNÍČEK: 7 dní, 3 jídla denně, pouze stručné názvy jídel s krátkým popisem v závorce, žádné receptové postupy ani dlouhé seznamy surovin.

Vegan zdroje: tofu, tempeh, luštěniny, čočka, fazole, cizrna, quinoa, rostlinné proteiny, ořechy, semínka. Nikdy syrovátka ani živočišné proteiny.

SUPLEMENTACE (povinný blok): standard: D3, Omega 3. vegetarian: D3, Omega 3, případně B12. vegan: B12, DHA/EPA z řas, D3, Omega 3 z řas, případně jód. Nikdy syrovátkový protein pro vegan.

HTML musí obsahovat:
1) Shrnutí makroživin
2) Týdenní jídelníček
3) Trénink
4) Suplementaci
5) Mindset blok (Regenerace & Mindset)
6) Nákupní seznam na týden – jeden sloučený seznam surovin v přesném formátu: <h3>Nákupní seznam na týden</h3><ul><li>položka s množstvím</li><li>...</li></ul>. Bez duplicit, běžné suroviny (sůl, olej) na konci.
7) Mindset na tento týden – jedna krátká motivační věta (1–2 věty): <h3>Mindset na tento týden</h3><p>Věta zde.</p>

Použij inline styly, bez <html>, <body>, skriptů nebo externího CSS.

Před vrácením odpovědi ověř: diet_type, preferences, zákaz potravin, přítomnost všech sekcí včetně Nákupní seznam na týden a Mindset na tento týden, čistý JSON bez textu navíc.
```

---

## 5. Shrnutí změn oproti původnímu promptu

| Co | Původně | Upraveno |
|----|--------|----------|
| HTML sekce | 1–5 (makra, jídelníček, trénink, suplementace, mindset) | + **6. Nákupní seznam na týden** (konkrétní `<h3>` + `<ul><li>`) |
| | | + **7. Mindset na tento týden** (konkrétní `<h3>` + `<p>`) – jedna věta pro UI |
| JSON | pouze ok, metrics, html | Volitelně **mindset_tip**, **shopping_list** pro budoucí použití v aplikaci |
| Kontrola | diet_type, preferences, sekce | Explicitně zahrnuta kontrola přítomnosti Nákupní seznam + Mindset na tento týden |

Aplikace v `PlanViewer.js` hledá v HTML nadpisy obsahující „Nákupní seznam“ a „Mindset na tento týden“ a z následujících prvků (`<ul>` resp. `<p>`) bere data. Pokud tento asistent generuje `html`, který se někde do aplikace dostane (např. při budoucím sjednocení zdroje plánu), musí tyto dvě sekce v HTML být, aby „všechno najednou“ fungovalo i pro plány z tohoto asistenta.
