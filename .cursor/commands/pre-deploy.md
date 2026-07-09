# Pre-deploy gate

Spusť kontroly před nasazením na produkci (Vercel Production / `main`).

## Příkazy (spusť postupně)

```bash
npm run lint:ci
npx tsc --noEmit -p jsconfig.json --jsx react --esModuleInterop --moduleResolution node --target ES2017 --lib dom,es2017
npm run build
```

Volitelně (pokud se měnil core flow):
```bash
npm run smoke-test:prod
```

## Výstup

```markdown
## Výsledky

| Kontrola   | Status | Poznámka |
|------------|--------|----------|
| lint:ci    | PASS/FAIL | … |
| typecheck  | PASS/FAIL | … |
| build      | PASS/FAIL | … |
| smoke (opt)| PASS/FAIL/SKIP | … |

## Verdict
**GO** — vše prošlo, lze pushnout na main a ověřit Vercel deploy.
**NO-GO** — opravit výše uvedené chyby před deployem.
```

Při NO-GO vypiš konkrétní chybové řádky z výstupu příkazů.
