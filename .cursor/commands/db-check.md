# DB + RLS check (Supabase MCP)

Ověř, že tabulky dotčené aktuálním diffem mají zapnuté RLS a smysluplné policies.

## Postup

1. Zjisti změněné soubory: `git diff main...HEAD --name-only` (případně i uncommitted).
2. Z diffu a SQL/migrací vyextrahuj názvy tabulek (`CREATE TABLE`, `.from('…')`, `supabase/migrations/`).
3. Přes **Supabase MCP** (`project-0-body-mind-on-supabase` nebo `plugin-supabase-supabase`):
   - `list_tables` — ověř existenci tabulek
   - Pro každou dotčenou tabulku zkontroluj RLS policies (SQL dotaz nebo MCP nástroj pro policies)
4. Pokud tabulka nemá RLS nebo policies, označ jako **P0**.

## Kontrolní seznam

| Tabulka | V diffu | RLS enabled | Policies | Poznámka |
|---------|---------|-------------|----------|----------|
| …       | ano/ne  | ano/ne      | popis    | …        |

## Výstup

- Seznam dotčených tabulek
- Tabulky bez RLS → P0
- Tabulky s RLS ale chybějící policy pro novou operaci → P1
- **Verdict:** GO pokud všechny dotčené tabulky mají RLS + policies; jinak NO-GO
