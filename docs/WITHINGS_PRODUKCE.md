# Withings produkční integrace

Cíl: propojit chytrou váhu Withings s aplikací Body & Mind ON přes produkční HTTPS callback na `app.bodyandmindon.cz`.

## Stav v aplikaci

Přidané endpointy:

- `GET/POST /api/withings/auth` – založí bezpečný OAuth state a vrátí / provede redirect do Withings.
- `GET /api/withings/callback` – přijme `code`, vymění ho za tokeny a uloží propojení.
- `GET/POST /api/withings/sync` – stáhne měření z Withings a uloží je do Supabase.
- `GET /api/withings/latest` – vrátí stav propojení a poslední uložené hodnoty.
- `/withings-connect` – jednoduchá stránka pro připojení účtu a ruční synchronizaci.

## Callback URL ve Withings dashboardu

Nastav přesně:

```text
https://app.bodyandmindon.cz/api/withings/callback
```

`localhost` nech jen pro lokální vývoj. Pro ostrý provoz musí být callback veřejná HTTPS URL.

## Vercel env

Do Vercel Production env doplň:

```text
WITHINGS_CLIENT_ID=...
WITHINGS_CLIENT_SECRET=...
WITHINGS_REDIRECT_URI=https://app.bodyandmindon.cz/api/withings/callback
WITHINGS_API_URL=https://wbsapi.withings.net
WITHINGS_SCOPES=user.info,user.metrics,user.activity
WITHINGS_TOKEN_ENCRYPTION_KEY=...
```

Šifrovací klíč vygeneruj lokálně:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Hodnotu nikdy nedávej do frontendu ani do veřejného GitHubu.

## Databáze

Migrace vytváří tabulky:

- `withings_oauth_states` – krátkodobý CSRF state pro OAuth.
- `withings_connections` – šifrované OAuth tokeny a stav syncu.
- `withings_measurements` – uložené hodnoty z váhy a dalších Withings měření.

Tabulky jsou přes RLS uzavřené pro `anon` i `authenticated`. Aplikace k nim přistupuje přes serverový Supabase service role klient.

## Test po nasazení

1. Otevři `https://app.bodyandmindon.cz/withings-connect`.
2. Přihlas se do Body & Mind ON.
3. Klikni na `Propojit Withings`.
4. Schval přístup ve Withings.
5. Po návratu zkontroluj stav propojení a poslední váhu.
6. Klikni na `Synchronizovat teď`.

## Quality Gate

- Callback URL ve Withings dashboardu se musí přesně shodovat s Vercel env.
- `WITHINGS_CLIENT_SECRET` a šifrovací klíč jsou pouze serverové env proměnné.
- `GET /api/withings/latest` bez Bearer tokenu vrací 401.
- Po propojení existuje řádek ve `withings_connections`.
- Po syncu existují řádky ve `withings_measurements`.
- V prohlížeči se nikdy nezobrazuje access token ani refresh token.

## Další krok pro scale

Až bude ruční sync stabilní, přidej notifikace/webhooky Withings. Webhook jen oznámí, že jsou nová data; backend si potom data znovu stáhne přes Data API.
