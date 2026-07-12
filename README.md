# Body & Mind ON

Next.js fitness app with AI-generated meal and workout plans.

## Vercel API audit (read-only)

Safe read-only check of the Vercel project `body-mind-on`: latest production deployment, domains, and environment variable **names** (never values).

### 1. Create a Vercel API token

1. Open [Vercel Account Tokens](https://vercel.com/account/tokens).
2. Create a token with **read** access to the project (no write/deploy permissions required for this audit).
3. Copy the token once — Vercel will not show it again.

### 2. Configure locally

Add to `.env.local` (or export in your shell). See also `.env.example` and `.env.local.example`:

```env
VERCEL_API_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
VERCEL_PROJECT_NAME=body-mind-on
```

- **VERCEL_API_TOKEN** — required.
- **VERCEL_TEAM_ID** — optional; required if the project lives under a team (not a personal account).
- **VERCEL_PROJECT_ID** — optional; if omitted, the script looks up by name.
- **VERCEL_PROJECT_NAME** — defaults to `body-mind-on`.

### 3. Run the audit

```bash
npm run vercel:audit
```

The script prints:

- latest **production** deployment (id, url, state, target, timestamps, git source if available)
- **domains** (name + verified/configured status)
- **environment variable names** only (key, target, type, timestamps)

### Security

- **Do not commit** `VERCEL_API_TOKEN` or any other secrets.
- **Never** paste token values into chat, logs, or screenshots.
- The audit script is designed **not** to print env values or decrypted secrets. Use `vercel env pull` only on trusted machines when you need local values.

More deployment context: [DEPLOY.md](./DEPLOY.md).

## System audit (read-only)

Jedním příkazem ověříš stav produkce a hlavních integrací. Výstup je **sanitizovaný** — bez hodnot secretů, bez osobních dat klientů, bezpečný pro vložení do chatu.

```bash
npm run system:audit
```

Sekce auditu:

- **ENV REQUIRED** — přítomnost povinných env proměnných (jen názvy)
- **VERCEL** — produkční deploy, domény, env názvy na Vercelu
- **SUPABASE** — připojení a read-only probe
- **OPENAI** — API key + lightweight auth check
- **EMAIL** / **GOOGLE CALENDAR** — config check (bez odeslání mailu / OAuth call)
- **PRODUCTION SMOKE** — kritická cesta na produkci
- **SECURITY HEADERS** / **LEGAL FOOTER** — runtime HTTP kontroly

Jednotlivé kroky lze spustit samostatně:

```bash
npm run verify:env-required
npm run verify:openai-config
npm run verify:email-config
npm run verify:google-calendar-config
npm run verify:supabase-readonly
npm run vercel:audit
```

**Bezpečnost:**

- Audit je **read-only** — nezapisuje do DB ani externích služeb (kromě read probe a produkčního smoke testu).
- Secrety patří pouze do `.env.local` nebo Vercel env — **nikdy** do repozitáře.
- Volitelný test e-mailu: `npm run verify:email-config -- --send-test` (default je jen config check).

## P0 launch sanity

Krátký read-only sprint před beta launch (bez PII ve výstupu):

```bash
npm run launch:sanity
```

Jednotlivé kroky:

```bash
npm run audit:users
npm run audit:unit-economics
npm run audit:plan-quality-samples   # lokální QA vzorky → audits/plan-quality-samples/
npm run verify:stripe-tier-mapping
```

**Deploy:** v `package.json` není auto-push script. Používej PR → Vercel Preview → merge do `main`.

### Preview START checkout

```bash
BASE_URL=https://<preview-branch-alias>.vercel.app npm run verify:start-checkout-preview
```

Bezpečný výstup: HTTP status, checkout host, Stripe mode (test/live), cleanup — bez URL a secretů.

Verifier po každém běhu smaže vlastní syntetický účet (`Cleanup: PASS`).

### Cleanup stripe-preview test účtů

```bash
npm run admin:cleanup-stripe-preview-users
```

Potvrzené smazání: `-- --confirm=DELETE_STRIPE_PREVIEW_TEST_USERS` (nejdřív dry-run).

### Plný Stripe subscription E2E

```bash
ALLOW_PRODUCTION_STRIPE_TEST_E2E=yes npm run e2e:stripe-subscription-test
```

Pouze Stripe **test mode** (`sk_test_`, `cs_test_`). S live klíčem nespouštět.
