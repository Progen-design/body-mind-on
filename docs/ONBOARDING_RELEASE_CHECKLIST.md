# Onboarding Release Checklist – po každém deployi

> Krátký checklist pro ověření, že onboarding flow funguje. Prováděj po každém produkčním deployi.

---

## 1. Nová registrace

- [ ] Otevři `/start` nebo `/on-club`
- [ ] Vyplň formulář s **novým e-mailem** (např. `test-{timestamp}@example.com`)
- [ ] Odešli formulář
- [ ] Response přijde do 60 s (typicky 20–50 s)

---

## 2. Kontrola response z POST /api/body-metrics

V DevTools → Network → POST `/api/body-metrics` → Response:

- [ ] `ok: true`
- [ ] `_diagnostics.plan_state` je `ready` nebo `processing` nebo `failed` (ne `unknown`)
- [ ] `_diagnostics.onboarding_result` je `ai_success` nebo `fallback_success` nebo `failed`
- [ ] `_diagnostics.saved_plan_exists` je `true` když `plan_state === 'ready'`
- [ ] `_diagnostics.final_response_reason` odpovídá realitě
- [ ] Když `plan_state === 'ready'`: `planPending` je `false`
- [ ] Když `plan_state === 'failed'`: `planPending` je `false`, `message` je fail message

---

## 3. Kontrola profile API

- [ ] Přihlas se testovacím uživatelem
- [ ] GET `/api/profile` s Bearer tokenem
- [ ] `_diagnostics.plan_state` je `ready` když plán existuje
- [ ] `_diagnostics.onboarding_result` je `ai_success` nebo `fallback_success` když plán je ready
- [ ] `plans[0].plan_html` má délku > 3500 a obsahuje Jídelníček a Trénink

---

## 4. Kontrola plánu v UI

- [ ] Přejdi na `/profil`
- [ ] Sekce „Můj plán“ zobrazuje týdenní plán (7 dní, snídaně/oběd/večeře, trénink)
- [ ] Žádné „Plán se dokončuje“ když plán už existuje
- [ ] Žádné „Plán se nepodařilo dokončit“ když plán existuje

---

## 5. Kontrola AI vs fallback

V response z body-metrics nebo v debug endpointu:

- [ ] `onboarding_result === 'ai_success'` → plán vznikl z AI
- [ ] `onboarding_result === 'fallback_success'` → plán vznikl z deterministického fallbacku
- [ ] `onboarding_result === 'failed'` → plán nevznikl, uživatel vidí „Vygenerovat plán“

**Debug endpoint** (vyžaduje ADMIN_TOKEN):

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://app.bodyandmindon.cz/api/debug/latest-plan-status?email=TEST_EMAIL"
```

- [ ] `onboarding_audit` obsahuje `onboarding_result`, `time_to_plan_ready_ms`

---

## 6. Kontrola ai_logs (onboarding metriky)

```sql
select id, user_id, status, message, payload->>'onboarding_result' as result,
       payload->>'plan_state' as plan_state,
       payload->>'time_to_plan_ready_ms' as time_ms,
       created_at
from ai_logs
where agent_slug = 'onboarding' and action = 'registration_complete'
order by created_at desc
limit 5;
```

- [ ] Nový záznam existuje pro testovací registraci
- [ ] `onboarding_result` je `ai_success`, `fallback_success` nebo `failed`
- [ ] `plan_state` odpovídá response

---

## Výsledek

| Krok | OK | Poznámka |
|------|----|----------|
| 1. Registrace | | |
| 2. body-metrics response | | |
| 3. profile API | | |
| 4. UI plán | | |
| 5. AI vs fallback | | |
| 6. ai_logs | | |

> Datum: __________ | Deploy: __________
