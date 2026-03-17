# Směrnice registrace podle programu

> Jedna zdrojová pravda pro to, co platí pro každý z 3 registračních vstupů. Smoke test a release checklist se na tyto směrnice odkazují.

---

## 3 vstupní body

| Program | URL | `program` v payload | Tier v memberships |
|---------|-----|---------------------|--------------------|
| **START** | `/start` | `START` | `START` |
| **ON Club** | `/on-club` | `ON_CLUB` | `ON_CLUB` |
| **VIP Coaching** | `/chci-vip` | `VIP` | `VIP` |

Všechny tři používají stejný flow: 5 kroků, POST `/api/body-metrics`, validace dle `lib/registrationRules.js`.

---

## Směrnice podle programu

### START (7 dní zdarma, pak 499 Kč/měsíc)

- **memberships.tier**: `START`
- **memberships.status**: `trial` při registraci
- **memberships.trial_ends_at**: +7 dní od `started_at`
- **memberships.notes**: `Registrace přes START formulář`
- Po vypršení trialu: uživatel musí obnovit předplatné (Stripe) nebo upgrade na ON Club / VIP

### ON Club (1499 Kč/měsíc)

- **memberships.tier**: `ON_CLUB`
- **memberships.status**: `active` při registraci (platí ihned po checkoutu)
- **memberships.trial_ends_at**: `null`
- **memberships.notes**: `Registrace přes ON_CLUB formulář`
- Očekávání: AI trenér 24/7, adaptivní plán, komunita, video konzultace

### VIP Coaching (3999 Kč/měsíc)

- **memberships.tier**: `VIP`
- **memberships.status**: `active` při registraci
- **memberships.trial_ends_at**: `null`
- **memberships.notes**: `Registrace přes VIP formulář`
- Očekávání: elitní lidský kouč, 1:1 konzultace, prioritní podpora

---

## Co ověřovat při smoke testu

Pro každý program:

1. **Formulář** – stránka se načte, 5 kroků funguje, submit jde na `/api/body-metrics`
2. **Payload** – `program` odpovídá URL (`START` z /start, `ON_CLUB` z /on-club, `VIP` z /chci-vip)
3. **memberships** – `tier` a `status` odpovídají směrnicím výše
4. **body_metrics** – payload obsahuje `program`; memberships je hlavní zdroj tieru
5. **Onboarding** – plán se vygeneruje stejně pro všechny (AI nebo fallback), e-mail s plánem přijde

---

## Reference

- `lib/registrationRules.js` – validace, počet kroků, povolené programy
- `lib/pricing.ts` – CTA a odkazy na jednotlivé stránky
- `lib/membershipHelpers.js` – logika přístupu (trial vs active)
- `pages/api/body-metrics.js` – memberships upsert podle `payload.program`
