-- Připravuje (nezapíná) reakci na změnu kalorického cíle.
--
-- docs/DALSI_KROK.md 8.1+8.3, Fáze A. Nová událost `target_changed`
-- (lib/calorieTargetIntegrity.js, emitCalorieTargetChangedEvent) vznikne,
-- kdykoli se `body_metrics.calories_target` opravdu změní. Aby z ní
-- `lib/aiDecisionEngine.js` (loadTriggerRules) vůbec mohl udělat úlohu pro
-- trenéra, musí v `ai_trigger_rules` existovat řádek `target_changed →
-- adjust_plan` — bez něj by událost skončila ve frontě `ai_events` a nikdy
-- dál. Tahle migrace ten řádek zakládá.
--
-- OBĚ PRAVIDLA NÍŽE ZŮSTÁVAJÍ `enabled = false`. Zapneme je ručně a po
-- jednom, až Honza ověří chování na produkci — viz docs/BMON_EKOSYSTEM.md,
-- „Riziko, které rozhoduje o tempu": zapnutá automatika, která lidem
-- přepisuje plány pod rukama, je horší než dnešní nečinnost.
--
-- MISSING_PLAN → INITIAL_PLAN NA PRODUKCI JE TENHLE INSERT ČISTÝ NO-OP.
-- Řádek tam existuje od 10. 3. 2026 (vznikl ručně, docs/BMON_EKOSYSTEM.md,
-- `enabled = false` dodnes) — `WHERE NOT EXISTS` ho najde a INSERT se
-- neprovede. Migrace mu na produkci nepřipravuje nic nového, jen ho
-- neopakuje. Cenu má jinde: `baseline_schema.sql` je pg_dump
-- --schema-only, takže na ČERSTVÉ DB (branch, staging, CI) je
-- `ai_trigger_rules` prázdná a bez týhle migrace by tam `missing_plan`
-- řádek vůbec nebyl — tohle je jediné místo, které ho vůbec zakládá. Tabulka
-- navíc nemá UNIQUE (trigger_type, task_type), takže bez `WHERE NOT EXISTS`
-- by INSERT na produkci existující řádek tiše zdvojil.
--
-- PRIORITY = 10, NE 100. Změřeno v `ai_trigger_rules` na produkci: řádek
-- `missing_plan → initial_plan` tam má `priority = 10`. Migrace má tvrdit,
-- že na čerstvé DB založí TÝŽ řádek jako na produkci (viz odstavec výš) —
-- s jinou hodnotou priority by to nebyla pravda a `WHERE NOT EXISTS` by to
-- ani neopravilo (kontroluje jen `trigger_type`/`task_type`, ne `priority`).
-- Opakovaný problém tohohle repa: migrace a produkce se v datech rozejdou,
-- viz docs/BMON_MIGRACE_DRIFT.md.
--
-- TARGET_CHANGED → ADJUST_PLAN je nové pravidlo. `conditions_json` zůstává
-- NULL: práh, od jaké velikosti změny cíle se má reagovat, je součástí
-- Fáze B (docs/DALSI_KROK.md 8.3, bod 5 → docs/BMON_MAKRA_V_GENERATORU.md),
-- ne téhle migrace. I po doplnění prahu bude potřeba ještě jedna věc mimo
-- migraci: `lib/aiDecisionEngine.js` (`buildTriggerState`/`ruleMatches`) dnes
-- zná jen pevný seznam trigger_type hodnot (`missing_plan`,
-- `user_registered`, `weight_stagnation`, `low_adherence`, `high_stress`,
-- `progress_good`) — `target_changed` mezi nimi není, takže i po zapnutí
-- `enabled = true` by řádek zatím nevytvořil žádnou úlohu. To je vědomě
-- mimo tuhle migraci (ta jen připravuje data, ne kód vyhodnocení).
--
-- KOLIZE S weight_stagnation NENÍ OTEVŘENÁ OTÁZKA — S DNEŠNÍMI ČÍSLY JE
-- ROZHODNUTÁ. Obě pravidla míří na `trainer:adjust_plan`. `loadTriggerRules()`
-- (lib/aiDecisionEngine.js) řadí `.order('priority', { ascending: true })`
-- a `evaluateUserState()` dá klíč `agent_slug:task_type` PRVNÍMU matchnutému
-- pravidlu v tomhle pořadí — ne že by o tom rozhodovalo něco jiného.
-- `weight_stagnation` má `priority = 20`, `target_changed` v týhle migraci
-- `priority = 100`: kdyby byla někdy zapnutá obě zároveň,
-- `weight_stagnation` vyhraje VŽDY a `target_changed` NIKDY neprojde jako
-- `reason`/prompt do vytvořené úlohy — bez ohledu na to, který z důvodů
-- nastal jako první nebo je naléhavější.
--
-- Číslo `100` tu zůstává záměrně, ne z nedbalosti: nemá cenu ho ladit v
-- migraci, která `target_changed` stejně nezapíná. Volba správné priority
-- (a `conditions_json`, který teprve umožní pravidlu říct „jen když") patří
-- do Fáze B (docs/DALSI_KROK.md 8.3, bod 5) spolu s rozhodnutím, jestli má
-- změna cíle vůbec smět přebít probíhající řešení stagnace váhy, nebo
-- naopak.

INSERT INTO public.ai_trigger_rules (trigger_type, task_type, agent_slug, priority, conditions_json, enabled)
SELECT 'missing_plan', 'initial_plan', 'trainer', 10, NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_trigger_rules
  WHERE trigger_type = 'missing_plan' AND task_type = 'initial_plan'
);

INSERT INTO public.ai_trigger_rules (trigger_type, task_type, agent_slug, priority, conditions_json, enabled)
SELECT 'target_changed', 'adjust_plan', 'trainer', 100, NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_trigger_rules
  WHERE trigger_type = 'target_changed' AND task_type = 'adjust_plan'
);
