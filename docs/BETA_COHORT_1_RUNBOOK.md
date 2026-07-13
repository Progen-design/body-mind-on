# START Closed Beta Cohort 1 — Runbook

## 1. Před náborem

- Ověř produkční deploy (`main`, READY, gitDirty false).
- Spusť `npm run report:beta-daily` a `npm run report:beta-activation`.
- Ujisti se, že cohort `START-C1` existuje a má status `recruiting`.
- Ověř, že https://app.bodyandmindon.cz/beta funguje bez invite kódu.

## 2. Odeslání pozvánky

- Použij text z `docs/BETA_INVITE_COPY.md` (WhatsApp nebo e-mail).
- Jediný vstupní odkaz: **https://app.bodyandmindon.cz/beta**
- Žádné invite kódy, žádné ruční předávání kódů.

## 3. Validace registrace

- Denně kontroluj funnel v `npm run report:beta-daily`.
- Ověř, že participant má `registered_at`, `beta_terms_accepted_at` a `source = direct_beta_link`.
- Při zaseknutí: `CONTACT PARTICIPANT` (ruční kontakt, ne automat).

## 4. Denní kontrola reportu

```bash
npm run report:beta-daily -- --cohort=START-C1
```

## 5. Moderované sezení

- Postupuj podle `docs/BETA_COHORT_1_SESSION_GUIDE.md`.
- Záznam pouze se souhlasem.
- Poznámky do `docs/BETA_SESSION_NOTES_TEMPLATE.md` (aliasy, ne PII).

## 6. Zápis issue

```bash
npm run beta:add-issue -- --cohort=START-C1 --participant=C1-P01 --title="..." --category=daily_use --severity=medium --step="complete activity" --evidence="..."
```

## 7. Severity triage

- **blocker** — zastav nábor, kill-switch pokud systémové.
- **high** — musí mít ownera a rozhodnutí před Cohort 2.
- **medium/low** — evidovat, neblokovat release gate automaticky.

## 8. Fix process

- Během Cohort 1 **nepřidávej nové funkce** bez rozhodnutí v `beta_decisions`.
- Pouze blocker/high fixy s jasným scope.
- Po fixu aktualizuj issue status na `fixed` nebo `accepted`.

## 9. Cohort decision

```bash
npm run report:beta-cohort -- --cohort=START-C1
```

Rozhodnutí: GO TO COHORT 2 / FIX BEFORE COHORT 2 / STOP AND REWORK.

## 10. Cleanup

- Po ukončení cohorty status `completed` nebo `analyzing`.
- Data ponech pro analýzu.

## 11. Incident process

1. Zaznamenej blocker issue.
2. Aktivuj kill-switch (viz níže).
3. Informuj admina.
4. Pokračuj až po lidském schválení.

## 12. Kill-switch

Pokud nastane:

- únik osobních dat,
- dietní hard constraint violation,
- opakovaná generace nebezpečného plánu,
- onboarding blocker pro více lidí,
- nekontrolované chyby API,
- nečekané aktivace placeného členství,

proveď:

- cohort status = `paused`,
- nové joiny zakázat (RPC odmítne non-recruiting/active),
- stávající data ponechat,
- neprovádět destruktivní cleanup,
- vytvořit blocker issue,
- oznámit adminovi,
- pokračovat až po lidském schválení.
