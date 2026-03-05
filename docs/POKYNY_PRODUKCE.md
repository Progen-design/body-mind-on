# Pokyny pro nasazení do produkce – Body & Mind ON

Následující kroky je potřeba udělat **z tvé strany** (Stripe Dashboard, Vercel, Supabase). Kód je připraven k nasazení.

---

## 1. Stripe Dashboard

### 1.1 Klíče a Pricing Table
- **Developers → API keys**: Zkopíruj **Publishable key** (pk_live_...) a **Secret key** (sk_live_...) pro produkci. Pro testování můžeš zatím nechat pk_test_... a sk_test_....
- **Products → Pricing tables**: Ověř, že máš vytvořenou Pricing Table pro START předplatné (499 Kč/měsíc). Zkopíruj její **ID** (prctbl_...).

### 1.2 Webhook
1. V levém menu Stripe zvol **Developers** a pak záložku **Webhooks** (stránka „Trigger reactions in your integration with Stripe events“).
2. Klikni na fialové tlačítko **+ Add destination** (tím přidáš webhook endpoint).
3. V nastavení endpointu zadej **Endpoint URL**: `https://app.bodyandmindon.cz/api/webhooks/stripe`  
   (Pro preview/test můžeš použít např. `https://tvoje-preview-url.vercel.app/api/webhooks/stripe`.)
4. **Výběr událostí** (obrazovka „Start by selecting which events…“):
   - Použij **vyhledávací pole** „Find event by name or description…“ a hledej po jednom:
     - napiš **`checkout.session`** → zaškrtni **checkout.session.completed**
     - napiš **`customer.subscription`** → zaškrtni **customer.subscription.updated** a **customer.subscription.deleted**
   - Případně v seznamu vlevo rozklikni sekce **Checkout** (Checkout Session) a **Customer** (Subscription) a tam tyto tři události zaškrtni.
5. Klikni **Continue** a v dalším kroku zadej **Endpoint URL** (viz bod 3). Ulož. Na stránce endpointu zkopíruj **Signing secret** (začíná `whsec_...`).

### 1.3 Success URL (doporučeno)
- V nastavení **Payment Link** nebo **Pricing Table** (podle toho, co používáš) nastav **Success URL** na:  
  `https://app.bodyandmindon.cz/profil?payment=success`  
- Uživatel po platbě uvidí na profilu hlášku, že platba proběhla a přístup bude aktivní během chvíle.

---

## 2. Vercel (nebo jiný hosting)

### 2.1 Environment variables
V **Project → Settings → Environment Variables** nastav pro **Production** (a případně Preview):

| Proměnná | Hodnota | Poznámka |
|----------|---------|----------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | pk_live_... (nebo pk_test_...) | Veřejný klíč |
| `NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID` | prctbl_... | ID Pricing Table |
| `STRIPE_SECRET_KEY` | sk_live_... (nebo sk_test_...) | **Tajný** – pouze server |
| `STRIPE_WEBHOOK_SECRET` | whsec_... | Signing secret z webhooku |

Ostatní proměnné (Supabase, OpenAI, Gmail, CRON_SECRET, NEXT_PUBLIC_APP_URL atd.) už typicky máš; zkontroluj je podle `.env.example`.

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

## 4. Ověření po nasazení

1. **Profil bez Stripe klíčů**: Pokud v produkci zapomeneš nastavit `NEXT_PUBLIC_STRIPE_*`, na stránce profilu se po vypršení trialu nezobrazí platební tabulka (žádný fallback v kódu). To je záměr – v env musí být klíče.
2. **Test platby**: V testovacím režimu Stripe (pk_test_..., sk_test_..., whsec_... z test webhooku) proveď testovací platbu. Po dokončení by měl webhook zavolat `/api/webhooks/stripe` a v Supabase v tabulce `memberships` se u daného uživatele měl nastavit `status = 'active'` a `trial_ends_at = null`.
3. **Přístup po vypršení trialu**: Uživatel s vypršeným triálem a bez aktivního předplatného dostane u těchto akcí 403 s hláškou „Tvůj 7denní trial vypršel. Obnov předplatné na profilu.“:
   - Generování jídelníčku na příští týden
   - Odeslání plánu znovu na e-mail
   - Odeslání nákupního seznamu na e-mail
   - Přidání / smazání tréninku (workouts)
   - Přidání / smazání záznamu v habit trackeru

---

## 5. Shrnutí – co je potřeba udělat ty

| # | Kde | Co |
|---|-----|-----|
| 1 | Stripe | Webhook endpoint → URL + vybrat události, zkopírovat Signing secret |
| 2 | Stripe | (Doporučeno) Success URL na `/profil?payment=success` |
| 3 | Vercel | Nastavit 4 env: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| 4 | Supabase | Spustit migraci `20260308_memberships_stripe.sql` |
| 5 | Vercel | Redeploy po změně env |

Po těchto krocích je nasazení kompletní: platba přes Stripe aktualizuje členství a uživatelé s aktivním předplatným nebo platným triálem mají plný přístup k funkcím.
