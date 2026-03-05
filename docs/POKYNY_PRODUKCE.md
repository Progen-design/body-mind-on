# Pokyny pro nasazení do produkce – Body & Mind ON

Vše níže je určené **přímo pro produkci**: živé Stripe klíče, produkční webhook, produkční URL. Kód je připraven k nasazení.

**Checklist produkce:** Stripe (live klíče + webhook na app.bodyandmindon.cz) → Vercel (4 env s live hodnotami) → Supabase (migrace) → Redeploy.

---

## 1. Stripe Dashboard (Live režim)

V Stripe vlevo nahoře nech **vypnutý** Test mode – pracuješ s reálným účtem a živými klíči.

### 1.1 Klíče a Pricing Table
- **Developers → API keys**: Zkopíruj **Publishable key** (pk_live_...) a **Secret key** (sk_live_...) – používají se v produkci.
- **Products → Pricing tables**: Měj vytvořenou Pricing Table pro START předplatné (499 Kč/měsíc). Zkopíruj její **ID** (prctbl_...).

### 1.2 Webhook (produkční URL)
1. V levém menu Stripe zvol **Developers** a záložku **Webhooks**.
2. Klikni **+ Add destination**.
3. **Endpoint URL** zadej: `https://app.bodyandmindon.cz/api/webhooks/stripe`
4. **Výběr událostí** (obrazovka „Start by selecting which events…“):
   - Použij **vyhledávací pole** „Find event by name or description…“ a hledej po jednom:
     - napiš **`checkout.session`** → zaškrtni **checkout.session.completed**
     - napiš **`customer.subscription`** → zaškrtni **customer.subscription.updated** a **customer.subscription.deleted**
   - Případně v seznamu vlevo rozklikni sekce **Checkout** (Checkout Session) a **Customer** (Subscription) a tam tyto tři události zaškrtni.
5. Klikni **Continue** a v dalším kroku zadej **Endpoint URL** (viz bod 3). Ulož. Na stránce endpointu zkopíruj **Signing secret** (whsec_...) – ten dáš do Vercelu jako `STRIPE_WEBHOOK_SECRET`. Webhook musí být vytvořen v **Live** režimu (ne v Test mode).

### 1.3 Success URL (doporučeno)
- V nastavení **Payment Link** nebo **Pricing Table** (podle toho, co používáš) nastav **Success URL** na:  
  `https://app.bodyandmindon.cz/profil?payment=success`  
- Uživatel po platbě uvidí na profilu hlášku, že platba proběhla a přístup bude aktivní během chvíle.

---

## 2. Vercel (nebo jiný hosting)

### 2.1 Environment variables (pouze produkční hodnoty)
V **Project → Settings → Environment Variables** nastav pro **Production**:

| Proměnná | Hodnota | Poznámka |
|----------|---------|----------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | pk_live_... | Z Stripe API keys (Live) |
| `NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID` | prctbl_... | ID Pricing Table (Live) |
| `STRIPE_SECRET_KEY` | sk_live_... | Z Stripe API keys (Live), pouze server |
| `STRIPE_WEBHOOK_SECRET` | whsec_... | Signing secret z **produkčního** webhooku (Live) |

Ostatní proměnné (Supabase, OpenAI, Gmail, CRON_SECRET, NEXT_PUBLIC_APP_URL) zkontroluj podle `.env.example`.

### 2.2 Redeploy
Po přidání/změně env proměnných spusť **Redeploy** projektu (nebo push do main, pokud máš automatický deploy).

---

## 3. Supabase

### 3.1 Migrace
- V Supabase **SQL Editor** spusť obsah souboru  
  `supabase/migrations/20260308_memberships_stripe.sql`  
  (vytvoří tabulku `memberships`, pokud neexistuje, a přidá sloupce `stripe_customer_id`, `stripe_subscription_id`).
- Pokud tabulku `memberships` už máš z dřívějška, migrace jen doplní Stripe sloupce a RLS policy.

### 3.2 RLS
- Migrace zapne RLS na `memberships` a přidá policy „Users can read own membership“. Zápis do tabulky (registrace, webhook) dělá backend se **service role**, takže RLS pro zápis nepotřebuješ.

---

## 4. Ověření v produkci

1. **Stripe klíče**: V env musí být všechny 4 Stripe proměnné (live). Bez nich se na profilu po vypršení trialu nezobrazí platební tabulka.
2. **Webhook**: Po první reálné platbě zkontroluj **Stripe → Developers → Webhooks** (Live) → tvůj endpoint → **Recent deliveries**. Měl by být úspěšný (200) request na `checkout.session.completed`; pak v Supabase v `memberships` u daného uživatele `status = active`, `trial_ends_at = null`.
3. **Omezení po vypršení trialu**: Uživatel s vypršeným triálem a bez aktivního předplatného dostane 403 u těchto akcí: generování jídelníčku na další týden, odeslání plánu na e-mail, odeslání nákupního seznamu, přidání/smazání tréninku, přidání/smazání záznamu v habit trackeru.

---

## 5. Shrnutí – co je potřeba udělat ty (produkce)

| # | Kde | Co |
|---|-----|-----|
| 1 | Stripe | Webhook endpoint → URL + vybrat události, zkopírovat Signing secret |
| 2 | Stripe | (Doporučeno) Success URL na `/profil?payment=success` |
| 3 | Vercel | Nastavit 4 env: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| 4 | Supabase | Spustit migraci `20260308_memberships_stripe.sql` |
| 5 | Vercel | Redeploy po změně env |

Vše nastavuj v **Live** režimu Stripe (ne Test mode). Po nasazení platby v produkci běží normálně; po první platbě zkontroluj webhook deliveries a tabulku `memberships` v Supabase.

---

## 6. Volitelně: test před spuštěním (Stripe Test mode)

Chceš-li ověřit flow bez reálné platby: ve Stripe přepni na **Test mode**, vytvoř **testovací** webhook na stejnou URL (nebo preview URL), v Vercelu do Preview env dej testovací klíče (pk_test_, sk_test_, whsec_ z test webhooku). Pro zobrazení banneru a Stripe na profilu bez čekání 7 dní spusť lokálně `npm run test:expired-trial -- tvuj@email.cz` a použij testovací kartu `4242 4242 4242 4242`. Pro produkci tuto sekci ignoruj.
