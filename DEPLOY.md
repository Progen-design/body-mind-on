# Nasazení na web (Vercel)

## ⚠️ Pravidlo nasazení (vždy platí)

- **Všechny změny se musí dávat na tuto produkční verzi:**  
  **Push na větev `main`** → automatický deploy na Vercel → **https://app.bodyandmindon.cz**
- **Vercel projekt:** [body-mind-on](https://vercel.com/progen-designs-projects/body-mind-on)
- **Jinou verzi nepoužívat** – produkce je jen tato (main → tento Vercel projekt). Ostatní deploye / větve pro produkci nesmí být používány.

## Domény (marketing vs. aplikace)

- **Marketing:** `https://bodyandmindon.cz` (a `www.`) – úvodní stránka v repu je `pages/index.js` (`/`).
- **Aplikace:** `https://app.bodyandmindon.cz` – dotazník `/start`, přihlášení, profil, všechna `/api/*`.
- **Middleware** (`middleware.js`): návštěvník na marketingové doméně, který otevře např. `/start`, `/login`, `/profil`, `/komunita`, … je přesměrován na stejnou cestu na **`NEXT_PUBLIC_APP_URL`** (kanonická app, typicky `https://app.bodyandmindon.cz`). Na app hostu `/` vede na `/start`.
- Ve Vercelu nastav **`NEXT_PUBLIC_APP_URL=https://app.bodyandmindon.cz`** a volitelně **`NEXT_PUBLIC_MAIN_SITE_URL=https://bodyandmindon.cz`** (výchozí v kódu už tyto produkční hodnoty používáme, env je jen přepínač).

---

Aplikace je Next.js projekt. Aby běžela na internetu (např. na **https://app.bodyandmindon.cz**), nasaď ji na Vercel.

## Kroky

### 1. Účet a propojení GitHubu

- Jdi na [vercel.com](https://vercel.com) a přihlas se (ideálně přes **GitHub**).
- Vercel má přístup k repozitáři **body-mind-on** na GitHubu.

### 2. Nový projekt z GitHubu

- V dashboardu klikni **Add New…** → **Project**.
- Vyber repozitář **body-mind-on**.
- **Framework Preset**: Next.js (Vercel ho detekuje sám).
- **Root Directory**: nech prázdné.
- **Build Command**: `next build` (výchozí).
- **Output Directory**: nech výchozí.

### 3. Proměnné prostředí (Environment Variables)

V projektu v Vercelu otevři **Settings → Environment Variables** a přidej **všechny** proměnné z `.env.example` (s reálnými hodnotami, ne s `xxx`):

| Name | Kam dát | Povinné |
|------|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel Environment Variables | ano |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tamtéž | ano |
| `SUPABASE_URL` | tamtéž | ano |
| `SUPABASE_SERVICE_ROLE_KEY` | tamtéž | ano |
| `NEXT_PUBLIC_APP_URL` | např. `https://tvoje-app.vercel.app` nebo `https://app.bodyandmindon.cz` | ano (odkazy v e-mailech) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM` | pokud používáš e-maily | doporučeno |
| `OPENAI_API_KEY` | pokud používáš AI plány | doporučeno |

**OpenAI klíče:** ve Vercelu (Production) nastav **jeden** platný `OPENAI_API_KEY`. Nepoužívané klíče v [OpenAI API keys](https://platform.openai.com/api-keys) smaž nebo zruš – snížíš riziko úniku a zmatek při rotaci. Po změně klíče vždy ověř generování plánu (např. `GET /api/verify-media-apis` + krátký test v aplikaci).

**Smoke test (`npm run smoke-test` proti produkci):** výchozí příjemce je `info+bm-smoke-…@bodyandmindon.cz` (doručí se na schránku **info@** při zapnutém plus-adresování v Google Workspace). Volitelně `SMOKE_TEST_RECIPIENT=jiny@domena.cz` pro jiný základ plus-adresy.
| `ADMIN_TOKEN` | pokud používáš admin | volitelné |

- **Environment**: zaškrtni **Production** (a případně Preview, pokud chceš stejné proměnné i pro náhledové deploye).

### 4. Deploy

- Klikni **Deploy**.
- Po dokončení buildu bude aplikace dostupná na adrese typu:
  - `https://body-mind-on-xxxx.vercel.app`
  - nebo na vlastní doméně, pokud ji v **Settings → Domains** přidáš (např. **app.bodyandmindon.cz**).

### 5. Vlastní doména (app.bodyandmindon.cz)

- V projektu na Vercelu: **Settings → Domains**.
- Přidej doménu **app.bodyandmindon.cz**.
- Vercel ti ukáže, jaké záznamy (CNAME nebo A) máš nastavit u poskytovatele domény (např. u registrátora bodyandmindon.cz). Po propagaci DNS bude aplikace běžet na této adrese.

### 6. Další deploye

- Při každém **push do main** na GitHubu Vercel automaticky znovu nasadí (production).
- Build a běh aplikace tedy budou vždy na webu – tam to „běží“, kde to potřebuješ.

## Shrnutí

- **Lokálně**: `npm run dev` → běží jen u tebe na `http://localhost:3000`.
- **Na webu**: po nasazení na Vercel běží na **https://tvoje-url.vercel.app** nebo **https://app.bodyandmindon.cz** – tam to máš „na webu“.

## Vercel API audit (read-only)

Bezpečný read-only přehled projektu `body-mind-on` přes Vercel REST API (deployment, domény, **jen názvy** env proměnných).

1. Vytvoř token na [vercel.com/account/tokens](https://vercel.com/account/tokens) (stačí read přístup).
2. Do `.env.local` doplň (viz `.env.example`):

   ```env
   VERCEL_API_TOKEN=
   VERCEL_TEAM_ID=
   VERCEL_PROJECT_ID=
   VERCEL_PROJECT_NAME=body-mind-on
   ```

   U team projektu je `VERCEL_TEAM_ID` obvykle nutné (najdeš v URL dashboardu nebo v Team Settings).

3. Spusť:

   ```bash
   npm run vercel:audit
   ```

**Bezpečnost:** token necommituj; skript nevypisuje hodnoty env proměnných. Podrobnosti: [README.md](./README.md).
