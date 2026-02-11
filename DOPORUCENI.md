# Doporučení pro vylepšení projektu Body & Mind ON

## Co bylo provedeno (opravy)

- **Vizuál e-mailu** – Přepracovaná šablona v `lib/mail.js`: sjednocení s tmavým webem (fialové/tyrkysové akcenty), lepší hierarchie (nadpisy, odsazení), blok plánu s ohraničením, výrazné CTA tlačítko, dynamický rok v patičce. Přidány styly pro obsah plánu (h2, h3, ul, li) v hlavičce e-mailu.
- **Bezpečnost** – Sanitace HTML z AI před vložením do e-mailu (odstranění `<script>`, `<style>`, `<iframe>`, `on*` atributů). Validace e-mailu (regex) a rozumné limity pro výšku (100–250 cm), váhu (30–300 kg) a věk (15–120) v API `body-metrics`.
- **Konzistence** – Stránka `/start` nyní používá `Header` a `Footer` jako ostatní stránky.
- **Struktura** – `pages/index.html` (HeyGen iframe + redirect) byl přesunut do `public/heygen-redirect.html`. V Next.js Pages Router se v `pages/` berou pouze soubory pro routy (`.js`/`.tsx`), takže `index.html` tam nebyl jako route dostupný. Odkaz na stránku: **`/heygen-redirect.html`**.

---

## Doporučení k další úpravě

### 1. E-mail a SMTP

- **Sjednotit env pro e-maily**  
  V `lib/mail.js` jsou `GMAIL_USER` a `GMAIL_APP_PASSWORD`, v `pages/api/assistant-intake.js` jsou `SMTP_USER` a `SMTP_PASS`. Doporučení: používat jednu sadu (např. Gmail) a v `.env` mít jedny proměnné, v assistant-intake volat společnou funkci pro odeslání nebo stejné env.
- **Resend**  
  V `package.json` je závislost `resend` – zatím se nepoužívá. Buď přejít na Resend pro odesílání (jednodušší API, lepší deliverability), nebo závislost odstranit.
- **Plain-text verze**  
  Pro lepší deliverability a přístupnost přidat k HTML e-mailu i plain-text verzi (např. `text` v `sendMail`).

### 2. API a bezpečnost

- **Rate limiting**  
  Endpointy `POST /api/body-metrics` a případně `POST /api/assistant-intake` by měly mít omezení počtu požadavků (např. 5–10 za 15 minut na IP nebo na e-mail), aby nedocházelo ke zneužití a přetížení AI/mailu.
- **assistant-intake vs body-metrics**  
  Dva podobné vstupy: `assistant-intake` ukládá do tabulky `registrations` a posílá jiný e-mail, `body-metrics` ukládá do `body_metrics` a spouští generování plánu. Stojí za úvahu sjednotit na jeden flow (např. jen `body-metrics` + jeden typ e-mailu) nebo jasně oddokumentovat rozdíl a kdy který endpoint volat.
- **Supabase v assistant-intake**  
  Používá se `SUPABASE_KEY`; v ostatních částech projektu je `SUPABASE_SERVICE_ROLE_KEY`. Ověřit, zda má být pro zápis do DB service role a env sjednotit.

### 3. Frontend a UX

- **Loading stav na /start**  
  Během „Odesílám...“ zakázat tlačítko a zobrazit např. spinner, aby uživatel neodeslal formulář vícekrát.
- **Chybové hlášky z API**  
  Zobrazovat uživateli konkrétní text z `result.error` (už se částečně dělá); u validace výška/váha/věk/e-mail zobrazit přesně tu hlášku, kterou vrací backend.
- **Přístupnost**  
  U formulářů doplnit `label` pro všechny prvky (již částečně), u CTA tlačítek v e-mailu ponechat dostatečný kontrast (aktuálně fialové na tmavém pozadí – ověřit v mail klientech).

### 4. E-mail – další vylepšení vizuálu

- **Obrázek / logo v hlavičce**  
  Přidat malý obrázek (logo nebo ikona) do hlavičky e-mailu – hostovaný na CDN nebo vlastní doméně. V Gmailu/Outlooku používat absolutní URL a `width`/`height` v px.
- **Mobile**  
  Šablona je responzivní díky `max-width` a paddingům; na velmi malých displejích zkontrolovat čitelnost a velikost CTA tlačítka.
- **A/B test předmětu**  
  Zkusit varianty předmětu (např. s/bez emoji, kratší text) a sledovat otevíranost.

### 5. Provoz a monitoring

- **Logování chyb**  
  Při selhání `sendPlanEmail` nebo `generatePlanForEmail` ukládat chybu do DB nebo externí služby (např. Sentry), nejen `console.error`.
- **Health check**  
  Přidat např. `GET /api/health`, který ověří připojení k Supabase (a volitelně OpenAI), pro monitoring uptime.

### 6. Struktura a kód

- **Jedna knihovna pro Supabase (server)**  
  V `admin.js` je vlastní `getServerSupabase()`, v zbytku projektu `lib/supabaseServer.js`. Sjednotit na import z `lib/supabaseServer.js` i v adminu (pokud nemáš důvod mít jinou konfiguraci).
- **Konstanty URL**  
  URL `https://app.bodyandmindon.cz` a `https://www.bodyandmindon.cz` jsou na více místech. Vytvořit např. `lib/constants.js` s `APP_URL` a `WEB_URL` a používat je v mail.js, stránkách a odkazech.

---

Shrnutí: nejdřív doporučuji sjednotit e-mailové env a jeden registrační flow, přidat rate limiting a plain-text verzi e-mailu. Vizuál e-mailu je upraven tak, aby byl sjednocený s webem a přehledný; další krok je doplnit logo a případně doladit barvy podle brandu.
