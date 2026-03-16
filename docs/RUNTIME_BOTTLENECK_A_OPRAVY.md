# Runtime bottleneck a opravy – výstup

## 1. Skutečný root cause podle kódu

- **Finální HTML** vzniká v `generatePlan()`: buď z prvního AI výstupu (po parse JSON a enrichTrainingSection + injectExerciseKeys), nebo po retry (structure/diet/truth/soft gate), nebo z `buildDeterministicFallbackPlanHtml(bm)`. Do DB ukládá `persistTrainerPlan()` v taskExecutors – vždy `chosenHtml` (generated nebo validator_corrected).
- **Proč mohl být výstup slabý:**
  - AI vracel technicky validní, ale **krátký nebo málo konkrétní** plán – soft gate dříve kontroloval jen repetitivnost a suplementaci, ne „slabou kvalitu“ sekcí (krátké jídla, málo cviků v tréninku, krátká regenerace/mindset/nákupní seznam).
  - **Enrichment médií**: cviky bez canonical match nebo s nerozpoznaným názvem → trust_level `none`; ExerciseDB/exercisedb.dev volání může selhat (klíč, timeout) → „Bez ověřeného média“.
  - **Profil** bere plán z `ai_generated_plans` (aktivní plán); co je uloženo, to se i zobrazuje. PlanViewer strukturální řádky (total, warmup, cooldown, rest) neschovává – má `showMediaBox = false`, takže žádný velký media box.
- **Bottleneck:** kombinace (1) **soft gate neřešil slabou kvalitu** (weak detail), (2) **enrichment** u cviků často končil bez média (jedno volání exercisedb.dev, bez fallbacku na český název), (3) **diagnostika** nebyla dost srozumitelná (chyběly raw_ai_html_length, ai_output_was_used, weak_quality_flags).

## 2. Proč uživatel viděl slabý trénink a/nebo jídelníček

- **Jídelníček:** Pokud AI vrátil málo jídel (< 18), krátké názvy (např. < 6 znaků po normalizaci u více než 4 jídel) nebo repetitivní sloty, soft gate to dříve **nezachytil** – kontroloval jen repetitive_meals a unjustified_supplements. Technicky validní HTML prošlo bez retry.
- **Trénink:** Pokud u tréninkových dnů byl v bloku méně než 3 položky (kromě rozcvičky/závěru), nebo byly dny identické, opět to nemuselo být dostatečně trestané – repetitive_training_days zachytí jen **identické** bloky; „skoro stejné“ nebo „moc krátké“ ne.
- **Média cviků:** Při canonical key (např. squat) se volá ExerciseDB (RapidAPI) a pak exercisedb.dev. Pokud RapidAPI neběží nebo vrací prázdno a exercisedb.dev vyhledával jen anglický název („squat“), u některých API tvarů mohl search selhat. Chyběla druhá pokus s českým názvem (display_name_cs).

## 3. Změny v promptu

- V **assistantInstructions.js** nebyl v této vlně měněn obsah (už je posílený z předchozí úpravy).
- V **generatePlan** byl rozšířen **soft retry prompt**: když soft gate selže kvůli `weak_quality_flags`, do retry promptu se přidají konkrétní instrukce:
  - weak_meal_detail → 21 konkrétních jídel, min. 6 znaků.
  - weak_training_detail → min. 3 hlavní cviky na tréninkový den.
  - weak_regeneration_detail → min. 2–3 věty.
  - weak_mindset_detail → min. jedna věta přizpůsobená cíli.
  - weak_shopping_list → konkrétní položky, min. 5.

## 4. Změny v truth pipeline

- **validatePlanTruth.js**
  - Přidána funkce **extractSection(html, sectionName)** pro extrakci textu sekce (Regenerace, Mindset, Nákupní seznam).
  - Nové signály **weak_quality_flags**: weak_meal_detail (málo jídel nebo příliš mnoho krátkých názvů), weak_training_detail (méně než 3 položky v tréninkovém bloku), weak_regeneration_detail (< 40 znaků), weak_mindset_detail (< 30 znaků), weak_shopping_list (< 20 znaků).
  - **soft_gate_passed** nyní vyžaduje i `weak_quality_flags.length === 0`; **soft_gate_reason** obsahuje i „weak_quality: …“.
  - Návrat rozšířen o **weak_quality_flags**.
- **generatePlan.js**
  - Při soft gate failu se do retry promptu doplní instrukce podle každého weak_quality_flags (viz výše).
  - Sledování **raw_ai_html_length** (délka prvního parsovaného HTML z AI).
  - Návrat rozšířen o: **raw_ai_html_length**, **final_html_length**, **ai_output_was_used**, **retry_output_was_used**, **fallback_output_was_used**, **weak_quality_flags**, **media_exact_count**, **media_none_count**.

## 5. Změny v enrichmentu a mapování cviků

- **exerciseEnrichment.js**
  - Po neúspěchu **tryExerciseDbDev(searchName)** (anglický exercisedb_name) se zkusí ještě **tryExerciseDbDev(display_name_cs)** (český název). Tím se zvýší šance, že běžné cviky (Dřepy, Kliky, …) dostanou médium i když první search nic nevrátí.
- **exerciseCanonicalMap.js**
  - Přidány varianty: **tlaky na prsa** → bench_press, **tlaky na rameno** → overhead_press (vedle stávajících tlaky na ramena / na hrudník).

## 6. Změny v profile/render flow

- **taskExecutors.js**
  - Do resultu trainer úlohy doplněna pole: raw_ai_html_length, final_html_length, ai_output_was_used, retry_output_was_used, fallback_output_was_used, weak_quality_flags, media_exact_count, media_none_count.
- **pages/api/profile.js**
  - V **\_diagnostics** přidána pole: raw_ai_html_length, final_html_length, ai_output_was_used, retry_output_was_used, fallback_output_was_used, weak_quality_flags, media_exact_count, media_none_count, **parse_success** (= hasValidPlan).
- **pages/api/debug/latest-plan-status.js**
  - V **trainer_task** result přidána pole: result_raw_ai_html_length, result_final_html_length, result_ai_output_was_used, result_retry_output_was_used, result_fallback_output_was_used, result_weak_quality_flags, result_media_exact_count, result_media_none_count.
- **PlanViewer**
  - Beze změn: strukturální položky (total, warmup, cooldown, rest) mají `showMediaBox = false` – žádné rušivé media boxy. „Bez ověřeného média“ zůstává u cviků bez exact/fallback média (no-lies UI).

## 7. Proč to teď bude vypadat lépe v reálném profilu

- **Slabé plány** spadnou do soft gate (weak_meal_detail, weak_training_detail, krátká regenerace/mindset/nákupní seznam) a dostanou **jeden retry** s přesným popisem, co doplnit. Pokud ani retry není dost dobrý, použije se deterministic fallback (stále publish-safe a strukturovaný).
- **Média cviků:** Druhý pokus exercisedb.dev s českým názvem zvyšuje šanci, že Dřepy, Kliky, Výpady atd. dostanou GIF/obrázek bez změny pravidel „exact / fallback / none“.
- **Diagnostika:** Z _diagnostics a debug endpointu je na první pohled vidět, zda byl použit čistý AI výstup, retry nebo fallback, délky HTML a počty exact/none médií, takže další ladění je cílené.

## 8. Jak to otestovat krok za krokem

1. **Registrace**
   - Nový uživatel (e-mail, výška, váha, cíl, frekvence, tréninkové dny).
   - Po uložení ověřit e-mail s plánem nebo zprávu o dokončení na pozadí.

2. **Profil**
   - Přihlásit se, otevřít /profil.
   - Ověřit: 7 dní, u každého Snídaně/Oběd/Večeře s konkrétními názvy; u každého dne „Trénink tento den“ s rozumným počtem položek; Regenerace, Suplementace, Nákupní seznam, Mindset s obsahem.

3. **Diagnostika**
   - GET /api/profile → v odpovědi `_diagnostics`: generation_source, final_publish_source, ai_output_was_used, fallback_output_was_used, raw_ai_html_length, final_html_length, weak_quality_flags, media_exact_count, media_none_count, parse_success.
   - GET /api/debug/latest-plan-status?email=… (s ADMIN_TOKEN) → result_raw_ai_html_length, result_final_html_length, result_ai_output_was_used, result_fallback_output_was_used, result_weak_quality_flags, result_media_exact_count, result_media_none_count.

4. **Média cviků**
   - U plánu s cviky Dřepy, Kliky, Výpady, Prkno zkontrolovat, zda u většiny je obrázek/GIF nebo „Náhradní vizuál“; u zbylých zůstává „Bez ověřeného média“ (bez lži v UI).

5. **Strukturální řádky**
   - U řádků typu Trénink celkem, Rozcvička, Závěr, Odpočinek ověřit, že se nezobrazuje velký media box ani rušivý placeholder.

## 9. Je to safe pustit na main?

**Ano.**

- Build prochází.
- Hard gate (unpublishable) a strukturovaná validace plánu jsou beze změny; při selhání stále následuje retry a pak deterministic fallback.
- Soft gate je jen rozšířen o weak_quality_flags; při selhání soft gate se provede jeden retry a při neúspěchu stejný fallback jako dříve.
- Enrichment cviků pouze přidává druhé volání exercisedb.dev (display_name_cs); neukládá se nic nového jako „exact“, pokud zdroj není důvěryhodný.
- Diagnostika jsou jen nová volitelná pole v resultu a _diagnostics; žádné breaking změny API ani DB schématu.

Doporučení po deployi: u několika nových registrací zkontrolovat _diagnostics a latest-plan-status a ověřit, že generation_source, weak_quality_flags a media počty odpovídají očekávání.
