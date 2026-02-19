# Kde může být problém, když to na webu neběží

Máš nasazené na Vercelu a doménu – tady jsou **nejčastější příčiny**, které je dobré zkontrolovat.

---

## 1. Supabase – povolené URL pro přihlášení

**Kde:** Supabase Dashboard → **Authentication** → **URL Configuration**

- **Site URL** musí být přesně adresa, na které aplikace běží, např.:
  - `https://app.bodyandmindon.cz`
  - nebo `https://tvojeprojekt.vercel.app` (pokud zatím používáš jen Vercel doménu).
- Do **Redirect URLs** přidej (jedno z nich nebo obě):
  - `https://app.bodyandmindon.cz/**`
  - `https://tvojeprojekt.vercel.app/**`

Pokud tam je jen `http://localhost:3000`, přihlášení z prohlížeče na webu často selže nebo přesměruje špatně.

---

## 2. Vercel – Environment Variables

**Kde:** Vercel → tvůj projekt → **Settings** → **Environment Variables**

Zkontroluj, že máš nastavené (s reálnými hodnotami, ne z .env.example):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` = přesně ta URL, na které aplikace běží (např. `https://app.bodyandmindon.cz`)

**Důležité:** Po změně proměnných je potřeba udělat **Redeploy** (Deployments → … u posledního deploye → Redeploy).

---

## 3. Doména app.bodyandmindon.cz

**Kde:** Vercel → **Settings** → **Domains**

- Musí být přidaná doména **app.bodyandmindon.cz**.
- Vercel ti ukáže, co nastavit u poskytovatele domény (CNAME na `cname.vercel-dns.com` nebo A záznamy).
- Změny DNS se projeví až po chvíli (minuty až hodiny).

Pokud doména není v Domains nebo DNS není nastavené, při otevření app.bodyandmindon.cz se může stránka nenačíst nebo ukázat jiný hosting.

---

## 4. Build na Vercelu

**Kde:** Vercel → **Deployments** → klik na poslední deployment → **Building**

- Když build padá (červeně), aplikace se nenasadí.
- Otevři **Build Logs** a podívej se na chybovou hlášku (chybí balíček, chyba v kódu, chybějící env při buildu atd.).

---

## 5. Co přesně nefunguje?

Podle příznaku:

| Problém | Kam se podívat |
|--------|-----------------|
| Přihlášení nefunguje / hned odhlásí | Supabase URL Configuration (Site URL + Redirect URLs) + že na Vercelu máš `NEXT_PUBLIC_SUPABASE_*` |
| Stránka bílá / „Supabase není nakonfigurován“ | Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` + Redeploy |
| app.bodyandmindon.cz se nenačte | Vercel Domains + DNS u registrátora |
| API / ukládání dat nefunguje | Vercel env: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` + Supabase RLS / tabulky |
| Build padá | Vercel → Deployments → Build Logs |

---

Napiš konkrétně: **jaká URL otevíráš** (app.bodyandmindon.cz nebo xxx.vercel.app) a **co se děje** (bílá stránka, chyba přihlášení, něco jiného). Podle toho jde zúžit, kde je problém.
