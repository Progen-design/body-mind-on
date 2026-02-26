# Denní e-mail (cron)

Každý den dostane každý registrovaný uživatel e-mail s:

- **Co dnes jíst** – výpis z jeho AI plánu (jídelníček na aktuální den v týdnu)
- **Trénink dnes** – má-li na dnešek zapsaný trénink, shrnutí; jinak připomínka zapsat po cvičení
- **Doporučení** – krátký text, jak držet krok s cíli (váha, návyky, zapsat trénink)

## Jak to funguje

1. **Vercel Cron** každý den v **6:00 středoevropského času** (5:00 UTC) zavolá endpoint `GET /api/cron/daily-digest`.
2. Endpoint ověří hlavičku `Authorization: Bearer <CRON_SECRET>`.
3. Načte všechny uživatele (Supabase Auth Admin), pro každého s e-mailem:
   - načte aktuální plán (`ai_generated_plans`), tréninky na dnešek (`workouts`), metriky a návyky,
   - sestaví obsah (jídelníček na dnes, trénink, doporučení),
   - odešle e-mail přes Gmail (stejné SMTP jako zbytek aplikace).

## Nastavení

1. **Vercel – Environment Variables**
   - Přidej `CRON_SECRET` (např. `openssl rand -hex 32`) do **Production** (a volitelně Preview).
   - Vercel při volání cronu automaticky pošle `Authorization: Bearer <CRON_SECRET>`.

2. **E-mail**
   - Používá se stávající `GMAIL_USER` a `GMAIL_APP_PASSWORD` (stejně jako plán a nákupní seznam).

3. **Odkaz do aplikace**
   - V e-mailu je odkaz na `/profil`. Používá se `NEXT_PUBLIC_APP_URL` (nebo `APP_URL`).

## Ruční spuštění

Pro test můžeš endpoint zavolat ručně (s platným `CRON_SECRET`):

```bash
curl -H "Authorization: Bearer TVŮJ_CRON_SECRET" "https://app.bodyandmindon.cz/api/cron/daily-digest"
```

Odpověď: `{ "ok": true, "total": N, "sent": N }` nebo chyby pro konkrétní e-maily.

## Soubory

- `lib/dailyDigest.js` – extrakce jídel na dnes z `plan_html`, sestavení payloadu, odeslání e-mailu
- `pages/api/cron/daily-digest.js` – cron handler (list users → pro každého build + send)
- `vercel.json` – definice cronu (`0 5 * * *` = 5:00 UTC denně)
