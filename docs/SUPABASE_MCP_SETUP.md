# Supabase MCP – přímá komunikace s databází z Cursoru

> Umožňuje AI asistentovi (Composer) dotazovat se na Supabase, spouštět SQL, migrace a další.

---

## Proč to nefungovalo

1. **Cursor Supabase plugin** – používá `mcp_auth` (interaktivní přihlášení). Když se při volání zobrazí „Authenticate“ a ty klikneš **Skip**, připojení se nepovede.
2. **Projektový mcp.json** byl prázdný – žádný Supabase MCP server nebyl nakonfigurován.

---

## Řešení: lokální MCP server s tokenem z .env

### 1. Vytvoř Supabase Access Token

1. Jdi na **https://supabase.com/dashboard/account/tokens**
2. Klikni **Generate new token**
3. Název např. „Cursor MCP“
4. Zkopíruj token (zobrazí se jen jednou)

### 2. Přidej do .env

Do `.env` nebo `.env.local` přidej:

```
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxxxxxx
```

Můžeš použít i `SUPABASE_PAT` – skript bere oba varianty.

### 3. Restart Cursoru

1. Zavři Cursor
2. Znovu otevři projekt
3. Cursor načte MCP server z `.cursor/mcp.json`

### 4. Ověření

V chatu napiš: „Jaké tabulky jsou v databázi? Použij MCP tools.“

Měl bys vidět odpověď z Supabase (např. `list_tables` nebo `execute_sql`).

---

## Co je nakonfigurováno

| Soubor | Účel |
|--------|------|
| `.cursor/mcp.json` | Konfigurace MCP serveru – spouští `scripts/mcp-supabase-start.mjs` |
| `scripts/mcp-supabase-start.mjs` | Načte token z .env a spustí `@supabase/mcp-server-supabase` |

---

## Dostupné nástroje (po připojení)

- `execute_sql` – spouštění SQL dotazů
- `apply_migration` – aplikace migrací
- `list_tables` – seznam tabulek
- `list_migrations` – seznam migrací
- `generate_typescript_types` – generování typů ze schématu
- `get_logs` – logy

---

## Troubleshooting

| Problém | Řešení |
|---------|--------|
| „Chybí SUPABASE_ACCESS_TOKEN“ | Přidej token do .env nebo .env.local |
| MCP server se nespustí | Zkontroluj, že máš v `PATH` node a npx |
| Cursor nevidí MCP | Restart Cursoru, Settings → Tools & MCP – ověřit zelený status |
| „project_ref“ chyba | Projekt je `ipfyavvmmxmsjupmfnes` – nastav `SUPABASE_PROJECT_REF` v .env pokud máš jiný |
