# Body & Mind ON – Struktura projektu a návrhy úprav

Projekt jsem prošel celý. Níže je **přehled struktury**, **co už je opraveno** a **doporučené úpravy**.

---

## 1. Aktuální struktura

```
body-mind-on/
├── .cursor/
│   └── instructions.md      # Pravidla projektu
├── components/
│   ├── Footer.js
│   ├── Header.js
│   ├── LayoutSection.js    # Tailwind třídy (Tailwind v projektu není)
│   ├── Pricing.tsx         # Jediný TS soubor
│   └── ProgramForm.js      # Tailwind třídy
├── lib/
│   ├── generatePlan.js     # AI plán + e-mail (opraveno: přidán generatePlan pro API)
│   ├── mail.js             # Nodemailer – odeslání plánu
│   ├── openai.js            # OpenAI klient
│   ├── pricing.ts          # Data ceníku (TypeScript)
│   ├── supabaseClient.js   # Klient pro prohlížeč (anon key)
│   └── supabaseServer.js   # Klient pro API (service role)
├── pages/
│   ├── _app.js
│   ├── _document.js
│   ├── index.js            # Landing
│   ├── index.html          # Statická stránka s iframe (HeyGen) – nezapadá do Pages routeru
│   ├── admin.js, club.js, onboarding.js, pricing.js, register.js, signup.js, start.js, training.js, vip.js
│   └── api/
│       ├── assistant-intake.js  # Tabulka „registrations“, SMTP_USER/SMTP_PASS
│       ├── body-metrics.js      # Tabulka „body_metrics“, volá generatePlanForEmail
│       ├── generate-plan.js     # Vrací { html, metrics } – nyní funguje
│       └── sessions.js          # Přihlášený uživatel, rezervace sezení
├── public/
│   └── robots.txt
├── styles/
│   └── globals.css         # Sjednoceno (odstraněna duplicita :root/body)
├── next.config.js
├── package.json
└── jsconfig.json           # aliasy @/components/*, @/lib/*
```

---

## 2. Funkční tok: START dotazník → e-mail

**Důležité:** Formulář na [app.bodyandmindon.cz/start](https://app.bodyandmindon.cz/start) funguje v tomto řetězci:

`pages/start.js` → **POST /api/body-metrics** → tabulka **body_metrics** → **generatePlanForEmail()** → **sendPlanEmail()** (lib/mail.js, Gmail).

- **Nepoužívá se:** tabulka `registrations`, endpoint `/api/assistant-intake` (ten je jiný tok).
- Při jakýchkoli úpravách je nutné tento tok **zachovat**. Podrobný popis včetně polí formuláře a normalizace: **[FLOW_START_DOTAZNIK.md](./FLOW_START_DOTAZNIK.md)**.

---

## 3. Co bylo opraveno v rámci revize

- **API `/api/generate-plan`** – volalo neexistující `generatePlan()` z `lib/generatePlan.js`. V lib je nyní doplněna funkce `generatePlan(params)`, která vrací `{ html, metrics }`, takže endpoint funguje.
- **`styles/globals.css`** – odstraněna duplicitní sekce `:root` a `body` na konci souboru; barvy z druhé sekce jsou sloučeny do prvního `:root`.

---

## 4. Návrhy úprav a vylepšení

### 4.1 Kritické / konzistence

| Problém | Návrh |
|--------|--------|
| **Dva různé Supabase klienty v API** – `assistant-intake.js` používá `SUPABASE_URL` + `SUPABASE_KEY`, zatímco zbytek projektu používá `SUPABASE_SERVICE_ROLE_KEY`. | Sjednotit: v API routes používat pouze `supabaseServer` z `lib/supabaseServer.js` a v env mít `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY`. V `assistant-intake.js` nahradit vlastní `createClient` importem `supabaseServer`. |
| **Dva odlišné e-mailové toky** – `assistant-intake` píše do tabulky `registrations` a posílá e-mail přes `SMTP_USER`/`SMTP_PASS`; `body-metrics` + `generatePlanForEmail` používají `body_metrics`, AI plán a `mail.js` (GMAIL_USER/GMAIL_APP_PASSWORD). | Rozhodnout, zda má být jeden „registrační + potvrzení“ tok (např. jen body-metrics + mail.js) a druhý odstranit nebo jen doplnit do dokumentace, kdo co používá a které env jsou potřeba. |
| **Onboarding bez e-mailu** – `onboarding.js` ukládá do `body_metrics` bez pole `email`. Následně nelze pro tento záznam spustit `generatePlanForEmail`. | Buď přidat do onboarding formuláře pole e-mail a předávat ho do API, nebo v dokumentaci jasně popsat, že onboarding je „bez plánu na e-mail“. |

### 4.2 Struktura a konvence

| Návrh | Popis |
|-------|--------|
| **`pages/index.html`** | V Next.js (Pages Router) se z `pages/` servírují stránky jako route. Soubor `index.html` se chová jako statický asset. Pokud má být samostatná landing stránka s iframe, zvaž přesun do `public/` (např. `public/landing.html`) a odkaz `https://.../landing.html`, nebo převést na `pages/landing.js` s tímto obsahem. |
| **Jednotný jazyk souborů** | Většina je JavaScript, pouze `lib/pricing.ts` a `components/Pricing.tsx` jsou TypeScript. Buď převést pricing na `.js`, nebo postupně přidat `tsconfig.json` a konzistentně používat TS tam, kde to dává smysl. |
| **API a tabulky** | `assistant-intake` → tabulka `registrations`; `body-metrics` → tabulka `body_metrics`. Pokud jsou to dva vstupy do stejného „produktu“, zvaž jednu tabulku (např. `leads` nebo `registrations` s rozšířenými sloupci) a jeden API endpoint, aby se předešlo duplicitě a rozdílnému chování. |

### 4.3 Stylování

| Problém | Návrh |
|--------|--------|
| **Tailwind třídy bez Tailwindu** | V `ProgramForm.js`, `LayoutSection.js`, `start.js` se používají třídy jako `max-w-3xl`, `bg-neutral-900`, `md:grid-cols-2`. V `package.json` není Tailwind – tyto třídy tedy nic nedělají. **Buď:** (a) přidat Tailwind (např. `tailwindcss` + PostCSS) a nastavit ho v projektu, **nebo** (b) přepsat tyto komponenty na globals.css / styled-jsx / CSS moduly podle zbytku projektu. |

### 4.4 Bezpečnost a provoz

| Návrh | Popis |
|-------|--------|
| **Validace vstupů v API** | V `body-metrics.js` už je základní validace (e-mail, výška, váha). V `assistant-intake.js` ověř alespoň povinná pole a délky (e-mail, jméno), popř. rate limiting pro ochranu před spamem. |
| **Env dokumentace** | Vytvoř soubor `.env.example` (bez citlivých hodnot) se všemi proměnnými: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SMTP_USER`, `SMTP_PASS` (pokud zůstanou), `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`. |
| **Chybové hlášky** | V některých API se vrací `message` z výjimky přímo do klienta. Pro produkci je vhodné vracet obecnější text a detaily logovat jen na serveru. |

### 4.5 UX a obsah

| Návrh | Popis |
|-------|--------|
| **Index odkazy** | Na `index.js` jsou odkazy na `https://app.bodyandmindon.cz/...`. Ověř, že tento doména a cesty odpovídají skutečnému nasazení (tento repo může být např. landing a app jiný projekt). |
| **Header navigace** | Odkazy „Ceník“, „Registrace“, „Přihlášení“ vedou na externí app. Pokud bude část stránek (pricing, registrace) v tomto repo, můžeš je přepnout na `Link href="/pricing"` atd. |

### 4.6 Volitelné vylepšení

- **Layout komponenta** – společný layout (Header + Footer) vytáhnout do jedné komponenty (např. `components/Layout.js`) a v stránkách ji obalit kolem obsahu, aby se nemusel Header/Footer opakovat.
- **Konstanty a mapování** – mapování hodnot (aktivita, stres, cíle, frekvence) z češtiny do DB kódů je v `body-metrics.js` i v `onboarding.js`/`pricing.js`/`register.js`. Zvaž sdílený modul (např. `lib/constants.js` nebo `lib/formMaps.js`) pro jednotné hodnoty a méně duplicity.
- **Resend** – v `package.json` je závislost `resend`, v kódu se nepoužívá (e-maily jdou přes Nodemailer). Buď přejít na Resend a odstranit Nodemailer, nebo Resend odstranit z dependencies.

---

## 5. Shrnutí priorit

1. **Hotovo:** oprava `/api/generate-plan` a sjednocení `globals.css`.
2. **Doporučeno brzy:** sjednotit Supabase a env v `assistant-intake.js`, vyjasnit e-mailové toky a doplnit `.env.example`.
3. **Podle času:** vyřešit Tailwind vs. ostatní styly, `index.html` vs. `public/` nebo `pages/landing.js`, společný Layout a sdílené konstanty pro formuláře.

Pokud chceš, můžeme v dalším kroku konkrétně upravit jen vybrané body (např. pouze `assistant-intake.js` a env, nebo pouze styly).
