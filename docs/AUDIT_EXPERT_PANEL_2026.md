# Expertní panel – Audit a roadmap Body & Mind ON

**Datum:** 2026-03-18  
**Typ:** Virtuální expertní tým (10 rolí)  
**Cíl:** End-to-end audit systému, identifikace slabin, priorit a roadmapy.

---

## Hlavní cíl projektu (priorita č. 1)

**Zapojení AI, které ve spojení s API vygeneruje jídelníček a tréninkový plán. Toto musí fungovat na sto procent.**

- AI (OpenAI) → strukturované dotazy pro recepty a cviky
- API (Spoonacular, wger) → reálné recepty a cviky
- Výstup: jídelníček + tréninkový plán

Všechno ostatní je druhotné. Tento core flow musí být spolehlivý a vždy doručit plán (s fallbacky při selhání).

---

## 1. Executive summary

1. **Co je aplikace dnes:** AI-driven fitness/jídelníček – OpenAI generuje search queries, Spoonacular dohledává recepty, wger cviky. Unified pipeline přes `runUnifiedPlanPipeline`. Registrace → body_metrics → ai_tasks → executeTrainerTask → persist + email. Profil zobrazuje plán z DB (bez Spoonacular při načtení).

2. **Silné stránky:** Jednotná pipeline, trust-safe obrázky, lokalizace do češtiny, deterministické tabulky v kódu (`deterministicFallback`) pro dotazy a nouzové šablony, last-resort při selhání AI, Spoonacular optimalizace (dedup, maxCandidates 2, budget 60).

3. **Slabé stránky:** Dva registrační toky (body-metrics vs assistant-intake), profile-preferences volá generatePlanForEmail bez fastMode, mealsOnly v planOrchestrator neimplementováno, žádné E2E testy.

4. **Připravenost na ostrý provoz:** ANO s riziky – core flow funguje, fallbacky existují, ale latency a quota jsou limitující. Doporučeno: monitoring, smoke testy, jasná failure UX.

5. **Další nejlepší krok:** Implementovat E2E smoke test kritické cesty (registrace → plán → profil).

**Poznámka:** Cache v planOrchestrator je záměrně nepoužívána – žádná cache v pipeline.

---

## 2. Panel expertů

### 1. Staff full-stack architekt

**Pohled:** Architektura je srozumitelná – unified pipeline, oddělené vrstvy. Rozpor: dokumentace říká „všechny vstupy vedou do runUnifiedPlanPipeline“, ale onboarding/generate-plan volá `generateStructuredPlan` přímo (bez persist). Assistant-intake píše do `registrations`, body-metrics do `body_metrics` – dva datové modely.

**3 problémy:**  
- Dva registrační toky (registrations vs body_metrics) – duplicita, matoucí.  
- mealsOnly v pipeline není implementováno – planOrchestrator vždy generuje celý plán.  
- structured_plan_json vs plan_html – oba se persistují, ale některé migrace mohou chybět.

**3 příležitosti:**  
- Sjednotit registrační tok na body_metrics.  
- Přidat mealsOnly do planOrchestrator (skip workout resolution).  
- Event-driven: diet_changed → adjust_plan task místo synchronního přegenerování.

**Doporučení:** Sjednotit vstupy. mealsOnly = low-hanging fruit.

---

### 2. Senior backend engineer

**Pohled:** API jsou čistá. Body-metrics má komplexní flow (createInitialAITasks → executeAITask → poll). Riziko: Vercel 60s timeout. Retry a last-resort fungují.

**3 problémy:**  
- body-metrics čeká až 55s na plán – při pomalém OpenAI/Spoonacular může timeoutovat.  
- executeAITask volá runUnifiedPlanPipeline – žádný explicitní fastMode pro initial_plan (taskExecutors by mohl předat fastMode).  
- profile-preferences při změně stravy volá generatePlanForEmail – plný plán, ne mealsOnly (i když onlyDietChanged=true).

**3 příležitosti:**  
- fastMode pro initial_plan v taskExecutors (maxCandidates 1, fallback 1).  
- mealsOnly v generatePlanForEmailViaUnified → planOrchestrator.  
- Async plán: vrátit 202, načíst plán v profilu později (složitější).

**Doporučení:** Přidat fastMode do executeTrainerTask pro initial_plan. Implementovat mealsOnly.

---

### 3. Senior frontend / UX engineer

**Pohled:** Profil je komplexní (5000+ řádků). PlanViewer parsuje HTML, enrichPlanContent bere data z data-* atributů – Spoonacular se nevolá. Konzistentní.

**3 problémy:**  
- Při selhání plánu: „Plán se nepodařilo vytvořit“ – uživatel neví, co dělat (tlačítko „Vygenerovat plán“?).  
- Placeholder „Jídlo (neověřeno)“ / „Cvik (neověřeno)“ – může působit nedůvěryhodně.  
- Nákupní seznam – jen ověřená jídla; pokud hodně neověřených, seznam je prázdný.

**3 příležitosti:**  
- Jasný CTA při fail: „Zkusit znovu“ s retry-initial-plan.  
- Trust labels: „Přesný zdroj“ / „Ilustrační“ – uživatel chápe, proč obrázek chybí.  
- Empty state pro nákupní seznam: „Přidej ověřená jídla do plánu.“

**Doporučení:** Přidat retry CTA na chybové stránce. Zlepšit copy pro neověřená jídla.

---

### 4. Senior AI systems engineer

**Pohled:** OpenAI generuje JSON, parseStructuredPlan validuje (legacy + volitelně v6). Při chybějících částech plánu náhrada dle `ONBOARDING_PRODUCTION_SPEC` § 2 (šablona jídel; deterministický workout při chybějících dnech). Prompt v planOrchestrator žádá pole sladěná s v6 (`name_cs`, `spoonacular_query`, u cviků `canonical_key`). Po `resolveMeals` je u ověřeného receptu `display_name_cs` z přeloženého titulu Spoonacular (`planner_suggestion_cs` uchovává návrh LLM); dedup Spoonacular volání zohledňuje i `name_cs`.

**3 problémy:**  
- Žádný few-shot v promptu – model může generovat příliš dlouhé nebo exotické dotazy.  
- diet_type, dietary_restrictions, foods_to_avoid – v promptu, ale ne vždy v JSON struktuře.  
- Při chybějícím `meal_plan` po OpenAI: `buildProfileTemplateMealPlan` (generické dotazy z profilu), nikoli plná rotace `getDeterministicMealPlan`. Při chybějícím `workout_plan.days`: `getDeterministicWorkoutPlan` — viz `docs/ONBOARDING_PRODUCTION_SPEC.md` § 2.

**3 příležitosti:**  
- Few-shot příklady search_query v promptu (oatmeal banana, chicken rice vegetables).  
- Explicitní diet constraints v promptu.  
- Retry s upraveným promptem při parse failure.

**Doporučení:** Volitelně přidat 2–3 few-shot příklady `spoonacular_query` do promptu. Ověřit diet constraints v parseStructuredPlan.

---

### 5. Senior data / integration engineer

**Pohled:** Spoonacular, wger, Supabase – integrace jsou čisté. Cache záměrně nepoužívána.

**3 problémy:**  
- body_metrics vs registrations – různé schémata, různé použití.  
- ai_generated_plans.structured_plan_json – může být velký; ověřit, že migrace existuje.  
- Indexy na ai_generated_plans – ověřit pro výkon.

**3 příležitosti:**  
- Sjednotit registrační data.  
- Indexy na ai_generated_plans (user_id, is_active, valid_until).  
- Ověřit migrace pro structured_plan_json a sloupce.

**Doporučení:** Ověřit migrace. Cache v planOrchestrator není požadována (záměrně žádná cache).

---

### 6. Senior QA / test automation engineer

**Pohled:** Žádné E2E testy. Ruční checklist v AUDIT_VERIFICATION_PRODUCTION_2026. Žádné snapshot testy.

**3 problémy:**  
- Žádná automatizace kritické cesty (registrace → plán → profil).  
- Regrese při změně promptu – neodhalí se.  
- Spoonacular/wger mock – neexistuje pro testy.

**3 příležitosti:**  
- Playwright/Cypress E2E: registrace → plán → profil.  
- Snapshot test pro renderPlanHtmlFromStructured (fixture JSON).  
- Mock Spoonacular API pro unit testy.

**Doporučení:** E2E smoke test kritické cesty. Snapshot pro renderer.

---

### 7. Senior product manager

**Pohled:** Produkt je jasný – personalizovaný plán + e-mail. Monetizace: memberships, trial, VIP. Co chybí: aktivace po registraci, retence.

**3 problémy:**  
- Po registraci: uživatel dostane e-mail, ale pokud e-mail selže – může být zmatený.  
- „Plán se nepodařilo vytvořit“ – žádná alternativa („Zkus to znovu“).  
- Habit tracker, návyky – oddělené od plánu; nejsou propojeny s „dodržováním plánu“.

**3 příležitosti:**  
- Onboarding: po registraci jasný „Tvůj plán je připraven“ + CTA na profil.  
- Retry flow: „Plán se nepodařilo vytvořit“ → „Zkusit znovu“ → retry-initial-plan.  
- Gamifikace: „Dodržel jsi 5/7 dní plánu – skvělé!“

**Doporučení:** Retry CTA. Jasná onboarding zpráva po úspěchu.

---

### 8. Senior security / reliability engineer

**Pohled:** Env, secrets – OK. SMTP/Resend – standard. Rate limit na generate-plan-next-week, assistant-intake.

**3 problémy:**  
- Při selhání OpenAI: šablona jídel + deterministický workout (viz § 2 spec); `validateStructuredPlan` kontroluje shodu s profilem. Při selhání Spoonacular: „Jídlo (neověřeno)“ – OK. Při selhání wger: „Cvik (neověřeno)“ – OK. Ale: co když Supabase selže?  
- body-metrics vrací 200 i při částečném selhání (planPending) – uživatel může být zmatený.  
- Žádný circuit breaker pro externí API – při opakovaných 429 může systém dál bombardovat.

**3 příležitosti:**  
- Circuit breaker pro Spoonacular (po 3× 429 přestat na 5 min).  
- Explicitní error handling pro Supabase v kritických místech.  
- plan_state v response – jasně: ready / processing / failed.

**Doporučení:** Circuit breaker pro Spoonacular. Jasný plan_state v UI.

---

### 9. Senior growth / conversion thinker

**Pohled:** Registrace je hlavní konverzní bod. E-mail s plánem = aktivace. Profil = retence.

**3 problémy:**  
- Po registraci: redirect na /profil – ale pokud plán neexistuje (planPending), profil je prázdný.  
- E-mail s plánem – pokud se nedostane (spam), uživatel ztratí kontext.  
- Trial 7 dní – po skončení: co se stane? Upgrade flow?

**3 příležitosti:**  
- Po registraci: pokud plan_state=ready, „Tvůj plán je připraven“ + CTA. Pokud plan_state=processing, „Plán se generuje – zkus obnovit za minutu.“  
- E-mail: „Tvůj plán je v profilu – přihlas se na app.bodyandmindon.cz.“  
- Trial end: push na upgrade, zachovat přístup k plánu (read-only).

**Doporučení:** Jasná UX pro plan_state. E-mail s odkazem na profil.

---

### 10. Perspektiva reálného uživatele

**Pohled:** Uživatel vyplní formulář, očekává plán.

**3 problémy:**  
- „Plán se nepodařilo vytvořit“ – žádná akce.  
- „Jídlo (neověřeno)“ – působí to jako chyba.  
- Dlouhé čekání (30–60 s) – bez progress indikátoru.

**3 příležitosti:**  
- Progress: „Generuji plán…“ s animací.  
- „Jídlo (neověřeno)“ → „Jídlo (doporučeno)“ nebo „Nahradit jídlo“.  
- Retry: „Nepodařilo se – zkus to znovu.“

**Doporučení:** Progress indikátor. Přátelštější copy pro neověřená jídla.

---

## 3. Stav systému po vrstvách

| Oblast | Status | Poznámka |
|--------|--------|----------|
| unified pipeline | PASS | Všechny hlavní vstupy vedou do runUnifiedPlanPipeline / generatePlanForEmailViaUnified |
| onboarding / registrace | RISK | Dva toky (body-metrics, assistant-intake); body-metrics má last-resort |
| meal generation | PASS | Spoonacular, dedup, fallback, trust-safe |
| workout generation | PASS | wger, canonical map, display_name_cs |
| localization | PASS | batchTranslateRecipeTitlesToCzech, getLocalizedRecipe, display_name_cs |
| renderer / profile | PASS | renderPlanHtmlFromStructured, data z HTML, bez Spoonacular při načtení |
| email output | PASS | Stejný HTML jako profil, formatPlanHtmlForEmail |
| replace flows | PASS | replace-meal, replace-workout – stejný model jako pipeline |
| API reliability | RISK | Timeout 55s, fallback OK, ale žádný circuit breaker |
| quota / request economy | PASS | Spoonacular optimalizace, budget 60 |

| Oblast | Status | Poznámka |
|--------|--------|----------|
| observability | RISK | Logy, _diagnostics, ale žádný centralizovaný monitoring |
| maintainability | PASS | Čitelný kód, oddělené vrstvy |
| UX / trust | RISK | „Jídlo (neověřeno)“ může působit negativně; chybí retry CTA |
| monetization readiness | RISK | Memberships, trial – ale upgrade flow nejasný |

---

## 4. Největší technické dluhy

| # | Problém | Dopad | Priorita | Náročnost | Řešení |
|---|---------|-------|----------|-----------|--------|
| 1 | Dva registrační toky (body_metrics vs registrations) | Duplicita, matoucí data | Vysoká | Střední | Sjednotit na body_metrics |
| 2 | mealsOnly neimplementováno | profile-preferences při změně stravy generuje celý plán | Střední | Nízká | Přidat mealsOnly do planOrchestrator |
| 3 | Žádné E2E testy | Regrese při změnách | Vysoká | Střední | Playwright smoke test |
| 4 | fastMode pro initial_plan | Delší generování při registraci | Střední | Nízká | Přidat fastMode v executeTrainerTask |
| 5 | onboarding/generate-plan volá generateStructuredPlan přímo | Odchylka od unified pipeline | Nízká | Nízká | Přepojit na runUnifiedPlanPipeline |
| 6 | Žádný circuit breaker pro Spoonacular | Při 429 může systém dál volat | Střední | Střední | Circuit breaker po 3× 429 |
| 7 | Profil 5000+ řádků | Těžká údržba | Nízká | Vysoká | Rozdělit na komponenty |
| 8 | Migrace v supabase/migrations smazány | Možné chyby při deploy | Vysoká | ? | Ověřit stav migrací |
| 9 | Žádný centralizovaný monitoring | Těžké odhalení problémů v produkci | Střední | Střední | Sentry, Vercel Analytics |

*(Cache v planOrchestrator záměrně nepoužívána – žádná cache v pipeline.)*

---

## 5. Největší product problémy

| # | Problém | Dopad na uživatele | Dopad na konverzi | Doporučení |
|---|---------|-------------------|-------------------|------------|
| 1 | „Plán se nepodařilo vytvořit“ bez CTA | Frustrace, odchod | Nízká konverze | Retry tlačítko „Zkusit znovu“ |
| 2 | „Jídlo (neověřeno)“ působí negativně | Nedůvěra v AI | Střední | Změnit na „Doporučené jídlo“ nebo „Nahradit“ |
| 3 | Dlouhé čekání bez progress | Nejasnost, ztráta trpělivosti | Střední | Progress indikátor „Generuji plán…“ |
| 4 | E-mail selže – uživatel neví | Plán v profilu, ale uživatel to neví | Střední | „Plán je v profilu – přihlas se“ |
| 5 | planPending – profil prázdný | Uživatel vidí prázdný profil | Vysoká | „Plán se generuje – obnov za minutu“ |
| 6 | Nákupní seznam prázdný při neověřených | Uživatel nemá seznam | Nízká | Empty state „Přidej ověřená jídla“ |
| 7 | Trial end – co dál? | Nejistota | Nízká | Upgrade flow, clear CTA |
| 8 | Dva formuláře (start vs assistant-intake) | Zmatení | Nízká | Sjednotit nebo jasně oddělit |
| 9 | Mindset placeholder | Generické „Drž se plánu“ | Nízká | Personalizovat z OpenAI |
| 10 | Habit tracker oddělený od plánu | Chybí propojení | Nízká | Propojit s „dodržováním plánu“ |

---

## 6. Roadmap

### H1 – okamžitě (1–7 dní)

1. **Přidat fastMode pro initial_plan** v executeTrainerTask – snížit latency při registraci.
2. **Retry CTA** – při chybě plánu zobrazit „Zkusit znovu“ s odkazem na retry-initial-plan.
3. **Ověřit migrace** – zda smazané migrace v supabase/migrations nejsou potřeba.
4. **Smoke test** – ruční nebo skript: registrace → plán → profil.
5. **E-mail fallback copy** – „Plán je v profilu – přihlas se“ při emailFailedPlanReadyMsg.

### H2 – krátkodobě (2–4 týdny)

1. **mealsOnly** – implementovat v planOrchestrator, předat z generatePlanForEmail.
2. **E2E smoke test** – Playwright: registrace → plán → profil.
3. **Progress indikátor** – „Generuji plán…“ na /start při čekání.
4. **Přátelštější copy** – „Jídlo (neověřeno)“ → „Doporučené jídlo“ nebo „Nahradit jídlo“.
5. **Circuit breaker** – pro Spoonacular po 3× 429.

### H3 – střednědobě (1–3 měsíce)

1. **Sjednotit registrační tok** – body_metrics jako jediný zdroj, assistant-intake zapisuje do body_metrics.
2. **Canonical meal catalog** (volitelně) – pokud relevance jídel zůstane problémem.
3. **Monitoring** – Sentry, Vercel Analytics, dashboard.
4. **Refaktor profilu** – rozdělit na menší komponenty.
5. **Trial end flow** – upgrade CTA, read-only plán po trial.
6. **Personalizovaný mindset** – z OpenAI místo placeholderu.

---

## 7. Brutálně upřímný verdikt

### Co je na systému opravdu dobré

- **Unified pipeline** – jeden vstupní bod, konzistentní flow.
- **Trust-safe obrázky** – image_url jen při exact match.
- **Lokalizace** – display_name_cs, getLocalizedRecipe, česky všude.
- **Fallbacky** – šablona jídel z profilu; workout přes `getDeterministicWorkoutPlan` když chybí `workout_plan.days`; plná `getDeterministicMealPlan` rotace se v orchestrátoru nepoužívá; last-resort HTML jinde v aplikaci.
- **Spoonacular optimalizace** – dedup, budget 60, instrumentace.
- **Replace flows** – stejný model jako pipeline.

### Co je zatím jen „vypadá dobře“

- **„Všechny vstupy vedou do unified pipeline“** – onboarding/generate-plan volá generateStructuredPlan přímo.
- **mealsOnly** – parametr existuje, ale planOrchestrator ho ignoruje.
- **E2E testy** – checklist existuje, automatizace ne.

### Co bych bez milosti přepsal

- **Profíl** – 5000+ řádků v jednom souboru; rozdělit na moduly.
- **Dva registrační toky** – sjednotit na body_metrics.
- **Chybová UX** – „Plán se nepodařilo vytvořit“ bez CTA je nepřijatelné.

### Co bych jako majitel produktu řešil jako úplně první

**Cíl: AI + API → jídelníček + tréninkový plán musí fungovat na sto procent.**

1. **Retry CTA** – při selhání plánu dát uživateli „Zkusit znovu“. Bez toho uživatel zůstane bez plánu. Náročnost: 1 den.
2. **fastMode pro initial_plan** – zkrátit čekání při registraci, snížit riziko timeoutu. Náročnost: 0.5 dne.
3. **E2E smoke test** – ověřit, že core flow (registrace → plán → profil) funguje. Náročnost: 2–3 dny.
4. **Ověřit migrace** – zda smazané migrace nezpůsobují problémy při persist plánu. Náročnost: 0.5 dne.
5. ~~Cache v planOrchestrator~~ – záměrně nepoužívána, žádná cache.

---

*Konec auditu.*
