# Nastavení API pro obrázky jídel a cviků

Pro zobrazení obrázků v jídelníčku a tréninkovém plánu potřebuješ nastavit externí API. Bez nich se zobrazí „Bez ověřeného obrázku“.

---

## 1. Spoonacular (obrázky jídel, recepty)

**Zdroj:** [spoonacular.com/food-api](https://spoonacular.com/food-api/console#Dashboard)

1. Zaregistruj se na [spoonacular.com](https://spoonacular.com/food-api)
2. Získej API klíč v Profile → API Key
3. Vercel → Settings → Environment Variables:
   ```
   SPOONACULAR_API_KEY=tvuj-api-klic
   ```

---

## 2. wger.de (obrázky a videa cviků)

**Zdroj:** [wger.de/api/v2](https://wger.de/api/v2/)

wger.de je veřejné API pro cviky – **nevyžaduje API klíč**. Projekt používá wger automaticky.

Žádná konfigurace není potřeba.

---

## Shrnutí env proměnných

| Proměnná | Povinné | Popis |
|----------|---------|-------|
| `SPOONACULAR_API_KEY` | Jídla | Přímý klíč ze spoonacular.com |

**Minimální konfigurace pro obrázky:**
- Jídla: `SPOONACULAR_API_KEY` (povinné)
- Cviky: wger.de – bez konfigurace (veřejné API)

---

## Ověření

### 1. Diagnostický endpoint (doporučeno)

Po nasazení otevři v prohlížeči:
```
https://tvoje-domena.vercel.app/api/verify-media-apis
```

Odpověď ukáže:
- `apis.spoonacular.working` – Spoonacular vrací data (jídla budou odpovídat)
- `apis.wger.working` – wger.de vrací data (cviky budou odpovídat)
- `summary.duvod_nesouladu_jidel` – vysvětlení, proč jídla nemusí sedět

Pokud `spoonacular.working === false`, obrázky jídel budou prázdné (placeholder).

### 2. Vercel Logs

V Vercel Logs hledej:
- `[plan-enrichment]` – diagnostika enrichmentu

Pokud vidíš `SPOONACULAR_API_KEY missing` – obrázky jídel se nebudou načítat.

---

## NEXT_PUBLIC_API_ONLY_MEDIA

Když je `true`, zobrazují se jen obrázky s `trust=exact` (Spoonacular, wger). Pro maximální pokrytí obrázků nastav na `false` nebo nevyplňuj.
