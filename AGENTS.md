# AGENTS.md

Guidance for AI agents working in the **Body & Mind ON** repository.

## Project overview

Single Next.js 14 (Pages Router) fitness SaaS app. Core flow: AI (OpenAI) + APIs (Spoonacular, wger) → weekly meal + training plan. Hosted on Vercel; database/auth via Supabase.

## Cursor Cloud specific instructions

### Automatic startup (update script)

The VM update script runs `npm install` only. It does **not** start services or pull secrets.

### Local development

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server at `http://localhost:3000` |
| `npm run build` | Production build (works without `.env.local`) |
| `npm run lint:ci` | CI-scoped lint on plan/email files |
| `npm run smoke-test` | Critical-path API test (needs running dev server + env) |
| `npm run smoke-test:prod` | Same test against `https://app.bodyandmindon.cz` (no local env needed) |

Start the dev server in a **tmux** session (long-running):

```bash
SESSION_NAME="next-dev-server"
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null \
  || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "/workspace" -- "${SHELL:-zsh}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" 'cd /workspace && npm run dev' C-m
```

### Environment variables (required for full local API flow)

There is no committed `.env.local`. Pull from Vercel after linking the project:

```bash
npx vercel login    # interactive OAuth — user must complete in browser
vercel link
npm run env:pull    # writes .env.local from Vercel Production env
```

Minimum for core plan generation locally: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `SPOONACULAR_API_KEY`.

Without `.env.local`, static pages and `GET /api/integrations-status` still respond, but `checks.supabase_env` / `openai` / `spoonacular_configured` are `false` and plan APIs will not work.

Optional: `SUPABASE_ACCESS_TOKEN` in `.env.local` for Supabase MCP (`npm run check:cursor-access`).

### External services (no local containers)

- **Supabase** — hosted cloud DB/auth (no Docker required for normal dev).
- **OpenAI, Spoonacular, Gmail SMTP, Stripe** — remote APIs; keys only via env.
- **wger.de** — public API, no key.

Supabase local (`npx supabase start`) is optional and needs Docker; not used in typical agent workflows.

### Verification shortcuts

- Health: `curl http://localhost:3000/api/integrations-status`
- Production integrations (all green when deployed): `curl https://app.bodyandmindon.cz/api/integrations-status`
- Core flow without local secrets: `npm run smoke-test:prod`

### Lint note

`npm run lint` reports pre-existing warnings/errors repo-wide. CI uses `npm run lint:ci` on a fixed file set.

### Deployment

Production: push to `main` → Vercel deploy → `https://app.bodyandmindon.cz`. See `DEPLOY.md`.
