# Návrhy úprav a oprav – Body & Mind ON

Kompletní analýza projektu s návrhy prioritních změn.

---

## Kritické opravy

### 1. Chybějící stránka `/checkout`

**Problém:** Ceník (`lib/pricing.ts`) odkazuje na `/checkout?plan=individual` a `/checkout?plan=group`, stránka neexistuje.

**Řešení:** Buď vytvořit stránku `pages/checkout.js`, nebo dočasně změnit odkazy na `/start?plan=individual` (případně na platební bránu, až bude připravena).

---

### 2. `assistant-intake.js` – nekonzistentní env a Supabase klient

**Problém:**
- Používá `SUPABASE_URL` a `SUPABASE_KEY` místo `supabaseServer`
- Supabase doporučuje `SUPABASE_SERVICE_ROLE_KEY`, ne `SUPABASE_KEY`
- Pro e-mail používá `SMTP_USER` / `SMTP_PASS`, zatímco zbytek projektu má `GMAIL_USER` / `GMAIL_APP_PASSWORD`

**Řešení:** Použít `supabaseServer` z `lib/supabaseServer.js` a sjednotit env proměnné:
- `SUPABASE_URL` nebo `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Pro mail: buď `GMAIL_USER` / `GMAIL_APP_PASSWORD`, nebo dokumentovat rozdíl

---

### 3. Nekonzistence profil vs. dashboard

**Problém:**
- Header odkazuje na `/dashboard`
- Login přesměruje na `/profil`
- `/profil` používá `/api/my-metrics`, `/dashboard` používá `/api/profile` – podobná funkčnost, odlišné API

**Řešení:** Sjednotit na jeden profil:
- Buď v Headeru odkaz na `/profil` a v `login.js` ponechat `/profil`
- Nebo přesměrovat po přihlášení na `/dashboard` a upravit Header

---

### 4. Admin – vlastní Supabase klient

**Problém:** `admin.js` má funkci `getServerSupabase()` místo importu z `lib/supabaseServer.js`. Navíc používá `NEXT_PUBLIC_SUPABASE_URL`, zatímco `supabaseServer` umí i `SUPABASE_URL`.

**Řešení:** Importovat `supabaseServer` z `lib/supabaseServer.js`.

---

## Vysoká priorita

### 5. Chybějící `.env.example`

**Řešení:** Vytvořit `.env.example` s potřebnými proměnnými:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_URL=https://xxx.supabase.co

# E-mail (Gmail)
GMAIL_USER=email@gmail.com
GMAIL_APP_PASSWORD=app-password
EMAIL_FROM="Body & Mind ON <email@gmail.com>"

# OpenAI
OPENAI_API_KEY=sk-...

# Admin
ADMIN_TOKEN=secret-token

# App URL
NEXT_PUBLIC_APP_URL=https://app.bodyandmindon.cz
```

---

### 6. `assistant-intake.js` – pád při chybějících env

**Problém:** `createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)` padne, pokud jsou proměnné prázdné.

**Řešení:** Přidat kontrolu před vytvořením klienta nebo používat `supabaseServer`, který při chybějících env hází chybu hned při importu.

---

## Střední priorita

### 7. Tailwind třídy bez Tailwindu

**Problém:** V `start.js`, `ProgramForm.js`, `LayoutSection.js` se používají třídy jako `max-w-3xl`, `md:grid-cols-2`, `bg-neutral-900` – Tailwind není v projektu.

**Řešení:** Buď:
- Přidat Tailwind CSS (postcss, tailwind.config.js) a zachovat třídy, nebo
- Nahradit třídy vlastním CSS v `globals.css` nebo v `style jsx`.

---

### 8. Nepoužívané komponenty

| Komponenta        | Stav                               |
|-------------------|-------------------------------------|
| `BodyMetricsForm.js` | Používaná v `pricing.js`? Ne – pricing vede na `/start` |
| `LayoutSection.js`   | Není nikde importovaná              |

**Řešení:** Zvážit odstranění, nebo použít např. `BodyMetricsForm` na `/register`, pokud má být zachován stejný formulář.

---

### 9. Nepoužívaná závislost `resend`

**Problém:** V `package.json` je `resend`, v kódu se nepoužívá (e-maily jdou přes Nodemailer).

**Řešení:** Odstranit `npm uninstall resend` nebo připravit integraci Resend jako alternativy k Nodemaileru.

---

### 10. Duplicitní registrační toky

**Problém:**
- `/start` – hlavní START formulář → `/api/body-metrics` (registrace + AI plán)
- `/register` – další formulář s metrikami
- `/signup` – Supabase Auth signup
- `ProgramForm` (vip, club) → `/api/assistant-intake` (jiná tabulka `registrations`)

**Řešení:** Vyjasnit, které stránky mají být hlavní vstupní body:
- START pro zdarma plán
- /register jako alias na /start, nebo zrušit
- vip/club jako placené programy s jiným flow – OK

---

## Nízká priorita

### 11. Mix JavaScript a TypeScript

`lib/pricing.ts` a `components/Pricing.tsx` jsou TypeScript, zbytek JS. Není nutné měnit, jen být při rozšíření konzistentní.

---

### 12. Admin – ochrana přes query parametr

`/admin?key=TOKEN` je jednoduché, ale token zůstává v URL a historii. Lepší je Authorization header nebo session cookie.

---

## Shrnutí akcí (prioritní pořadí)

| # | Akce | Stav |
|---|------|------|
| 1 | Sjednotit Header + login redirect: `/profil` | ✅ Header odkazuje na `/profil` |
| 2 | Upravit `pricing.ts` – odkaz na `/start` místo `/checkout` | ✅ Odkazy změněny na `/start?plan=...` |
| 3 | V `assistant-intake.js` použít `supabaseServer` a sjednotit env | ✅ supabaseServer, GMAIL_* s SMTP_* fallback |
| 4 | Vytvořit `.env.example` | ✅ Vytvořeno |
| 5 | V `admin.js` použít import `supabaseServer` | ✅ Upraveno |
| 6 | Zvážit odstranění Tailwind tříd nebo přidání Tailwindu | Zbývá |
| 7 | Odstranit `resend` z package.json (nebo ho aktivně používat) | Zbývá |
| 8 | Vyčistit nevyužívané komponenty | Zbývá |
