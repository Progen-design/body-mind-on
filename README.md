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
