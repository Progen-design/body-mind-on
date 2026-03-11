# Kompletní audit projektu Body & Mind ON (březen 2026)

**Režim:** Tvrdý, důsledný audit podle skutečného stavu repozitáře.  
**Zdroje:** Pouze aktuální kód a dokumentace v repo; žádné staré shrnutí ani domněnky.

---

## PART 1 — Executive summary

Projekt má **silné jádro**: trainer flow (registrace → plán → e-mail), event/task pipeline, trusted asset vrstva (meal/exercise), governance dokumentace a konzistentní použití agentů. **Hlavní rizika:** (1) planner závisí na křehkém parsování HTML/JSON z AI; (2) marketing/social jsou technicky zapojené, ale produktově nedokončené a snadno mohou být prezentovány jako hotové; (3) právní a monetizační vrstva zaostává za technikou; (4) mrtvý kód a duplicity (getAIConfig); (5) profil neukládá enrichment do plánu – UI enrichment je vždy on-demand, což může vést k nesouladu mezi e-mailem a profilem.

**Doporučení:** Opravit P0 (planner robustnost, nepředstírat hotové moduly), zmrazit marketing/social rozvoj, monetizovat nejdřív trainer + profil + habit/workout.

---

## PART 2 — Hlavní silné stránky

| Oblast | Skutečný stav v kódu |
|--------|----------------------|
| **Trainer jako hlavní agent** | `getAgentConfig('trainer')` vrací gpt-4.1, DB seed (20260316) definuje jasnou roli; `runAgent` volá pouze trainera pro plán; taskExecutors má jediný vstup pro plán = trainer. |
| **Event → decision → task pipeline** | `ai_events` → `processPendingAIEvents` → `evaluateUserState` → `createAITasksFromDecisions` → `ai_tasks` → `runAIScheduler` → `executeAITask`. Idempotence přes `idempotency_key`, deduplikace pending tasks. |
| **Trusted asset layer** | `mealEnrichment.js`: Spoonacular 0.75 threshold → exact; Pexels vždy illustrative. `exerciseEnrichment.js`: registry + ExerciseDB → exact; Pexels → fallback. Cache TTL podle trust level. |
| **UI pravdivost** | `PlanViewer.js` zobrazuje `image_trust_level` / `trust_level` a labely „Přesný zdroj“, „Ilustrační foto“, „Ověřený cvik“. Fallback DISH_IMAGES použit jen když není trust metadata. |
| **Cron / admin auth** | `run-scheduler.js` a `daily-digest.js` vyžadují `CRON_SECRET` Bearer. Admin `agents.js` vyžaduje `ADMIN_TOKEN` (query/body/header). |
| **Dokumentace vs. kód** | `AI_AGENT_GOVERNANCE.md`, `TRUSTED_ASSET_RESOLUTION.md`, `PRODUCT_AND_MONETIZATION_GAPS.md`, `STRATEGIC_RISK_REGISTER.md` odpovídají skutečnosti (marketing/social = draft-stage, legal gap). |
| **Retry a DLQ** | Scheduler: budget defer, retry backoff, DLQ po max attempts. ai_events: retry s next_retry_at, DLQ po selhání. |
| **Validátoři** | nutrition_validator a training_validator voláni z taskExecutors před publikací plánu; corrected_html může nahradit výstup. |

---

## PART 3 — Hlavní slabiny (podle oblasti)

### A. AI / planner / parsing

| Problém | Kde | Proč je to problém | Dopad | Typ | Oprava |
|--------|-----|--------------------|-------|-----|--------|
| **HTML z AI je odvozen dvěma cestami** | `generatePlan.js`: buď `extractJsonFromAiOutput` → `parsed.html`, nebo `extractHtmlFromAiOutput(rawContent)` | Když model vrátí neplatný JSON nebo smíšený obsah, fallback stripuje ```html/``` a hledá HTML; struktura může být nekonzistentní. | Prázdný nebo rozbitý plán v e-mailu/DB | AI kvalita, runtime | Jednotný kontrakt: vždy požadovat JSON s polem `html`; při selhání parsování explicitní retry s instrukcí „pouze JSON“. |
| **Žádná validace délky/struktury plánu před odesláním** | `generatePlanForEmail`: po `enrichTrainingSection` se plán uloží a odešle bez kontroly, že obsahuje např. Jídelníček a Trénink | Uživatel může dostat e-mail s minimálním nebo prázdným obsahem. | UX, důvěra | Runtime, UX | Přidat minimální kontrolu: např. že `planHtml` obsahuje alespoň `<h3` a délku > 200 znaků; jinak neposílat e-mail nebo poslat „Plán se dokončuje, otevři aplikaci“. |
| **extractHtmlFromAiOutput je heuristika** | `generatePlan.js`: řetězec replace pro ```html, ```, „html“ prefix | Křehké vůči změně formátu výstupu modelu. | Nestabilita plánu | Architektura | Preferovat pouze JSON path; pokud musí zůstat fallback, izolovat do jedné funkce a logovat když se použije. |

### B. Enrichment / trusted assets

| Problém | Kde | Proč je to problém | Dopad | Typ | Oprava |
|--------|-----|--------------------|-------|-----|--------|
| **Enrichment se neukládá do ai_generated_plans** | `generatePlan.js`: volá `enrichPlanContent({ html: planHtml })`, výsledek se nepředává do `plan_plan` / `exercises_data` v insertu | V DB je jen `plan_html`; `meal_plan: {}`, `exercises_data: {}`. Profil pak musí volat `/api/plan-enrichment` s HTML a matching meal/exercise je podle normalizovaného klíče – může se rozcházet s tím, co bylo v době generování. | Možná nekonzistence mezi e-mailovým obsahem a profilem; opakované volání API při každém načtení profilu | Architektura, trust | Ukládat do plánu aspoň `meal_plan` a `exercises_data` (enrichment snapshot) při generování; API může zůstat pro re-enrichment. |
| **PlanViewer matching klíčů** | `PlanViewer.js`: `getEnrichedMealImage` / `getEnrichedMealTrust` – „nejdelší shoda“ mezi normalizovaným textem jídla a klíči z API | Pokud AI změní formulaci jídla oproti parsovanému názvu v enrichPlanContent, mapování může selhat a zobrazí se placeholder. | Občas chybějící nebo špatný obrázek u jídla | UX, trust | Zdokumentovat pravidla matchování; zvážit ukládání mapování query_name → enrichment v plánu. |
| **exerciseCanonicalMap má omezenou sadu** | `exerciseCanonicalMap.js`: 17 canonical exercises | Cviky mimo mapu spadají do free-text nebo Pexels fallback. To je záměr, ale počet 17 je nízký pro „všechny cviky v plánu“. | Častý „Ilustrační foto“ u cviků | Trust | Rozšířit mapu na běžné cviky z plánů; nebo v UI jasně uvádět „ilustrační“ u ne-mapovaných. |

### C. Frontend / UX

| Problém | Kde | Proč je to problém | Dopad | Typ | Oprava |
|--------|-----|--------------------|-------|-----|--------|
| **Profil načítá plán a enrichment zvlášť** | `profil.js` + `PlanViewer` + `useProfileData`: plán z API, enrichment přes plan-enrichment s HTML | Dva zdroje pravdy; při chybě enrichment API může být plán bez obrázků nebo s placeholdery. | Rozdílný dojem o kvalitě mezi e-mailem a profilem | UX | Sjednotit: buď ukládat enrichment v plánu a číst z něj, nebo mít jeden endpoint „plan + enrichment“. |
| **DISH_IMAGES v PlanViewer jsou statické Unsplash** | `PlanViewer.js`: pole DISH_IMAGES s keys a URL | Když backend vrátí `trust_level: none` a žádný image_url, frontend použije DISH_IMAGES; komentář říká „Ilustrační foto“. Pokud se někde nezobrazí label, uživatel může myslet, že jde o „přesný“ obrázek. | Riziko nesprávného dojmu | Trust | Ujistit se, že při použití DISH_IMAGES se vždy zobrazí „Ilustrační foto“ (nebo ekvivalent). Ověřit v kódu. |
| **Mobilní render** | Velký soubor `PlanViewer.js` (2600+ řádků), mnoho podmínek | Těžší údržba; riziko rozdílného chování na mobilu. | Údržba, UX | Technický dluh | Rozdělit na menší komponenty; mít jeden smoke test pro mobil viewport. |

### D. DB / migrace

| Problém | Kde | Proč je to problém | Dopad | Typ | Oprava |
|--------|-----|--------------------|-------|-----|--------|
| **getAgentConfig vyžaduje sloupce z pozdější migrace** | `getAgentConfig.js`: loadExtendedConfig volá `context_profile_slug, executor_group, artifact_type` | Pokud migrace 20260316 nebyla spuštěna po starších, nebo DB nemá tyto sloupce, fallback na loadBasicConfig je správně; ale první dotaz selže a loguje error. | Šum v logách, mírné zpoždění | Ops | OK jako je; dokumentovat pořadí migrací. |
| **ai_agents CREATE TABLE v 20260316** | 20260316_ai_agents_governed_seed.sql: create table if not exists ai_agents | Migrace předpokládá, že tabulka může neexistovat. Starší migrace (20260310, 20260312) ji mohly vytvořit s jiným schématem. | Možná nekonzistence mezi prostředími | Ops | V jednom místě (nebo v pořadí migrací) mít kanonické „full schema“ pro ai_agents. |
| **user_checkins existuje** | 20260304: create table if not exists user_checkins | analyzeUserProgress na ní závisí. Pokud by 20260304 nebyl aplikován, progress_analysis by byl prázdný. | Decision engine by neměl weight_change / adherence | Ops | Checklist: user_checkins musí být v DB před nasazením decision engine. |

### E. Agent / scheduler / autonomy

| Problém | Kde | Proč je to problém | Dopad | Typ | Oprava |
|--------|-----|--------------------|-------|-----|--------|
| **run-scheduler volá generateAITasks + processAIEvents + runAIDecisionEngine + runAIScheduler v jednom requestu** | `pages/api/ai/run-scheduler.js` | Při velkém počtu uživatelů nebo událostí může request timeoutovat (Vercel limit). | Částečné zpracování, opakované runy | Ops, reliability | Rozdělit na cron joby: (1) generateAITasks, (2) processAIEvents, (3) runAIDecisionEngine, (4) runAIScheduler; nebo zvýšit MAX_TASKS_PER_RUN a akceptovat více runů za den. |
| **Decision engine načítá všechny uživatele z body_metrics po stránkách** | `runAIDecisionEngine.js`: range(from, to) po 500, max 12 stránek = 6000 uživatelů max | Pro každého volá evaluateUserState a createAITasksFromDecisions. N+1 dotazů. | Pomalý cron, možné timeouty | Reliability | Batch evaluate nebo cache body_metrics snapshot; nebo omezit na „aktivní“ uživatele (např. s aktivitou za posledních 30 dní). |
| **Coach zprávy nejsou v UI jako produktový flow** | Backend: coach message insert do ai_messages; frontend: žádná dedikovaná sekce „Zprávy od kouče“ | Dokumentace (PRODUCT_AND_MONETIZATION_GAPS) to uvádí; kód to potvrzuje. | Hodnota coachu není pro uživatele viditelná | Produkt | Nepředstírat hotové; buď postavit jednoduchou UI (inbox / bubliny), nebo explicitně neprezentovat coach jako hotový modul. |

### F. Marketing / Social

| Problém | Kde | Proč je to problém | Dopad | Typ | Oprava |
|--------|-----|--------------------|-------|-----|--------|
| **Prezentace jako hotové** | taskExecutors.js má executeMarketingTask, executeSocialTask; ai_agents seed obsahuje marketing, social | Pokud někdo v komunikaci řekne „máme AI marketing a social“, je to nepravdivé – neexistuje workflow schvalování ani publikace. | Reputační, právní | Business, legal | Neprezentovat ven jako hotové; v docs to již je (STRATEGIC_RISK_REGISTER, PRODUCT_AND_MONETIZATION_GAPS). Zkontrolovat všechny veřejné texty a landing page. |
| **Zbytečná složitost** | Decision engine a task registry obsahují campaign_brief, social_post | Pro aktuální produkt (trainer + coach + profil) tyto tasky nepřinášejí měřitelnou hodnotu. | Technický dluh | Architektura | Zmrazit rozvoj; neodstraňovat kód (může sloužit později), ale neprioritizovat. |

### G. Security / privacy / legal

| Problém | Kde | Proč je to problém | Dopad | Typ | Oprava |
|--------|-----|--------------------|-------|-----|--------|
| **ADMIN_TOKEN v query/body** | `pages/api/admin/agents.js`: key z query nebo body | Token v URL se může objevit v logách nebo referrer. | Únik tokenu | Security | Pouze header Authorization: Bearer; query/body odstranit nebo deprecovat. |
| **Citlivá data v logách** | `generatePlan.js`: console.log('📊 Načtené metriky:', bm) | bm obsahuje výška, váha, věk, e-mail. V produkci by nemělo jít do stdout. | GDPR, soukromí | Privacy | Odstranit nebo nahradit za hash/ID; logovat pouze „user_id nebo email hash“. |
| **Právní vrstva** | STRATEGIC_RISK_REGISTER.md Risk B | Dokumentace konstatuje, že právní vrstva zaostává. | Riziko při škálování a placených kampaních | Legal | Neřešit v kódu; vlastník musí uzavřít právní dokumenty a compliance před masivním nasazením. |

### H. Ostatní technický dluh

| Problém | Kde | Proč je to problém | Dopad | Typ | Oprava |
|--------|-----|--------------------|-------|-----|--------|
| **Mrtvý modul getAIConfig.js** | `lib/getAIConfig.js` exportuje getAIConfig; nikde se neimportuje | Zbytečný soubor; může plést budoucí vývojáře. | Skladba, čitelnost | Technický dluh | Odstranit nebo sloučit s getAgentConfig, pokud byl záměr „obecná AI konfigurace“. |
| **Duplicitní cesta k agent config** | getAgentConfig (per-agent) vs getAIConfig (globální?) | Jen getAgentConfig se používá. | Konzistence | Technický dluh | Používat pouze getAgentConfig; getAIConfig odstranit. |

---

## PART 4 — Kritické oblasti (samostatné hodnocení)

### 1. Trainer jako hlavní produkt  
**Verdikt: Silný.**  
Je jediný agent generující plán; prompt v DB i fallback zdůrazňují „jediný planner“, diet_type, preferences, shared_memory. Slabina je **stabilita výstupu** (JSON vs. raw HTML) a **absence minimální validace před odesláním e-mailu**.

### 2. Coach  
**Verdikt: Backend OK, produkt ne.**  
Nepřerůstá do planneru; system prompt to zakazuje. Shared memory je grounded (user_ai_memory, source_agent_slug). Business hodnota není dostatečně využita – chybí viditelný UX pro zprávy.

### 3. Marketing / Social  
**Verdikt: Draft enginy, ne hotové moduly.**  
V kódu i v docs jsou označeni jako draft-stage. Output kontrakty dávají smysl (content_draft_insert). Nesmí být prezentováni jako hotový business.

### 4. Trusted asset layer  
**Verdikt: Implementace odpovídá docs.**  
Meal: exact (Spoonacular ≥0.75), illustrative (Pexels), none. Exercise: exact (registry/ExerciseDB), fallback (Pexels). PlanViewer zobrazuje labely. Jediné riziko: enrichment není uložen v plánu → možný rozpor mezi e-mailovým obsahem a profilem při opakovaném načtení.

### 5. Planner contract  
**Verdikt: Křehký.**  
generatePlan flow je funkční, ale závisí na heuristikách extractHtmlFromAiOutput a na tom, že model vrátí validní JSON. Retry pro diet/gluten je dobrý; chybí guard na prázdný nebo příliš krátký plán před odesláním.

### 6. Scheduler / events / autonomy  
**Verdikt: Dává smysl.**  
ai_tasks a ai_events mají smysl; decision engine nevytváří chaos (pravidla z DB nebo hardcoded). Retry/DLQ a stale recovery jsou. Možné race: dva cron runy současně – claim přes status=processing to omezuje. Doporučení: oddělit kroky cronu, aby jeden request nedělal všechno.

### 7. Frontend truthfulness  
**Verdikt: Dobré.**  
Placeholdery a labely odpovídají backendu (exact / illustrative / none). Riziko: při chybějícím enrichment API může být zobrazen pouze placeholder bez labelu – ověřit, že „Ilustrační foto“ je vždy u DISH_IMAGES.

### 8. Security / privacy / legal  
**Verdikt: Částečně.**  
Cron auth je. Admin token v query/body je riziko. Logování bm v generatePlan je riziko. Právní vrstva je mimo kód – dokumentována v STRATEGIC_RISK_REGISTER.

### 9. Product / monetization  
**Verdikt: V souladu s PRODUCT_AND_MONETIZATION_GAPS.**  
Hotový produkt = trainer + plán + e-mail + profil + habit + workout. Technologicky hotové, ale ne produktově: coach UI, marketing/social workflow. Přebuilděné: marketing/social pipeline bez business definice. Zmrazit: další rozvoj marketing/social. Monetizovat první: trainer + plán + profil + upgrade na ON Club/VIP s jasnou diferenciací.

---

## PART 5 — Priority (P0 / P1 / P2)

### P0 — Kritické

| # | Problém | Dopad | Doporučená oprava | Effort |
|---|---------|-------|--------------------|--------|
| 1 | E-mail s prázdným nebo minimálním plánem | Uživatel dostane „plán“ bez jídelníčku/tréninku → ztráta důvěry | Před odesláním e-mailu zkontrolovat, že planHtml má rozumnou délku a obsahuje klíčové sekce (např. Jídelníček nebo Trénink); jinak neposílat nebo poslat krátkou zprávu „Plán se připravuje“ | S |
| 2 | Admin token v URL/body | Token může uniknout do logů/referrer | Auth pouze přes Authorization: Bearer | S |
| 3 | Logování citlivých metrik (bm) v generatePlan | GDPR, únik osobních údajů | Nelogovat bm; nebo jen hash/ID | S |
| 4 | Marketing/Social prezentované jako hotové | Reputace, právní riziko | Explicitně neprezentovat; zkontrolovat veřejné texty a landing | M (kontrola + úpravy textů) |

### P1 — Důležité

| # | Problém | Dopad | Doporučená oprava | Effort |
|---|---------|-------|--------------------|--------|
| 5 | Enrichment není uložen v plánu | Rozdíl mezi e-mailem a profilem; opakované volání API | Ukládat do ai_generated_plans pole meal_plan a exercises_data (enrichment snapshot) při generování | M |
| 6 | Jediný cron endpoint dělá vše (generateAITasks + events + decisions + scheduler) | Timeout při větším zatížení | Rozdělit na 2–4 cron joby nebo snížit batch size a akceptovat více runů | M |
| 7 | Parsování HTML/JSON z AI křehké | Nestabilita plánu při změně formátu modelu | Preferovat striktně JSON s polem html; při selhání retry s instrukcí; logovat když se použije extractHtmlFromAiOutput | M |
| 8 | Coach zprávy nejsou v UI | Nízká vnímaná hodnota coachu | Buď jednoduchá sekce „Zprávy od kouče“, nebo neprezentovat coach jako hlavní feature | L |
| 9 | PlanViewer při fallbacku na DISH_IMAGES | Musí vždy zobrazit „Ilustrační foto“ | Ověřit a doplnit label tam, kde chybí | S |

### P2 — Vylepšení

| # | Problém | Dopad | Doporučená oprava | Effort |
|---|---------|-------|--------------------|--------|
| 10 | getAIConfig.js nepoužit | Zbytečný soubor | Odstranit nebo sloučit | S |
| 11 | Decision engine prochází všechny uživatele | Pomalý cron | Omezit na aktivní uživatele nebo batch/cache | M |
| 12 | Rozdělení PlanViewer.js | Údržba, čitelnost | Rozdělit na menší komponenty | L |
| 13 | Rozšíření exerciseCanonicalMap | Méně „ilustračních“ cviků | Přidat běžné cviky z plánů | M |

---

## PART 6 — Návrh dalšího postupu

### A. Opravit hned
- P0-1: Guard na minimální obsah plánu před odesláním e-mailu.
- P0-2: Admin auth pouze Bearer header.
- P0-3: Odstranit nebo anonymizovat logování bm v generatePlan.
- P0-4: Kontrola veřejných textů – marketing/social neprezentovat jako hotové.

### B. Zmrazit
- Rozvoj marketing a social agentů (workflow, publikace, schvalování) – nedokud není produktová specifikace a právní/obchodní rozhodnutí.
- Přidávání dalších AI feature bez vyjasnění „hero feature“ a cenového modelu.

### C. Přepsat později
- Cron sloučení (rozdělit na více jobů) – při růstu uživatelů.
- PlanViewer rozbití na menší komponenty – při větších změnách UI.
- Ukládání enrichmentu do plánu – součást většího refaktoru „single source of truth pro plán“.

### D. Neprezentovat ven jako hotové
- Marketing modul (draft engine bez workflow).
- Social modul (stejně).
- Coach jako „plnohodnotný kouč“ bez viditelné UI pro zprávy.

### E. Monetizovat jako první
- Trainer + personalizovaný plán + e-mail (již existuje).
- Profil s plánem, návyky, tréninkové záznamy (již existuje).
- Jasná diferenciace START vs ON Club vs VIP a upgrade flow (podle PRODUCT_AND_MONETIZATION_GAPS).
- Ověření platby (Stripe) end-to-end před masivní akvizicí.

---

## PART 7 — Finální exekuční Cursor prompt

Následující blok je připraven ke zkopírování do Cursoru jako jeden konkrétní, prioritizovaný úkol.

---

```
KONTEXT: Projekt Body & Mind ON. Audit (docs/AUDIT_BODY_MIND_ON_2026.md) identifikoval P0 a vybrané P1 úkoly. Proveď pouze níže uvedené změny; neměň architekturu ani nerefaktoruj mimo uvedený rozsah.

ÚKOLY (v tomto pořadí):

1) P0 – Guard před odesláním plánu e-mailem (lib/generatePlan.js)
   - Před voláním sendPlanEmail zkontroluj, že planHtml je neprázdný string a má délku alespoň 200 znaků a obsahuje alespoň jeden z řetězců: "<h3", "Jídelníček", "Trénink" (nebo ekvivalent pro sekce plánu).
   - Pokud podmínka není splněna: nevolat sendPlanEmail; do ai_generated_plans stejně uložit plán (už je uložen výše v kódu); vrátit { ok: true, message: "Plán byl uložen. Obsah nebyl dostatečně kompletní pro e-mail – otevři aplikaci pro zobrazení." } nebo podobně. Logovat varování (console.warn) s důvodem.
   - Nepřidávej nové závislosti; pouze podmínka a větvení.

2) P0 – Admin API auth pouze přes Bearer header (pages/api/admin/agents.js)
   - Funkce isAdmin: ověřovat pouze req.headers.authorization ve tvaru "Bearer <ADMIN_TOKEN>".
   - Odstranit podporu key z query a body (nebo je ignorovat). Pokud request nemá platný Bearer token, vrátit 403 jako nyní.

3) P0 – Odstranit logování citlivých dat (lib/generatePlan.js)
   - Odstranit nebo změnit console.log('📊 Načtené metriky:', bm); buď úplně odstranit, nebo logovat pouze např. "Metriky načteny pro user_id / email (hash)" bez výšky, váhy, věku, e-mailu v čitelné podobě.

4) P1 – Trust label u fallbacku jídel (components/PlanViewer.js)
   - Kde se pro zobrazení obrázku jídla používá getMealImageByDish (nebo DISH_IMAGES fallback), ověř že se v UI zobrazí text "Ilustrační foto" (nebo stejný trust label jako u illustrative). Pokud tam label chybí, doplnit ho tak, aby uživatel vždy viděl, že jde o ilustraci, ne přesný zdroj.

5) Odstranit mrtvý modul (lib/getAIConfig.js)
   - Zkontroluj, že getAIConfig není importován nikde v projektu. Pokud není, soubor lib/getAIConfig.js smaž.

PRAVIDLA:
- Neměň chování mimo výše popsané (např. neměň logiku parsování HTML, neměň runAgent ani getAgentConfig).
- Testy nepiš, pokud v projektu nejsou zavedeny pro tyto cesty; pouze provedené změny by měly zůstat konzistentní s existujícím kódem.
- Po úpravách zkontroluj, že build (npm run build) projde.
```

---

## PART 8 — Shrnutí výstupů

| Výstup | Umístění |
|--------|----------|
| Executive summary | PART 1 |
| Silné stránky | PART 2 |
| Slabiny (tabulky) | PART 3 |
| Kritické oblasti (1–9) | PART 4 |
| P0 / P1 / P2 | PART 5 |
| Opravit hned / Zmrazit / Přepsat / Neprezentovat / Monetizovat | PART 6 |
| Finální exekuční Cursor prompt | PART 7 |

Dokument vznikl na základě skutečného stavu repozitáře k datu auditu. Při dalších změnách v kódu je vhodné audit aktualizovat.
