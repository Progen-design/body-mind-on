# Služby a weby propojené s Body & Mind ON

Přehled všech externích služeb, které projekt používá, včetně odkazů na jejich dashboardy. **Přihlášení musíš provést sám** – AI asistent nemá přístup k tvým účtům.

---

## 1. Hosting a CI/CD

| Služba | Účel | Odkaz na dashboard / nastavení |
|--------|------|--------------------------------|
| **Vercel** | Hosting Next.js aplikace, env proměnné, cron (daily-digest, run-scheduler), Functions | https://vercel.com/dashboard → projekt **body-mind-on** (nebo **Progen-designs-projects/body-mind-on**) |
| **GitHub** | Repozitář, Actions (workflow AI Scheduler každých 5 min), Secrets (APP_URL, CRON_SECRET) | https://github.com/Progen-design/body-mind-on → **Settings** → **Secrets and variables** → Actions |

**Vercel – kde co najdeš:**
- **Environment Variables:** Settings → Environment Variables (CRON_SECRET, OPENAI_API_KEY, Supabase, Stripe, Gmail, …)
- **Functions / Max Duration:** Settings → Functions (limit běhu serverless funkcí)
- **Cron:** vercel.json definuje cesty; Vercel Hobby má limit 1× denně na cron

**GitHub – kde co najdeš:**
- **Actions:** záložka Actions (spuštění workflow „AI Scheduler (every 5 min)“)
- **Secrets:** Settings → Secrets and variables → Actions (APP_URL, CRON_SECRET)

---

## 2. Databáze a auth

| Služba | Účel | Odkaz |
|--------|------|--------|
| **Supabase** | PostgreSQL, Auth, Storage (projekt: `ipfyavvmmxmsjupmfnes`) | https://supabase.com/dashboard → vyber projekt **ipfyavvmmxmsjupmfnes** (nebo z NEXT_PUBLIC_SUPABASE_URL) |
| **Supabase – SQL editor** | Migrace, ruční dotazy | https://supabase.com/dashboard/project/ipfyavvmmxmsjupmfnes/sql/new |
| **Supabase – Account tokens** | PAT pro skripty (migrace, check-recent-failures) | https://supabase.com/dashboard/account/tokens |

---

## 3. Platby a předplatné

| Služba | Účel | Odkaz |
|--------|------|--------|
| **Stripe** | Pricing Table, platby, webhook | https://dashboard.stripe.com |
| **Stripe – Webhooks** | Signing secret pro `/api/webhooks/stripe` | Dashboard → Developers → Webhooks |
| **Stripe – Pricing tables** | ID tabulky (NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID) | Dashboard → Products → Pricing tables |

---

## 4. AI a e-maily

| Služba | Účel | Odkaz |
|--------|------|--------|
| **OpenAI** | API klíč pro generování plánů (Responses API / Assistants) | https://platform.openai.com → API keys |
| **OpenAI Assistants** | Instrukce asistenta „Body and Mind ON“ (generování plánů) | https://platform.openai.com/assistants → vyber asistenta → Instructions |
| **Gmail / SMTP** | Odesílání e-mailů (body-metrics, plán, digest) – přes Nodemailer | Nastavení v env: GMAIL_USER, GMAIL_APP_PASSWORD; účet: Google účet (info@bodyandmindon.cz) |

---

## 5. Externí API (enrichment)

| Služba | Účel | Odkaz |
|--------|------|--------|
| **RapidAPI (ExerciseDB)** | Cviky / obrázky cviků | https://rapidapi.com → ExerciseDB API (EXERCISEDB_API_KEY, EXERCISEDB_API_HOST) |
| **RapidAPI (Spoonacular)** | Recepty / jídla (volitelné) | RAPIDAPI_SPOONACULAR_HOST v env; klíč přes RapidAPI |
| **Unsplash** | Obrázky jídel a cviků (v kódu jako URL, bez API klíče) | Pouze URL v PlanViewer.js; účet nepotřebuješ pro read |

---

## 6. Domény a weby produktu

| URL | Účel |
|-----|--------|
| **https://app.bodyandmindon.cz** | Produkční Next.js aplikace (Vercel) |
| **https://bodyandmindon.cz** | Hlavní marketingový web (registrace, odkazy z Header.js) |

---

## 7. OAuth a admin

| Služba | Účel | Kde nastavit |
|--------|------|--------------|
| **Google Cloud Console** | OAuth pro Google Kalendář (trenér) | GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET v env; credentials v Google Cloud Console |
| **ADMIN_TOKEN** | Ochráněné endpointy (např. debug, admin) | Env na Vercelu; libovolný náhodný řetězec |

---

## Rychlý checklist – kde co zkontrolovat

1. **Timeout run-scheduleru:** Vercel → projekt → Settings → Functions (Max Duration).
2. **CRON_SECRET shoda:** Stejná hodnota ve Vercel (Environment Variables) a v GitHub (Settings → Secrets → CRON_SECRET).
3. **APP_URL v GitHubu:** Settings → Secrets → APP_URL = `https://app.bodyandmindon.cz`.
4. **Stripe webhook:** Dashboard → Developers → Webhooks → endpoint na tvou doménu, signing secret do env.
5. **OpenAI asistent:** platform.openai.com → Assistants → instrukce podle `docs/OPENAI_ASSISTANT_KOMPLETNI_INSTRUKCE.md`.
6. **Supabase:** Dashboard projektu → Database, Auth, Storage; env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_*.

---

*Tento soubor vygenerován z kódu a konfigurace projektu. Hesla a klíče sem nepatří – drž je jen v .env a v dashboardech služeb.*
