# Body & Mind ON — kontext pro Claude Code

Tento soubor čte Claude Code automaticky při startu v tomto repozitáři. Udržuj ho aktuální — je to nejdůležitější zdroj kontextu pro agentní práci.

## Co je to za projekt

Body & Mind ON je digitální fitness a wellbeing platforma (web + webapp). Kombinuje personalizované jídelníčky, tréninkové plány, habit systém a AI orchestraci (generování plánů, lifecycle e-maily, analýza dat z wearables).

Plný produktový a byznys kontext je v Claude projektu "bodyandmindon" (`BMON_MASTER_CONTEXT.md`) a v `BMON_TECH_STATE.md` — pokud pracuješ na produktovém rozhodnutí, ne jen na kódu, řekni uživateli ať ten kontext doplní/zkontroluje.

## Stack

- **Frontend/App**: Next.js (App Router), Tailwind CSS, PWA (`mobile-web-app-capable`)
- **Backend**: Supabase (Postgres 17, Auth, Edge Functions na Deno)
- **Platby**: Stripe (aktuálně SANDBOX/test mode — `acct_1T7PxYPTu5plCL9P`, "Body & Mind ON sandbox")
- **Deploy**: Vercel — 2 projekty: `body-mind-on` (app, `app.bodyandmindon.cz`) a `bodyandmindon-web` (marketingový web, `bodyandmindon.cz`)
- **AI**: OpenAI (Assistants API) — veškeré volání loguje do `ai_logs`, `openai_daily_usage`, cache v `openai_response_cache`
- **Monitoring**: Sentry organizace `bodyandmindon` založená, ale ZATÍM BEZ PROJEKTŮ — je potřeba nainstalovat SDK (viz úkoly níže)
- **Wearables**: Withings API (OAuth), Apple Health (Health Auto Export → webhook ingest)
- **Analytics**: `product_events` (interní event tracking, bez PII)

## Databázové konvence (Supabase)

- **RLS je POVINNÉ na každé nové tabulce.** Repo má už ~90 tabulek a všechny mají `rls_enabled: true` — nikdy to neporušuj.
- Migrace vždy přes `supabase/migrations/`, nikdy přímé změny přes dashboard u produkčního projektu (`ipfyavvmmxmsjupmfnes`).
- Po každé migraci spusť `mcp__Supabase__get_advisors` (security + performance) a vyřeš, co najde.
- Tabulky s prefixem `_backup_2026_06_02_*` jsou stará záloha — neopírej se o ně, kandidát na smazání (potvrdit s uživatelem).
- AI orchestrační vrstva (`ai_agents`, `ai_tasks`, `ai_trigger_rules`, `ai_executor_bindings`, `ai_context_profiles`) je runtime mozek aplikace — necháváme ji v Supabase, nestavíme paralelní orchestraci jinde (Make apod.).

## Edge Functions (aktivní)

- `generate-plan` — hlavní generování jídelníčku/tréninku přes OpenAI
- `trigger-scheduler` — vyhodnocuje `ai_trigger_rules` a plánuje `ai_tasks`
- `apple-health-ingest` — příjem dat z Health Auto Export
- `github-patch`, `test-openai-key`, `test-spoonacular`, `create-test-user` — pomocné/testovací, neřešit v produkčním review

## Konvence kódu a textů

- UI texty vždy česky, tone of voice: stručný, konkrétní, bez "fitness bullshit" a bez zdravotních diagnóz (viz `BMON_MASTER_CONTEXT.md` sekce 7–8).
- Žádné přehnané sliby, žádná pseudověda.
- TypeScript strict mode, žádné `any` bez odůvodnění v komentáři.
- Před commitem: `eslint --fix` + `tsc --noEmit` (ideálně jako post-edit hook, viz `.claude/settings.json`).

### Copy pravidla

- Před úpravou uživatelských textů (LP, aplikace, onboarding, e-maily, notifikace, metadata) si přečti **[docs/copy-rules.md](docs/copy-rules.md)** — zejména sekci *Chytrá zařízení*.
- Po změnách copy spusť `npm run lint:copy`.
- Další pravidla projektu: `.cursor/instructions.md` a `.cursor/rules/`.

## Co NIKDY nedělat bez potvrzení uživatele

- Neposílej Stripe účet do live módu / neměň klíče.
- Nemaž žádná uživatelská data (`users`, `profiles`, `body_metrics`, ...) ani v testu bez explicitního souhlasu.
- Neodesílej hromadné e-maily (lifecycle_emails fronta) mimo test prostředí.
- Neupravuj RLS politiky tak, aby otevřely přístup bez auth.

## Otevřené úkoly (priorita)

1. Nastavit Sentry SDK v Next.js app (`npx @sentry/wizard@latest -i nextjs`) a propojit s org `bodyandmindon`.
2. Dotáhnout Stripe webhook → `subscriptions` tabulka (aktuálně 0 řádků, přitom ceník je živý).
3. Uklidit `_backup_2026_06_02_*` tabulky.
4. Před spuštěním plateb naostro: přepnout Stripe ze sandboxu do live a projít checklist v `bmon-release` skillu.

## Jak pracovat v tomto repu

- Na větší úkoly použij plan mode (Shift+Tab) — nejdřív návrh, pak implementace.
- Pro DB změny vždy zkontroluj aktuální schéma přes Supabase MCP (`list_tables`, `list_edge_functions`) než navrhneš migraci — schéma je rozsáhlé a snadno se něco duplikuje.
- Pro release/deploy použij `bmon-release` skill (checklist) než zavoláš `mcp__Vercel__deploy_to_vercel` nebo pushneš do main.
