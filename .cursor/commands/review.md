# Code review (diff vs main)

Projdi aktuální změny oproti větvi `main` a vypiš nálezy podle priority.

## Postup

1. Spusť `git diff main...HEAD` (nebo `git diff main` pro uncommitted změny).
2. Projdi každý změněný soubor systematicky.
3. Shrň nálezy do sekcí P0 / P1 / P2.

## Kontrolní body

### P0 — blokující před merge/deploy
- Secrets v kódu (API keys, tokens, `service_role`, connection strings)
- Chybějící RLS nebo otevřené tabulky bez policies
- `.env` nebo credential soubory v diffu
- Nevalidované vstupy v API routes (SQL injection, auth bypass)
- `service_role` klíč na klientu

### P1 — opravit brzy
- Chybějící error handling (try/catch, HTTP status codes, user-facing chyby)
- Hardcoded anglické UI stringy (má být čeština)
- Migrace bez popisného názvu nebo bez RLS dopadu
- Přímé DB změny mimo migrace

### P2 — vylepšení
- Nekonzistentní naming nebo pattern oproti okolním souborům
- Chybějící fallbacky v core flow (plán, e-mail)
- Nadbytečná komplexita nebo duplicitní logika

## Výstup

```markdown
## P0
- [soubor:řádek] popis

## P1
- …

## P2
- …

## Verdict
GO / NO-GO + stručné zdůvodnění
```
