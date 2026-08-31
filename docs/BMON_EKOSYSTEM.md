# Jeden ekosystém — co chybí a co už tam je

Změřeno 31. 8. 2026 na produkci.

## Nález: ekosystém je postavený a vypnutý

V databázi je kompletní řetěz `ai_events` → `ai_trigger_rules` → `ai_tasks`
→ exekutory → agenti. Pravidel je sedm. Zapnuté je jedno:

```
trigger_type        task_type                enabled
user_registered  →  initial_plan             true
missing_plan     →  initial_plan             false
weight_stagnation→  adjust_plan              false
high_stress      →  reduce_training_load     false
high_stress      →  recovery_message         false
low_adherence    →  motivation_message       false
progress_good    →  positive_reinforcement   false
```

Všech sedm má `created_at` = `updated_at` = **10. 3. 2026**. Od založení
se jich nikdo nedotkl.

Provoz to potvrzuje — za celou historii vznikly jen tři typy úloh:

```
initial_plan          25×   naposledy 31. 8.
onboarding_message    20×   naposledy 31. 8.
weekly_plan_update     4×   naposledy 28. 8.
```

Ani jeden `adjust_plan`, `recovery_message` ani `motivation_message`.
Nikdy.

**Systém zareaguje na člověka přesně jednou za život — při registraci.**

K tomu je od 24. 8. vypnutý týdenní producer (vypnuli jsme ho vědomě,
dělal nepořádek), takže ekosystém nemá ani tep.

## Proč je to příčina, ne další nález

Skoro každý nález z auditu 31. 8. (`docs/AUDIT_PRAVDIVOSTI_2026-08-31.md`)
je jen jiný pohled na tohle:

| co se stalo | co se mělo stát | co se stalo doopravdy |
|---|---|---|
| oprava výšky 182 → 194 | přepočet cíle a plánu | plán zůstal 18 dní starý |
| cíl 2164 → 2634 | nový jídelníček | jídelníček na starém čísle |
| HRV spadlo 55 → 12 | reakce na zátěž | nic |
| watchdog hlásí nesoulad | někdo to spraví | hlásí to do prázdna |

Appka data **sbírá** a **zobrazuje**. Nereaguje na ně. To je rozdíl mezi
dashboardem a trenérem — a Body & Mind ON prodává trenéra.

## Co „jeden ekosystém" znamená

Tři vlastnosti, v tomhle pořadí:

**1. Jeden zdroj pravdy pro každý fakt.** Z velké části hotovo (etapy
6.5, 6.7, 7.2): výška, kalorický cíl, makra i BMI mají po dnešku jedno
místo, odkud se čtou. Zbývá dodělat, ne začínat.

**2. Propagace.** Změna zdrojového faktu musí přestavět všechno, co z něj
vychází — plán, nákupní seznam, e-mail, kontext pro TEDa. Dnes to nedělá
nic. Banner „Přegenerovat jídelníček" z bodu 7.2a je ruční náhražka za
propagaci, ne cílový stav.

**3. Uzavřená smyčka.** `system_health_alerts` už umí poznat, že je něco
rozbité. Dnes to nikam nevede.

## Baseline

Zapnout to, co existuje. Žádná nová infrastruktura.

- **8.1** Nová událost `target_changed` — vzniká, když se změní
  `body_metrics.calories_target`. Zapnout pravidlo `missing_plan`.
- **8.2** Vrátit týdenní producer, ale s pojistkou proti tomu, co ho
  vyplo (viz `docs/BMON_BACKLOG_ODLOZENE.md`).
- **8.3** Watchdog jako zdroj událostí — `system_health_alerts` →
  `ai_events`.

## Scale

- Zbylá pravidla (`weight_stagnation`, `high_stress`, `low_adherence`).
- `conditions_json` — dnes `null` u všech sedmi, takže pravidla neumí
  říct „jen když". Bez toho se nedá bezpečně zapnout nic, co reaguje na
  měření.
- Napojení Withings a Apple Health jako zdrojů událostí, ne jen dat.

## Riziko, které rozhoduje o tempu

Zapnutá automatika, která lidem přepisuje plány pod rukama, je **horší
než dnešní nečinnost**. Proto:

- zapínat po jednom pravidle, ne najednou;
- každé nechat nejdřív běžet v režimu **„navrhni, nezasahuj"** — přesně
  jako banner z 7.2a: systém pozná, že je něco rozjeté, řekne to a čeká
  na člověka;
- teprve co se v tomhle režimu osvědčí, může zasahovat samo.

## Otevřené rozhodnutí — patří Honzovi, ne architektuře

**Kde je hranice mezi „appka to udělá sama" a „appka se zeptá."**

Návrh k diskusi:

```
chybí plán úplně          → udělá sama, ptát se nemá co
změna kalorického cíle    → zeptá se (jídelníček je týden práce navíc)
stagnace váhy 3 týdny     → navrhne, nezasahuje
špatné HRV několik dní    → navrhne, nezasahuje
nízká adherence           → jen zpráva, žádný zásah do plánu
```

Tohle je produktové rozhodnutí. Technicky jde obojí.
