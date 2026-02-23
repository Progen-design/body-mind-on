# Nasazení na web (Vercel)

## ⚠️ Pravidlo nasazení (vždy platí)

- **Všechny změny se musí dávat na tuto produkční verzi:**  
  **Push na větev `main`** → automatický deploy na Vercel → **https://app.bodyandmindon.cz**
- **Vercel projekt:** [body-mind-on](https://vercel.com/progen-designs-projects/body-mind-on)
- **Jinou verzi nepoužívat** – produkce je jen tato (main → tento Vercel projekt). Ostatní deploye / větve pro produkci nesmí být používány.

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
