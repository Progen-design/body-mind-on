# Kompletní analýza projektu Body & Mind ON a nasazení Stripe

Dokument z pohledu zkušeného programátora: architektura, slabá místa, bezpečnost a doporučení pro plné nasazení Stripe.

---

## 1. Přehled architektury

| Vrstva | Technologie |
|--------|-------------|
| Frontend | Next.js (Pages Router), React |
| Backend API | Next.js API routes (`pages/api/*`) |
| Auth | Supabase Auth (e-mail + heslo, admin API) |
| DB | Supabase (PostgreSQL), service role na serveru |
| Platby | Stripe Pricing Table (embed) – **bez server-side webhooku** |
| AI | OpenAI Assistant API (plány) |
| E-mail | Gmail SMTP / nodemailer |

**Důležité flow:**
- Registrace: `/start` → POST `/api/body-metrics` → vytvoření Auth uživatele + `body_metrics` + **memberships** (tier START, trial 7 dní).
- Přihlášení: `/login` → Supabase Auth → přesměrování na `/profil`.
- Profil: GET `/api/profile` s Bearer tokenem → vrací `program`, `trialEndsAt`, `isTrialExpired`, `daysUntilTrialEnd` z tabulky `memberships`.
- Stripe: pouze frontend – na profilu při `isTrialExpired` se zobrazí `<PricingTable />` (Stripe pricing-table.js). **Žádné propojení platby → memberships.**

---

## 2. Slabá místa (prioritně)

### 2.1 Kritická – Stripe bez webhooku

**Stav:** Uživatel zaplatí ve Stripe Pricing Table, ale aplikace o tom neví. Tabulka `memberships` se po platbě nemění – uživatel zůstane v `trial` / `isTrialExpired`.

**Dopad:** Zaplacený zákazník nemá aktivní předplatné v aplikaci; špatná UX a potenciální právní/obchodní problémy.

**Řešení:**
- Přidat **Stripe webhook** endpoint (např. `pages/api/webhooks/stripe.js`).
- Ověřovat podpis (`stripe.webhooks.constructEvent` s `STRIPE_WEBHOOK_SECRET`).
- Reagovat na události: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` (podle toho, zda používáte Checkout Sessions nebo Payment Links z Pricing Table).
- V obsluze webhooku: najít uživatele (podle `client_reference_id` = `user_id` nebo podle e-mailu z Stripe) a v Supabase upsertovat `memberships`: `tier = 'START'`, `status = 'active'`, `trial_ends_at = null`, popř. ukládat `stripe_customer_id` / `stripe_subscription_id` pro budoucí správu.

**Poznámka:** Stripe Pricing Table typicky vytváří Checkout Session; po úspěšné platbě Stripe volá webhook. V Dashboardu (Developers → Webhooks) nastav URL na `https://app.bodyandmindon.cz/api/webhooks/stripe` a vyber příslušné události.

---

### 2.2 Kritická – Žádné vynucení členství v API

**Stav:** Všechny chráněné API (profil, workouts, habits, generate-plan-next-week, send-plan-again, …) kontrolují pouze **přihlášení** (Bearer token → `getUser`). **Žádné API nekontroluje**, zda má uživatel platné předplatné (aktivní nebo v trialu).

**Dopad:** Uživatel s vypršeným triálem může dál používat plány, tréninky, komunitu atd. – omezení je jen vizuální (banner na profilu).

**Řešení:**
- Zavést pomocnou funkci např. `requireActiveMembership(supabase, userId)` (načte `memberships`, ověří `status === 'active'` nebo `tier === 'START'` a `trial_ends_at > now`).
- Volat ji v API, která mají být jen pro platící/trial: např. `generate-plan-next-week`, `send-plan-again`, `workouts` (POST), `habits` (POST), část `profile` dat. Podle byznys pravidel rozhodnout, která API omezit.
- Vrátit `403` s jasnou hláškou („Předplatné vypršelo. Obnov ho na profilu.“).

---

### 2.3 Vysoká – Hardcoded Stripe klíče v kódu

**Soubor:** `components/PricingTable.js`

```javascript
const publishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  'pk_test_51T7PxY...';  // fallback
const pricingTableId =
  process.env.NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID ||
  'prctbl_1T7jsP...';    // fallback
```

**Problém:** Publishable key je sice určen k veřejnému použití, ale **fallback v kódu** znamená:  
- možnost použití testovacího účtu i v produkci, pokud někdo zapomene env;  
- ID pricing tabulky v repozitáři (veřejné repo = expozice konfigurace).

**Řešení:** Odstranit fallbacky. Pokud env chybí, komponenta nemá zobrazovat Stripe blok (nebo zobrazit „Platební brána není nakonfigurována“). V produkci vždy nastavit `NEXT_PUBLIC_STRIPE_*` v prostředí.

---

### 2.4 Vysoká – `/api/generate-plan` bez auth a bez kontroly členství

**Stav:** Endpoint je volaný z veřejného formuláře (registrace) a rate-limituje se jen podle IP (5 req / 10 min). **Neověřuje se přihlášení ani členství.**

**Dopad:**  
- Zneužití: kdokoli může generovat plány (náklady na OpenAI).  
- Pokud se stejný endpoint někde použije i pro přihlášené uživatele („vygeneruj znovu“), nelze rozlišit anonym vs. uživatel s trialem.

**Doporučení:**  
- Oddělit dva scénáře: (1) veřejný první plán při registraci – volání z `/start` po odeslání formuláře (body-metrics už má uživatele), (2) přihlášený uživatel – např. „Pošli plán znovu“ přes `/api/send-plan-again` nebo jiný endpoint.  
- Pro veřejné generování při registraci: buď ponechat pouze v rámci jednoho POST z `/api/body-metrics` (generování uvnitř body-metrics), nebo mít striktní rate limit a případně CAPTCHA.  
- Pro přihlášené: používat pouze auth endpoint a tam kontrolovat členství (viz 2.2).

---

### 2.5 Střední – Duplicitní a nekonzistentní API

**Příklady:**
- Profilová data: `/api/profile` vs. `/api/my-metrics` – různé použití, ale překrývání (body_metrics, uživatel).
- Různé způsoby extrakce tokenu: `auth.slice(7)` vs. `authHeader.replace(/^Bearer\s+/i, '').trim()`.
- Návrhy z `NAVRHY_A_OPRAVY.md`: assistant-intake používá jiné env než zbytek projektu; admin má vlastní `getServerSupabase()`.

**Doporučení:** Sjednotit na jeden způsob auth (např. helper `getBearerUser(req)` v `lib/authHelpers.js`), používat `supabaseServer` všude a sjednotit env podle `.env.example`.

---

### 2.6 Střední – Tabulka `memberships` není v repozitáři

**Stav:** V kódu se používá `memberships` (user_id, tier, status, started_at, trial_ends_at, …), ale v `supabase/migrations` není migrace, která ji vytváří.

**Dopad:** Nové prostředí (nebo obnova DB) vyžaduje ruční vytvoření tabulky; RLS a indexy nemusí být konzistentní.

**Řešení:** Přidat migraci `YYYYMMDD_memberships.sql` s CREATE TABLE, indexy a RLS (např. uživatel čte jen svůj záznam; zápis jen přes service role nebo přes funkce volané z webhooku). Pro Stripe doplnit sloupce např. `stripe_customer_id`, `stripe_subscription_id` (podle potřeby).

---

### 2.7 Střední – Stripe Pricing Table a „success URL“

**Stav:** Po úspěšné platbě ve Stripe Pricing Table Stripe typicky přesměruje na URL nastavenou v Dashboardu. Uživatel může skončit na obecné „thank you“ stránce bez propojení s aplikací.

**Doporučení:**  
- V Stripe (Product/Pricing table) nastavit Success URL např. na `https://app.bodyandmindon.cz/profil?payment=success`.  
- Na profilu při `?payment=success` zobrazit krátkou hlášku („Platba proběhla. Tvůj přístup bude aktivní během chvíle.“) – protože webhook může přijít s malým zpožděním.

---

### 2.8 Nižší – Cron a citlivé endpointy

- **Cron:** `/api/cron/daily-digest` je chráněn `CRON_SECRET`. Ověřit, že v produkci je nastaven silný secret a že hlavička je opravdu porovnávána bez timing attack (např. `crypto.timingSafeEqual` pokud je k dispozici).
- **Admin:** Připojení Google Calendar používá `ADMIN_TOKEN` v query – token v URL se může objevit v logách. Preferovat hlavičku `Authorization: Bearer <ADMIN_TOKEN>` pro citlivé admin akce.

---

## 3. Stripe – checklist pro plné nasazení

| Krok | Popis |
|------|--------|
| 1 | **Webhook endpoint** – `pages/api/webhooks/stripe.js`, ověření podpisu, idempotence (zpracovat stejné `event.id` jen jednou). |
| 2 | **Mapování Stripe → user** – při vytváření Checkout Session (nebo v Pricing Table) předat `client_reference_id = user_id`; v webhooku z něj načíst uživatele a aktualizovat `memberships`. |
| 3 | **DB sloupce** – v `memberships` (nebo v doplňkové tabulce) ukládat `stripe_customer_id`, `stripe_subscription_id` pro zrušení / změnu plánu později. |
| 4 | **Success / Cancel URL** – v Stripe nastavit success URL na `/profil?payment=success`, cancel na `/profil`. |
| 5 | **Odstranit fallbacky** – v `PricingTable.js` nepoužívat defaultní klíče z kódu. |
| 6 | **Env** – přidat `STRIPE_SECRET_KEY` a `STRIPE_WEBHOOK_SECRET` (pouze server-side), v `.env.example` je zdokumentovat. |
| 7 | **Vynucení členství** – po zavedení webhooku zapnout kontroly v API (viz 2.2), aby uživatel s vypršeným triálem bez platby neměl přístup k placeným funkcím. |

---

## 4. Shrnutí priorit

1. **Stripe webhook** – jediný způsob, jak po platbě aktivovat předplatné v aplikaci.  
2. **Kontrola členství v API** – aby trial/platba měly reálný dopad na přístup.  
3. **Odstranit hardcoded Stripe hodnoty** v `PricingTable.js`.  
4. **Migrace pro `memberships`** (+ volitelně Stripe ID sloupce) a sjednocení auth/env podle dokumentu.

Tím získáte konzistentní model: registrace → trial → po vypršení platba přes Stripe → webhook aktualizuje `memberships` → API podle členství povolí nebo odepře přístup.
