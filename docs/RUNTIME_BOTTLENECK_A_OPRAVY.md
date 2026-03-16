# Runtime analýza end-to-end a opravy (Body & Mind ON)

## 1. Kde vzniká finální HTML plán

- **body-metrics.js (registrace)**  
  Po uložení `body_metrics` vytvoří `createInitialAITasks` úlohu `initial_plan`, spustí `executeAITask(directTask)` (nebo scheduler) a čeká max ~50 s. Finální HTML **nevzniká** v body-metrics – jen spouští pipeline.

- **taskExecutors.executeTrainerTask**  
  1. Načte `body_metrics` a poslední plán.  
  2. Zavolá **generatePlan(bm)** → vrací `{ html, enrichment, generation_source, … }`.  
  3. Spustí **runPlanValidators(generated.html)** → může vrátit `htmlToPublish` odlišný od `generated.html` (nutrition/training validator „opraví“ HTML).  
  4. **Výběr HTML:**  
     - Pokud validator vrátil platné delší HTML → `chosenHtml = valHtml`, jinak `chosenHtml = genHtml`.  
  5. **persistTrainerPlan({ … generated: { ...generated, html: chosenHtml } })** ukládá **chosenHtml** do `ai_generated_plans.plan_html`.  
  → **Skutečný finální HTML plán** = ten, který se zapíše v `persistTrainerPlan` (buď z `generatePlan`, nebo z validatoru).

- **generatePlan.js (odkud se bere HTML)**  
  - První odpověď AI → parsování JSON / extrakce HTML → **validatePublishedPlanHtml**.  
  - Pokud **neplatná** → retry se striktním promptem (chybí sekce).  
  - Kontrola diety/lepku → případný diet retry.  
  - Pokud stále **neplatná** → **buildDeterministicFallbackPlanHtml(bm)** → `generation_source = 'deterministic_fallback'`.  
  - Platné HTML → **enrichPlanContent({ html })** (meals + exercises).  
  - **validatePlanTruth(html, enrichment)** → hard gate (unpublishable) / soft gate (repetitive, weak_quality_flags).  
  - Při **!truth_check_passed** → retry s výčtem nepublikovatelných jídel/cviků; při opětovném selhání → deterministic fallback.  
  - Při **!soft_gate_passed** → jeden soft retry (repetice + weak_meal_detail, weak_training_detail, …); při neúspěchu → deterministic fallback.  
  → **Kdy se přepne na retry:** když struktura plánu neprojde (retry 1), když poruší diet/lepku (retry 2), když truth check selže (retry 3), když soft gate selže (retry 4).  
  → **Kdy se přepne na deterministic fallback:** když po příslušném retry stále není platné HTML nebo truth/soft gate stále neprojde.

- **Co se ukládá do DB**  
  - **ai_generated_plans:** `plan_html` = vybraný HTML (generated nebo validator-corrected), `daily_calories`, `macros`, `plan_type`, `valid_from`, `valid_until`, `is_active`.  
  - Enrichment (meal_trust, exercise_media) **se neukládá** – při zobrazení profilu se volá **POST /api/plan-enrichment** s aktuálním `plan_html`.

- **Co se vrací do profilu**  
  - **GET /api/profile:** načte plány (včetně `plan_html`), aktivní plán = první s `is_active === true`.  
  - Pro diagnostiku načte `ai_tasks` (trainer, initial_plan) a do `_diagnostics` vrací `generation_source`, `fallback_used`, `truth_check`, `raw_ai_html_length`, `final_html_length`, `ai_output_was_used`, `retry_output_was_used`, `fallback_output_was_used`, `weak_quality_flags`, `media_exact_count`, `media_none_count`, `parse_success`, atd.  
  - Klient pak pro vykreslení plánu volá **POST /api/plan-enrichment** s `plan.plan_html` a dostane `meal_trust` a `exercise_media`.

- **PlanViewer**  
  - Parsuje `plan_html` na dny a sekce (jídelníček, trénink po dnech).  
  - Pokud parser selže → zobrazí „Plán existuje, ale nepodařilo se ho správně vykreslit“ a tlačítko pro raw HTML.  
  - Jídelníček zobrazuje z parsovaných bloků; obrázky a trust z `meal_trust` (z plan-enrichment).  
  - Cviky: pro každou položku tréninku lookup do `exercise_media` (podle `data-exercise-key` nebo normalizovaného názvu).  
  - **Trust:** pokud `NEXT_PUBLIC_API_ONLY_MEDIA=true`, zobrazí médium jen při `trust_level === 'exact'`; jinak i `fallback`. Při `none` nebo chybějícím záznamu → text „Bez ověřeného média“.  
  - Strukturální položky (`total`, `warmup`, `cooldown`, `rest`) mají `showMediaBox = false` → žádný velký media box ani placeholder.

**Shrnutí flow:**  
Registrace → body_metrics → initial_plan task → executeTrainerTask → generatePlan → validace struktury → (volitelně) validátory → persistTrainerPlan(vybrané HTML). Profil načte `plan_html` z DB a pro média volá plan-enrichment. PlanViewer parsuje HTML a zobrazuje jídelníček + trénink; média a „Bez ověřeného média“ závisí na výstupu plan-enrichment (canonical map + ExerciseDB / exercisedb.dev / Pexels).

---

## 2. Kde je skutečný bottleneck

- **AI output**  
  Kvalita prvního výstupu (struktura, 7 dní, 21 jídel, rozmanitý trénink) přímo ovlivňuje, zda projde validace a soft gate. Slabý nebo zkrácený výstup → častější retry a fallback.

- **Truth check (hard gate)**  
  Nepublikovatelná jídla/cviky → jeden retry; pokud i po něm truth neprojde → deterministic fallback. To může být bottleneck, pokud AI často generuje nemapovatelné entity.

- **Soft gate (weak quality + repetice)**  
  Slabé sekce (weak_meal_detail, weak_training_detail, weak_regeneration_detail, weak_mindset_detail, weak_shopping_list) nebo repetitivní jídelníček/trénink spouští jeden soft retry; při neúspěchu → fallback. Slabé plány tedy neprojdou „jen tak“.

- **Fallback**  
  Deterministic fallback dává vždy platné a publikovatelné HTML (MEAL_ROTATION, TRAINING_BLOCKS, canonical keys). Pokud je **častý** fallback, bottleneck je výše (AI nebo truth/soft gate).

- **Enrichment**  
  Běží až po výběru finálního HTML. Nemění obsah plánu; ovlivňuje jen to, kolik položek má `trust_level: exact` vs `none`. „Bez ověřeného média“ = enrichment pro daný cvik vrátil `trust_level: 'none'` (canonical key chybí nebo ExerciseDB/exercisedb.dev nic nenašel).

- **Profile API**  
  Jen vrací uložený `plan_html` a diagnostiku z task result. Neschovává plán; pokud je plán slabý, je to proto, že tak byl uložen (AI/retry/fallback).

- **PlanViewer render**  
  Parser může selhat na neobvyklém HTML → uživatel vidí raw/fallback view. Jinak nezamlčuje jídelníček; pokud je jídelníček prázdný nebo chudý, je to v samotném HTML (generování/validace), ne v renderu.

**Závěr bottlenecku:**  
Hlavní body, kde se „ztratí“ kvalita, jsou **kvalita AI výstupu** (první odpověď a úspěšnost retry) a **truth/soft gate** (odfiltrování slabých plánů s možným přechodem na fallback). **Enrichment** je bottleneck pro **média cviků** (hodně „Bez ověřeného média“ = málo canonical matchů nebo selhání ExerciseDB/exercisedb.dev). **Profile API** a **PlanViewer** předávají a zobrazují to, co přišlo z pipeline; nejsou primární příčinou slabého obsahu.

---

## 3. Provedené změny

### 3.1 Prompt a soft gate (lib/assistantInstructions.js, lib/validatePlanTruth.js)

- Instrukce trenéra už zdůrazňují 21 konkrétních jídel, 4–5 cviků na tréninkový den, rozmanitost dnů a konkrétní suplementaci/nákupní seznam/mindset.  
- V **validatePlanTruth** jsou weak signály: weak_meal_detail (málo jídel / příliš krátké názvy), weak_training_detail (méně než 3 hlavní cviky na den kromě rozcvičky/závěru), weak_regeneration_detail, weak_mindset_detail, weak_shopping_list.  
- Soft gate vyžaduje `weak_quality_flags.length === 0` a žádné repetice / unjustified supplements.  
- V **generatePlan** soft retry prompt explicitně obsahuje požadavky podle weak_quality_flags (jídelníček, trénink, regenerace, mindset, nákupní seznam).

### 3.2 Truth pipeline (lib/generatePlan.js)

- Hard gate: nepublikovatelné jídla/cviky → jeden retry s výčtem; při neúspěchu → deterministic fallback.  
- Soft gate: repetice + weak_quality_flags → jeden soft retry; při neúspěchu → deterministic fallback.  
- Diagnostika v return: raw_ai_html_length, final_html_length, ai_output_was_used, retry_output_was_used, fallback_output_was_used, weak_quality_flags, media_exact_count, media_none_count.

### 3.3 Trénink – variation a canonical map (lib/exerciseCanonicalMap.js, lib/generatePlan.js)

- TRAINING_BLOCKS a buildDeterministicFallbackPlanHtml už střídají typy jednotek (full body, dolní, horní, kardio-mobilita).  
- buildUserPrompt a instrukce trenéra vyžadují rozeznatelně jiné tréninkové dny.  
- **exerciseCanonicalMap:** rozšířen CZECH_LABEL_MAP o další české/anglické varianty (tlaky na prsa/ramena, dřepy, kliky, přítahy, výpady, prkno, superman, závěr, rozcvička, odpočinek, atd.) pro lepší mapování na canonical key a tím i na ExerciseDB.

### 3.4 Enrichment a média cviků (lib/exerciseEnrichment.js, lib/enrichPlanContent.js)

- **exerciseEnrichment:** po neúspěchu s anglickým názvem (exercisedb_name) se zkouší **exercisedb.dev** s **display_name_cs** (český název), aby běžné české názvy dostaly exact médium.  
- **injectExerciseKeysIntoPlanHtml** (generatePlan) doplňuje `data-exercise-key` z resolveToCanonicalKey / normalizeExerciseLookupKey, takže enrichment dostává konzistentní klíče.  
- Plan-enrichment API vrací exercise_media s normalizovanými klíči; PlanViewer lookup používá stejnou normalizaci. Strukturální položky (warmup, cooldown, rest, total) v PlanViewer nemají media box (`showMediaBox = false`).

### 3.5 Profile a diagnostika (pages/api/profile.js, pages/api/debug/latest-plan-status.js)

- **profile** vrací v `_diagnostics`: generation_source, fallback_used, truth_check (včetně soft_gate), raw_ai_html_length, final_html_length, ai_output_was_used, retry_output_was_used, fallback_output_was_used, weak_quality_flags, media_exact_count, media_none_count, parse_success, rendering_mode (odvozen od validity plánu).  
- **debug/latest-plan-status** vrací v task result všechna result_* pole (včetně result_raw_ai_html_length, result_final_html_length, result_ai_output_was_used, result_retry_output_was_used, result_fallback_output_was_used, result_weak_quality_flags, result_media_exact_count, result_media_none_count).

### 3.6 PlanViewer

- Žádné záměrné skrývání jídelníčku; pokud je plán validní, parser zobrazí všechny sekce.  
- Při trust_level `none` nebo chybějícím záznamu u cviku se zobrazí „Bez ověřeného média“ bez falešného obrázku (no-lies UI).  
- Strukturální řádky (total, warmup, cooldown, rest) nemají velké media boxy.

---

## 4. Proč to teď bude vypadat lépe v reálném profilu

- Slabé plány (málo jídel, málo cviků, krátké sekce, repetice) neprojdou soft gate nebo budou opraveny soft retry; při opakovaném selhání se použije kvalitní deterministic fallback s 7×3 jídly a rozmanitými bloky.  
- Běžné cviky (Dřepy, Kliky, Přítahy, Výpady, Prkno, Superman, Tlaky…) mají lepší šanci na exact médium díky canonical mapě a druhému pokusu s českým názvem v exercisedb.dev.  
- Profil vždy zobrazuje to, co je v `plan_html` v DB (aktivní plán); diagnostika ukazuje, zda byl použit AI, retry nebo fallback a jaké byly weak_quality_flags a media counts.  
- Jídelníček je plně v HTML a v parseru PlanViewer; není „vygenerovaný a neviditelný“, pokud parser nefailuje (pak je k dispozici raw fallback).

---

## 5. Jak to otestovat krok za krokem

1. **Registrace (body-metrics)**  
   Odeslat POST s e-mailem, výška/váha, cíl, frekvence, tréninkové dny. Ověřit, že odpověď obsahuje `plan_state: 'ready'` nebo `'processing'` a po dokončení že initial_plan task má `status: 'completed'`.

2. **Profil**  
   GET /api/profile s Bearer tokenem. Zkontrolovat `plans[0].plan_html` (délka, obsah sekcí), `_diagnostics.generation_source`, `_diagnostics.fallback_used`, `_diagnostics.weak_quality_flags`, `_diagnostics.media_exact_count` / `media_none_count`, `_diagnostics.parse_success`.

3. **Debug endpoint**  
   GET /api/debug/latest-plan-status?email=… s ADMIN_TOKEN. Ověřit result_raw_ai_html_length, result_final_html_length, result_ai_output_was_used, result_retry_output_was_used, result_fallback_output_was_used, result_weak_quality_flags, result_media_exact_count, result_media_none_count.

4. **PlanViewer v prohlížeči**  
   Přihlásit se, otevřít profil s plánem. Ověřit, že je vidět 7denní jídelníček (Snídaně/Oběd/Večeře), trénink po dnech, že u běžných cviků jsou buď obrázky/GIF (exact/fallback), nebo text „Bez ověřeného média“, a že u rozcvičky/závěru/odpočinku není velký media box.

5. **Build**  
   `npm run build` musí projít.

---

## 6. Shrnutí podle zadání (8 bodů)

1. **Skutečný root cause podle kódu**  
   Hlavní příčiny slabého dojmu v aplikaci: (a) **kvalita prvního AI výstupu** – krátký nebo málo konkrétní plán procházel strukturální validací a dostal se do DB; (b) **soft gate** nebyl dostatečně přísný na „slabou kvalitu“ (krátké sekce, málo cviků); (c) **média cviků** – canonical map nebo ExerciseDB lookup často nevracely exact match (české názvy, synonyma), takže PlanViewer zobrazoval „Bez ověřeného média“.

2. **Proč uživatel viděl slabý trénink a/nebo jídelníček**  
   Protože buď AI vrátila slabý plán a ten prošel (struktura byla platná), nebo po truth/soft retry došlo k fallbacku, ale diagnostika nebyla vidět. Jídelníček „vygenerovaný, ale neviditelný“ vzniká jen pokud parser v PlanVieweru selže (pak je k dispozici raw fallback).

3. **Změny v promptu**  
   Instrukce trenéra (assistantInstructions / TRAINER_SYSTEM_PROMPT) už výslovně požadují: 21 konkrétních jídel (7×3), min. 4–5 cviků na tréninkový den, rozeznatelně jiné dny (full body / dolní / horní / kardio-mobilita), konkrétní suplementaci a nákupní seznam. Zakázaný výstup zahrnuje „příliš krátké sekce“ a „generický trénink“.

4. **Změny v truth pipeline**  
   validatePlanTruth: weak_meal_detail, weak_training_detail (počet hlavních cviků bez warmup/cooldown/rest), weak_regeneration_detail, weak_mindset_detail, weak_shopping_list; soft_gate_passed vyžaduje weak_quality_flags.length === 0. generatePlan: soft retry s přesným výčtem problémů podle weak_quality_flags; při neúspěchu deterministic fallback.

5. **Změny v enrichmentu a mapování cviků**  
   exerciseCanonicalMap: rozšířen CZECH_LABEL_MAP (tlaky nad hlavu, tlaky hlavu, ramena jednoručky, …). exerciseEnrichment: po neúspěchu s anglickým názvem druhý pokus s display_name_cs u exercisedb.dev. injectExerciseKeysIntoPlanHtml doplňuje data-exercise-key z canonical mapy. PlanViewer: strukturální položky (total, warmup, cooldown, rest) nemají media box.

6. **Změny v profile/render flow**  
   Profile API vrací aktivní plán (plan_html z DB) a v _diagnostics: generation_source, fallback_used, truth_check, raw_ai_html_length, final_html_length, ai_output_was_used, retry_output_was_used, fallback_output_was_used, weak_quality_flags, media_exact_count, media_none_count, parse_success, rendering_mode. PlanViewer nezměněn v logice zobrazení jídelníčku/tréninku – zobrazuje to, co je v HTML; při chybě parseru nabídne raw fallback.

7. **Proč to teď bude vypadat lépe v reálném profilu**  
   Slabé plány spadnou do soft retry nebo deterministic fallbacku (7×3 jídla, rozmanité bloky). Běžné cviky mají vyšší šanci na exact médium díky canonical mapě a českému názvu u exercisedb.dev. Diagnostika umožňuje vidět, zda byl použit AI, retry nebo fallback a jaké byly weak_quality_flags a media counts.

8. **Jak to otestovat**  
   Viz sekce 5 výše (registrace → profil → debug endpoint → PlanViewer v prohlížeči → build). **Safe pro main:** ano – zpětně kompatibilní, deterministic fallback beze změny, diagnostika neexponuje citlivá data.

---

## 7. Bezpečnost pro main

- Změny jsou zpětně kompatibilní: stávající plány v DB zůstávají; pouze nové generování používá rozšířený canonical map a soft/truth retry.  
- Deterministic fallback zůstává stejně bezpečný (pouze ověřená jídla a cviky).  
- Diagnostika v profile a debug endpointu neexponuje citlivá data; slouží k pochopení, proč plán vypadá tak, jak vypadá.  
- Enrichment (exercisedb.dev s display_name_cs) jen rozšiřuje zdroje médií; nemění pravidla trust (exact vs none).  
- **Doporučení:** nasadit na main a sledovat _diagnostics a latest-plan-status u reálných uživatelů; podle podílu fallback_output_was_used a weak_quality_flags případně doladit prahy nebo prompt.
