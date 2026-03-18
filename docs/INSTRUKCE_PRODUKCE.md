# Instrukce pro produkci – Body & Mind ON

## Co je nasazeno

- **Aplikace:** https://app.bodyandmindon.cz
- **Zdroje dat pro plány:** výhradně tyto dvě platformy:
  - **Jídelníček:** [Spoonacular](https://spoonacular.com/food-api/console#Dashboard) – recepty, obrázky, nutriční hodnoty
  - **Trénink:** [wger.de](https://wger.de/api/v2/) – cviky, obrázky, videa

---

## 1. Environment Variables (Vercel)

V **Vercel → Project → Settings → Environment Variables** musí být nastaveno:

| Proměnná | Povinné | Popis |
|----------|---------|-------|
| `SPOONACULAR_API_KEY` | Ano | Klíč ze spoonacular.com (obrázky jídel) |
| `NEXT_PUBLIC_SUPABASE_URL` | Ano | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ano | Supabase anon key |
| `SUPABASE_URL` | Ano | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Ano | Supabase service role key |
| `OPENAI_API_KEY` | Ano | OpenAI API key pro AI plány |
| `GMAIL_USER` | Ano | E-mail pro odesílání |
| `GMAIL_APP_PASSWORD` | Ano | App password pro Gmail |
| `STRIPE_SECRET_KEY` | Ano | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Ano | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Ano | Stripe publishable key |
| `NEXT_PUBLIC_STRIPE_PRICING_TABLE_ID` | Ano | ID Pricing Table |
| `CRON_SECRET` | Ano | Pro cron endpointy |
| `ADMIN_TOKEN` | Volitelné | Pro admin panel |
| `NEXT_PUBLIC_APP_URL` | Ano | https://app.bodyandmindon.cz |

**Nepoužívané (odstranit z Vercel env):** `RAPIDAPI_KEY`, `EXERCISEDB_API_KEY`, `EXERCISEDB_API_HOST` – aplikace je bez RapidAPI

---

## 2. Ověření po deployi

1. **API ověření**  
   Otevři: https://app.bodyandmindon.cz/api/verify-media-apis  
   Očekávaný výstup:
   ```json
   {
     "apis": {
       "spoonacular": { "working": true },
       "wger": { "working": true }
     },
     "summary": { "jidla_ok": true, "cviky_ok": true }
   }
   ```

2. **Funkční test**
   - Přihlášení
   - Zobrazení plánu s jídly a cviky
   - Obrázky jídel (Spoonacular) a cviků (wger) se zobrazují

---

## 3. Spoonacular – denní limit

Free tier má limit bodů denně (reset cca půlnoc UTC).  
Při vyčerpání: `"Your daily points limit has been reached"` → obrázky jídel budou prázdné do resetu.

---

## 4. Lokální změny (necommitováno)

- **Smazané migrace** (`supabase/migrations/`) – nebyly commitovány. Pokud migrace už běžely v produkci, nemazat je.  
  Pokud chceš obnovit: `git restore supabase/migrations/`

- **`.env.production.local`** – obsahuje citlivé údaje, necommituj

---

## 5. Deploy příkazy

```bash
# Push na main
git add .
git commit -m "popis změn"
git push origin main

# Vercel deploy (automaticky po push, nebo ručně)
npx vercel --prod
```

---

## 6. Zdroje dokumentace

- **Spoonacular:** https://spoonacular.com/food-api  
- **wger:** https://wger.de/api/v2/  
- **Nastavení API:** `docs/NASTAVENI_API_OBRAZKY.md`
