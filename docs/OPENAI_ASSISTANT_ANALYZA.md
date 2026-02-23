# Rozbor napojení OpenAI Assistant – Body & Mind ON

## 1. Aktuální architektura

### Tok generování plánu

**body-metrics (např. /start):**
```
POST /api/body-metrics → body_metrics (Supabase)
        ↓
generatePlanForEmail(email) → OpenAI Chat API (gpt-4o-mini)
        ↓
JSON { ok, metrics, html } → ai_generated_plans + sendPlanEmail()
```

**assistant-intake (např. VIP/Club formulář, webhook):**
```
POST /api/assistant-intake → registrations (Supabase)
        ↓
generatePlanAndSendFromParams(params) → generatePlanForEmail(bmOverride)
        ↓
Stejný OpenAI Chat API (SYS prompt) → ai_generated_plans + sendPlanEmail()
```

### Klíčové soubory

| Soubor | Úloha |
|--------|-------|
| `lib/generatePlan.js` | SYS prompt, volání OpenAI, parsování JSON, validace diet_type |
| `lib/openai.js` | OpenAI klient |
| `pages/api/body-metrics.js` | Přijímá data z /start, volá generatePlanForEmail |
| `pages/api/generate-plan.js` | Alternativní API – volá generatePlan(params) přímo |
| `pages/api/assistant-intake.js` | Ukládá do `registrations`, volá `generatePlanAndSendFromParams` → OpenAI → plán na e-mail |

### assistant-intake vs body-metrics

- **assistant-intake**: Ukládá do `registrations`, volá `generatePlanAndSendFromParams` → **OpenAI** vygeneruje plán → `sendPlanEmail` odešle **e-mail s plánem**. Vyžaduje výšku a váhu.
- **body-metrics**: Ukládá do `body_metrics`, volá `generatePlanForEmail` → **OpenAI** vygeneruje plán → `sendPlanEmail` odešle **e-mail s plánem**.

**Oba toky** generují plán přes OpenAI a odesílají e-mail s plánem (jídelníček, makra, trénink, suplementace).

## 2. Formát výstupu AI (od února 2025)

### JSON struktura

```json
{
  "ok": true,
  "metrics": {
    "bmr": number,
    "tdee": number,
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number
  },
  "html": "<h2>Tvůj plán...</h2>...",
  "mindset_tip": "jedna věta",
  "shopping_list": ["položka", ...]
}
```

### HTML sekce (parsuje PlanViewer)

- Tvoje čísla
- Denní cíle (makra)
- Jídelníček (7 dní)
- Trénink
- **Suplementace** (nově)
- Regenerace
- **Nákupní seznam na týden**
- **Mindset na tento týden**

## 3. DIET_TYPE a validace

| diet_type | Zákaz |
|-----------|-------|
| standard | — |
| vegetarian | maso, ryby, drůbež |
| vegan | + vejce, mléčné, syrovátka, med, želatina |

Funkce `planViolatesDiet(html, dietType)` kontroluje výstup před uložením. Při porušení se plán přegeneruje jednou.

## 4. Suplementace (dle diet_type)

- **standard**: D3, Omega 3
- **vegetarian**: D3, Omega 3, případně B12
- **vegan**: B12, DHA/EPA z řas, D3, Omega 3 z řas, případně jód. Nikdy syrovátkový protein.

## 5. Vegan zdroje bílkovin

Tofu, tempeh, luštěniny, čočka, fazole, cizrna, quinoa, rostlinné proteiny, ořechy, semínka.

## 6. PREFERENCES

Konkrétní potraviny z preferences se nikdy nezařazují. Makra se nemění, pouze se nahrazuje alternativou.
