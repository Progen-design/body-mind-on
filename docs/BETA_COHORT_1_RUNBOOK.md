# START Closed Beta Cohort 1 — Runbook

## 1. Před náborem

- Ověř produkční deploy (`main`, READY, gitDirty false).
- Spusť `npm run report:beta-daily` a `npm run report:beta-activation`.
- Ujisti se, že cohort `START-C1` existuje a má status `recruiting`.
- Připrav 5 invite kódů (export pouze do `.local/`, gitignored).

## 2. Vytvoření invite

```bash
npm run beta:create-invites -- --cohort=START-C1 --count=5 --output=.local/beta-start-c1-invites.txt
```

## 3. Odeslání pozvánky

- Použij text z `docs/BETA_INVITE_COPY.md`.
- Každému účastníkovi jeden unikátní kód.
- Odkaz: `https://app.bodyandmindon.cz/beta`
- Neukládej plain kódy do logů ani commitů.

## 4. Validace registrace

- Denně kontroluj funnel v `npm run report:beta-daily`.
- Ověř, že participant má `registered_at` a `beta_terms_accepted_at`.
- Při zaseknutí: `CONTACT PARTICIPANT` (ruční kontakt, ne automat).

## 5. Denní kontrola reportu

```bash
npm run report:beta-daily -- --cohort=START-C1
```

## 6. Moderované sezení

- Postupuj podle `docs/BETA_COHORT_1_SESSION_GUIDE.md`.
- Záznam pouze se souhlasem.
- Poznámky do `docs/BETA_SESSION_NOTES_TEMPLATE.md` (aliasy, ne PII).

## 7. Zápis issue

```bash
npm run beta:add-issue -- --cohort=START-C1 --participant=C1-P01 --title="..." --category=daily_use --severity=medium --step="complete activity" --evidence="..."
```

## 8. Severity triage

- **blocker** — zastav nábor, kill-switch pokud systémové.
- **high** — musí mít ownera a rozhodnutí před Cohort 2.
- **medium/low** — evidovat, neblokovat release gate automaticky.

## 9. Fix process

- Během Cohort 1 **nepřidávej nové funkce** bez rozhodnutí v `beta_decisions`.
- Pouze blocker/high fixy s jasným scope.
- Po fixu aktualizuj issue status na `fixed` nebo `accepted`.

## 10. Cohort decision

```bash
npm run report:beta-cohort -- --cohort=START-C1
```

Rozhodnutí: GO TO COHORT 2 / FIX BEFORE COHORT 2 / STOP AND REWORK.

## 11. Cleanup

- Po ukončení cohorty status `completed` nebo `analyzing`.
- Data ponech pro analýzu.
- Smaž pouze lokální invite export po předání.

## 12. Incident process

1. Zaznamenej blocker issue.
2. Aktivuj kill-switch (viz níže).
3. Informuj admina.
4. Pokračuj až po lidském schválení.

## 13. Kill-switch

Pokud nastane:

- únik osobních dat,
- dietní hard constraint violation,
- opakovaná generace nebezpečného plánu,
- onboarding blocker pro více lidí,
- nekontrolované chyby API,
- nečekané aktivace placeného členství,

proveď:

- cohort status = `paused`,
- nové invite claims zakázat (RPC odmítne non-recruiting/active),
- stávající data ponechat,
- neprovádět destruktivní cleanup,
- vytvořit blocker issue,
- oznámit adminovi,
- pokračovat až po lidském schválení.

```bash
# ručně přes service role / admin script — status paused
```
