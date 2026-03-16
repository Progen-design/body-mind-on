# Implementace kvality AI plánu – výstup

## 1. Root cause

- **Trainer prompt** byl stručný a nevynucoval konkrétní rozsah: chyběla explicitní požadavky na 21 konkrétních jídel, na odlišné tréninkové jednotky mezi dny a na neshablonovitou suplementaci.
- **Truth pipeline** používal jen hard gate (unpublishable_meals/exercises). Repetitive_meals, repetitive_training_days a unjustified_supplements byly pouze diagnostika – neřídily retry ani fallback.
- **AI** často vracel krátké sekce, opakující se jídla/tréninky a jednu generickou větu u suplementace, protože prompt to nezakazoval a nebyla žádná zpětná vazba (retry) na kvalitu.

## 2. Proč byl AI plán slabý

- Prompt nespecifikoval minimální bohatost výstupu (např. „min. 2–3 věty u Suplementace“, „každý tréninkový den jiný typ jednotky“).
- Žádný soft gate: i když byl plán publish-safe, opakující se jídla nebo identické bloky cviků se neřešily – žádný retry s důvodem.
- Šablonovitá suplementace (krátká generická věta) procházela bez kontroly a bez retry.

## 3. Změny v trainer promptu (lib/assistantInstructions.js)

- Přidána sekce **KVALITA A ROZSAH (POVINNÉ)**:
  - Jídelníček: 7×3 = 21 konkrétních jídel, žádné prázdné/jednoslovné položky, každé jídlo s přílohou/charakterem.
  - Trénink: u každého tréninkového dne celková délka, rozcvička, 4–5 hlavních cviků, závěr; každý den rozeznatelně jiný (full body / dolní / horní / kardio-mobilita).
  - Regenerace: 2–4 věty podle cíle a stresu.
  - Suplementace: co, proč, kdy – min. 2–3 věty s odůvodněním, ne jedna generická věta.
  - Nákupní seznam: konkrétní položky na týden.
  - Mindset: krátká věta přizpůsobená cíli.
- **ZAKÁZANÝ VÝSTUP** rozšířen o: příliš krátké sekce, generický trénink (stejné 3 cviky), šablonovitou suplementaci.
- **CVIKY**: explicitní povolený seznam (Dřepy, Kliky, Přítahy v předklonu, Výpady, Prkno, Superman, …) a formát „Trénink celkem: X min“, rozcvička, 4–5 cviků, závěr.
- **SUPLEMENTACE**: požadavek na odůvodnění (co, proč, kdy) a min. 2–3 věty.

## 4. Změny v generatePlan (lib/generatePlan.js)

- **Soft gate retry**: Po prvním AI výstupu a truth checku, pokud `truth_check_passed` ale `!soft_gate_passed` (repetitive_meals, repetitive_training_days nebo unjustified_supplements), provede se **jeden retry** s přesným důvodem v promptu:
  - JÍDELNÍČEK: výčet repetitive_meals + instrukce variovat (max 2× stejné jídlo ve slotu).
  - TRÉNINK: výčet repetitive_training_days + požadavek odlišných jednotek mezi dny.
  - SUPLEMENTACE: požadavek konkrétního doporučení (co, proč, kdy), ne šablona.
- Po soft retry se znovu spustí truth check (včetně soft_gate_passed); pokud stále neprojde → **deterministic fallback**.
- **Nové návratové pole** z generatePlan: `truth_retry_triggered`, `truth_retry_reason`, `truth_retry_fixed`, `final_publish_source`.
- Hard gate (unpublishable) zůstává: 1× retry, pak fallback; `truth_retry_triggered` a `truth_retry_fixed` se nastavují i u hard retry.

## 5. Změny v truth pipeline (lib/validatePlanTruth.js, taskExecutors, profile API)

- **validatePlanTruth.js**:
  - Přidán výpočet **soft_gate_passed** (true jen když repetitive_meals, repetitive_training_days a unjustified_supplements jsou prázdné).
  - Přidán **soft_gate_reason** (text důvodu pro soft fail).
  - Návratová hodnota rozšířena o `soft_gate_passed` a `soft_gate_reason`.
- **taskExecutors.js**: Do resultu trainer úlohy přidána pole `truth_retry_triggered`, `truth_retry_reason`, `truth_retry_fixed`, `final_publish_source`.
- **pages/api/profile.js**: V `_diagnostics` přidána pole `soft_gate_passed`, `soft_gate_reason`, `truth_retry_triggered`, `truth_retry_reason`, `truth_retry_fixed`, `final_publish_source`.

## 6. Proč to teď povede k lepšímu jídelníčku a tréninku

- **Prompt** přímo požaduje 21 konkrétních jídel, odlišné tréninkové dny a neshablonovitou suplementaci; zakazuje krátké/generické výstupy.
- **Soft gate** při repetitivním jídelníčku nebo tréninku nebo šablonovité suplementaci spustí jeden retry s přesným důvodem, takže model dostane druhou šanci s konkrétními instrukcemi.
- **Fallback** zůstává publish-safe a bohatý (MEAL_ROTATION, TRAINING_BLOCKS, buildSupplementNote), takže i při opakovaném selhání AI uživatel dostane konzistentní plán.

## 7. Jak to otestovat krok za krokem

1. **Registrace nového uživatele** (např. testovací e-mail):
   - Vyplň formulář (výška, váha, cíl, frekvence, tréninkové dny, diet_type).
   - Očekávané: po uložení se vytvoří úloha initial_plan, do ~30 s přijde e-mail s plánem (nebo zpráva „plán se dokončuje na pozadí“).
2. **Profil**:
   - Přihlas se a otevři /profil.
   - Ověř: zobrazen je jídelníček na 7 dní (Snídaně, Oběd, Večeře u každého dne), u každého dne blok „Trénink tento den“ (u tréninkových dnů konkrétní cviky, u odpočinku „Odpočinek“ nebo „Lehká procházka“).
   - Sekce Regenerace, Suplementace, Nákupní seznam, Mindset by měly mít víc než jednu větu (zejména Suplementace).
3. **Diagnostika** (pro vývojáře):
   - V odpovědi GET /api/profile v `_diagnostics` zkontroluj: `generation_source`, `truth_check_passed`, `soft_gate_passed`, `truth_retry_triggered`, `truth_retry_reason`, `final_publish_source`.
   - Pokud byl spuštěn soft retry, `truth_retry_triggered` bude true a `truth_retry_reason` obsahuje důvod.
4. **Média cviků**:
   - U plánu s cviky Dřepy, Kliky, Výpady, Prkno, Přítahy by měly být u většiny položek obrázky/GIF (pokud enrichment a ExerciseDB/registry fungují). U položek bez média zůstane placeholder (žádné „fake“ exact).

## 8. Je to safe pustit na main?

**Ano.**

- Build prochází.
- Hard gate (unpublishable) stále blokuje nepublikovatelný plán; při selhání retry se použije deterministic fallback.
- Soft gate pouze přidává jeden volitelný retry při repetitivitě/šablonovité suplementaci; při neúspěchu opět fallback.
- Žádné breaking změny v API ani ve schématu DB; nová pole v resultu a _diagnostics jsou volitelná.
- Trainer prompt je zpřesněný tak, aby výstup byl plnohodnotný; v nejhorším případě zůstane stávající chování (fallback).

Doporučení: po nasazení sledovat první registrace (e-mail s plánem, délka HTML, `generation_source` a `truth_retry_triggered` v logách nebo v debug endpointu).
